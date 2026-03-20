import { CalendarConnection } from '../types';

export async function upsertCalendarConnection(db: D1Database, connection: Omit<CalendarConnection, 'last_synced_at'>): Promise<void> {
  await db.prepare(
    `INSERT INTO calendar_connections (id, provider_id, google_calendar_id, access_token, refresh_token, token_expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       google_calendar_id = excluded.google_calendar_id,
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       token_expires_at = excluded.token_expires_at,
       status = excluded.status`
  ).bind(
    connection.id, connection.provider_id, connection.google_calendar_id,
    connection.access_token, connection.refresh_token,
    connection.token_expires_at, connection.status
  ).run();
}

export async function getCalendarConnectionByProvider(db: D1Database, providerId: string): Promise<CalendarConnection | null> {
  const result = await db.prepare('SELECT * FROM calendar_connections WHERE provider_id = ?').bind(providerId).first<CalendarConnection>();
  return result || null;
}

export async function updateCalendarTokens(db: D1Database, providerId: string, accessToken: string, refreshToken: string, expiresAt: number): Promise<void> {
  await db.prepare('UPDATE calendar_connections SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE provider_id = ?').bind(accessToken, refreshToken, expiresAt, providerId).run();
}

export async function updateCalendarStatus(db: D1Database, providerId: string, status: CalendarConnection['status']): Promise<void> {
  await db.prepare('UPDATE calendar_connections SET status = ? WHERE provider_id = ?').bind(status, providerId).run();
}

export async function updateLastSynced(db: D1Database, providerId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE calendar_connections SET last_synced_at = ? WHERE provider_id = ?').bind(now, providerId).run();
}
