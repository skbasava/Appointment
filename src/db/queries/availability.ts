import { AvailabilityWindow, BlockedDate } from '../types';

export async function createAvailabilityWindow(db: D1Database, window: Omit<AvailabilityWindow, 'id'> & { id: string }): Promise<void> {
  await db.prepare(
    'INSERT INTO availability_windows (id, provider_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    window.id, window.provider_id, window.day_of_week,
    window.start_time, window.end_time, window.is_active
  ).run();
}

export async function getAvailabilityByProvider(db: D1Database, providerId: string): Promise<AvailabilityWindow[]> {
  const results = await db.prepare('SELECT * FROM availability_windows WHERE provider_id = ? AND is_active = 1 ORDER BY day_of_week, start_time').bind(providerId).all<AvailabilityWindow>();
  return results.results;
}

export async function updateAvailabilityWindow(db: D1Database, id: string, updates: Partial<Omit<AvailabilityWindow, 'id' | 'provider_id'>>): Promise<void> {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  await db.prepare(`UPDATE availability_windows SET ${fields} WHERE id = ?`).bind(...values, id).run();
}

export async function deleteAvailabilityWindow(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE availability_windows SET is_active = 0 WHERE id = ?').bind(id).run();
}

export async function createBlockedDate(db: D1Database, blockedDate: Omit<BlockedDate, 'id'> & { id: string }): Promise<void> {
  await db.prepare(
    'INSERT INTO blocked_dates (id, provider_id, date, reason) VALUES (?, ?, ?, ?)'
  ).bind(
    blockedDate.id, blockedDate.provider_id, blockedDate.date, blockedDate.reason
  ).run();
}

export async function getBlockedDatesByProvider(db: D1Database, providerId: string): Promise<BlockedDate[]> {
  const results = await db.prepare('SELECT * FROM blocked_dates WHERE provider_id = ? ORDER BY date').bind(providerId).all<BlockedDate>();
  return results.results;
}

export async function deleteBlockedDate(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM blocked_dates WHERE id = ?').bind(id).run();
}
