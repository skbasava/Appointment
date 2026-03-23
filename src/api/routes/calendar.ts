import { Context } from 'hono';
import { Env, CalendarConnection } from '../../db/types';
import { getCalendarConnectionByProvider, upsertCalendarConnection, updateCalendarStatus } from '../../db/queries/calendar';
import { ValidationError, NotFoundError } from '../middleware/error';
import { GoogleCalendarClient, refreshAccessToken } from '../../lib/calendar/client';

function authUserId(c: Context<{ Bindings: Env }>): string {
  return (c as any).get('userId');
}

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

  return c.redirect(authUrl.toString());
}

export async function calendarCallback(c: Context<{ Bindings: Env }>): Promise<Response> {
  const code = c.req.query('code');
  const rawState = c.req.query('state') || '';
  const error = c.req.query('error');

  // Parse providerId:chatId from state
  const lastColon = rawState.lastIndexOf(':');
  const providerId = lastColon > 0 ? rawState.substring(0, lastColon) : rawState;
  const chatId = lastColon > 0 ? rawState.substring(lastColon + 1) : null;

  if (error) {
    return c.html(`<h1>❌ Calendar connection failed</h1><p>${error}</p><p>You can close this window.</p>`);
  }

  if (!code || !providerId) {
    return c.html(`<h1>❌ Missing parameters</h1><p>You can close this window.</p>`, 400);
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

  // Notify Telegram if chatId is available
  if (chatId && c.env.TELEGRAM_BOT_TOKEN) {
    let advancedSession = false;

    // Advance onboarding session if in calendar step
    try {
      const sessionRows = await c.env.DB.prepare(
        `SELECT session_key, data FROM onboarding_sessions WHERE step = 'doctor_calendar'`
      ).all();
      for (const row of (sessionRows.results as any[])) {
        const data = JSON.parse(row.data || '{}');
        if (data.doctorId === providerId) {
          await c.env.DB.prepare(
            `UPDATE onboarding_sessions SET step = 'clinic_name', updated_at = ? WHERE session_key = ?`
          ).bind(Math.floor(Date.now() / 1000), row.session_key).run();
          advancedSession = true;
          break;
        }
      }
    } catch (e) {
      console.error('Failed to advance onboarding session:', e);
    }

    // Send message with next step prompt
    const nextStepText = advancedSession
      ? `\n\n🏥 Enter your clinic/hospital name (where you see patients):`
      : `\n\nYou can close this window and go back to Telegram.`;

    try {
      await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Google Calendar connected! (${calendarId})${nextStepText}`,
          parse_mode: 'HTML',
        }),
      });
    } catch (e) {
      console.error('Failed to notify Telegram:', e);
    }
  }

  return c.html(`<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calendar Connected</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}
.box{text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{color:#22c55e;font-size:2rem}p{color:#666;font-size:1.1rem}</style></head>
<body><div class="box"><h1>✅ Calendar Connected!</h1><p>${calendarId}</p><p>You can close this window and go back to Telegram.</p></div></body></html>`);
}

export async function getCalendarStatus(c: Context<{ Bindings: Env }>): Promise<Response> {
  const userId = authUserId(c);
  if (!userId) {
    throw new ValidationError('Not authenticated');
  }

  const providerId = c.req.param('id');
  if (userId !== providerId) {
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
  const userId = authUserId(c);
  if (!userId) {
    throw new ValidationError('Not authenticated');
  }

  const providerId = c.req.param('id');
  if (userId !== providerId) {
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
  const userId = authUserId(c);
  if (!userId) {
    throw new ValidationError('Not authenticated');
  }

  const providerId = c.req.param('id');
  if (userId !== providerId) {
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
  const userId = authUserId(c);
  if (!userId) {
    throw new ValidationError('Not authenticated');
  }

  const providerId = c.req.param('id');
  if (userId !== providerId) {
    throw new ValidationError('You can only disconnect your own calendar');
  }

  await updateCalendarStatus(c.env.DB, providerId, 'revoked');

  return c.json({ message: 'Calendar disconnected successfully' });
}
