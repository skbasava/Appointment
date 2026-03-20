import { Context } from 'hono';
import { Env, CalendarConnection } from '../../db/types';
import { getCalendarConnectionByProvider, upsertCalendarConnection, updateCalendarStatus } from '../../db/queries/calendar';
import { ValidationError, NotFoundError } from '../middleware/error';
import { getProvider } from '../../lib/auth/firebase';
import { GoogleCalendarClient, refreshAccessToken } from '../../lib/calendar/client';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Public endpoint to get OAuth URL (no auth required for initial connection)
export async function getCalendarOAuthUrl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const providerId = c.req.param('id');
  
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', c.env.GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', providerId);

  return c.json({ auth_url: authUrl.toString() });
}

export async function calendarCallback(c: Context<{ Bindings: Env }>): Promise<Response> {
  const code = c.req.query('code');
  const providerId = c.req.query('state'); // Get provider_id from state parameter
  const error = c.req.query('error');

  if (error) {
    return c.json({ error: 'Calendar connection failed: ' + error }, 400);
  }

  if (!code || !providerId) {
    throw new ValidationError('Code and state (provider_id) are required');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    console.error('Token exchange failed:', await tokenResponse.text());
    return c.json({ error: 'Failed to obtain calendar access' }, 500);
  }

  const tokens = await tokenResponse.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Try to get the user's primary calendar
  let calendarId = 'primary';
  try {
    const client = new GoogleCalendarClient(tokens.access_token);
    const calendars = await client.listCalendars();
    const primaryCalendar = calendars.find(cal => cal.primary);
    if (primaryCalendar) {
      calendarId = primaryCalendar.id;
    }
  } catch (e) {
    console.log('Could not fetch calendar list, using primary');
  }

  // Store connection
  const connection: Omit<CalendarConnection, 'last_synced_at'> = {
    id: crypto.randomUUID(),
    provider_id: providerId,
    google_calendar_id: calendarId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    status: 'connected',
  };

  await upsertCalendarConnection(c.env.DB, connection);

  return c.json({ 
    message: 'Calendar connected successfully',
    calendar_id: calendarId,
  });
}

export async function getCalendarStatus(c: Context<{ Bindings: Env }>): Promise<Response> {
  const provider = getProvider(c);
  if (!provider) {
    throw new ValidationError('Provider not found');
  }

  const providerId = c.req.param('id');
  if (provider.id !== providerId) {
    throw new ValidationError('You can only view your own calendar status');
  }

  const connection = await getCalendarConnectionByProvider(c.env.DB, providerId);

  if (!connection) {
    return c.json({ connected: false });
  }

  return c.json({
    connected: true,
    status: connection.status,
    calendar_id: connection.google_calendar_id,
    last_synced_at: connection.last_synced_at,
  });
}

export async function listCalendars(c: Context<{ Bindings: Env }>): Promise<Response> {
  const provider = getProvider(c);
  if (!provider) {
    throw new ValidationError('Provider not found');
  }

  const providerId = c.req.param('id');
  if (provider.id !== providerId) {
    throw new ValidationError('You can only view your own calendars');
  }

  const connection = await getCalendarConnectionByProvider(c.env.DB, providerId);

  if (!connection || connection.status !== 'connected') {
    throw new ValidationError('Calendar not connected');
  }

  let accessToken = connection.access_token;
  const now = Math.floor(Date.now() / 1000);

  // Refresh token if needed
  if (connection.token_expires_at - now < 300) {
    try {
      const newTokens = await refreshAccessToken(
        c.env.GOOGLE_CLIENT_ID,
        c.env.GOOGLE_CLIENT_SECRET,
        connection.refresh_token
      );
      accessToken = newTokens.access_token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
  }

  const client = new GoogleCalendarClient(accessToken);
  const calendars = await client.listCalendars();

  return c.json({ 
    calendars,
    current_calendar_id: connection.google_calendar_id,
  });
}

export async function selectCalendar(c: Context<{ Bindings: Env }>): Promise<Response> {
  const provider = getProvider(c);
  if (!provider) {
    throw new ValidationError('Provider not found');
  }

  const providerId = c.req.param('id');
  if (provider.id !== providerId) {
    throw new ValidationError('You can only update your own calendar');
  }

  const body = await c.req.json();
  const { calendar_id } = body;

  if (!calendar_id) {
    throw new ValidationError('calendar_id is required');
  }

  const connection = await getCalendarConnectionByProvider(c.env.DB, providerId);

  if (!connection || connection.status !== 'connected') {
    throw new ValidationError('Calendar not connected');
  }

  // Update the calendar ID
  await upsertCalendarConnection(c.env.DB, {
    ...connection,
    google_calendar_id: calendar_id,
  });

  return c.json({ 
    message: 'Calendar updated successfully',
    calendar_id,
  });
}

export async function disconnectCalendar(c: Context<{ Bindings: Env }>): Promise<Response> {
  const provider = getProvider(c);
  if (!provider) {
    throw new ValidationError('Provider not found');
  }

  const providerId = c.req.param('id');
  if (provider.id !== providerId) {
    throw new ValidationError('You can only disconnect your own calendar');
  }

  await updateCalendarStatus(c.env.DB, providerId, 'revoked');

  return c.json({ message: 'Calendar disconnected successfully' });
}
