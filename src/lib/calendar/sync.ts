import { Env, Appointment, CalendarConnection } from '../../db/types';
import { GoogleCalendarClient, refreshAccessToken } from './client';
import { getCalendarConnectionByProvider, updateCalendarTokens } from '../../db/queries/calendar';
import { updateAppointmentStatus } from '../../db/queries/appointments';

export async function getCalendarClientForProvider(
  env: Env,
  providerId: string
): Promise<GoogleCalendarClient | null> {
  const connection = await getCalendarConnectionByProvider(env.DB, providerId);

  if (!connection || connection.status !== 'connected') {
    return null;
  }

  const calendarId = connection.google_calendar_id || 'primary';

  // Check if token needs refresh
  const now = Math.floor(Date.now() / 1000);
  if (connection.token_expires_at - now < 300) {
    // Refresh if less than 5 minutes left
    try {
      const newTokens = await refreshAccessToken(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        connection.refresh_token
      );

      await updateCalendarTokens(
        env.DB,
        providerId,
        newTokens.access_token,
        connection.refresh_token,
        now + newTokens.expires_in
      );

      return new GoogleCalendarClient(newTokens.access_token, calendarId);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return new GoogleCalendarClient(connection.access_token, calendarId);
}

export async function syncAppointmentToCalendar(
  env: Env,
  appointment: Appointment,
  serviceName: string,
  providerName: string
): Promise<string | null> {
  const client = await getCalendarClientForProvider(env, appointment.provider_id);

  if (!client) {
    console.log('Calendar not connected for provider:', appointment.provider_id);
    return null;
  }

  try {
    const event = await client.createEvent({
      summary: `Appointment: ${serviceName}`,
      description: `Appointment with ${appointment.customer_name}\nProvider: ${providerName}`,
      startTime: new Date(appointment.start_time * 1000),
      endTime: new Date(appointment.end_time * 1000),
    });

    console.log('Calendar event created:', event.id);
    return event.id;
  } catch (error) {
    console.error('Failed to sync appointment to calendar:', error);
    return null;
  }
}

export async function updateCalendarEvent(
  env: Env,
  appointment: Appointment,
  serviceName: string
): Promise<boolean> {
  if (!appointment.google_event_id) {
    return false;
  }

  const client = await getCalendarClientForProvider(env, appointment.provider_id);

  if (!client) {
    return false;
  }

  try {
    await client.updateEvent(appointment.google_event_id, {
      summary: `Appointment: ${serviceName}`,
      startTime: new Date(appointment.start_time * 1000),
      endTime: new Date(appointment.end_time * 1000),
    });
    return true;
  } catch (error) {
    console.error('Failed to update calendar event:', error);
    return false;
  }
}

export async function deleteCalendarEvent(
  env: Env,
  appointment: Appointment
): Promise<boolean> {
  if (!appointment.google_event_id) {
    return true; // No event to delete
  }

  const client = await getCalendarClientForProvider(env, appointment.provider_id);

  if (!client) {
    return false;
  }

  try {
    await client.deleteEvent(appointment.google_event_id);
    return true;
  } catch (error) {
    console.error('Failed to delete calendar event:', error);
    return false;
  }
}

export async function checkCalendarConflicts(
  env: Env,
  providerId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const client = await getCalendarClientForProvider(env, providerId);

  if (!client) {
    return false; // No calendar connected, no conflicts
  }

  return client.hasConflict(startTime, endTime);
}
