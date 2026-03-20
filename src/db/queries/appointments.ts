import { Appointment } from '../types';

export async function createAppointment(db: D1Database, appointment: Omit<Appointment, 'created_at' | 'updated_at'>): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'INSERT INTO appointments (id, provider_id, service_id, customer_telegram_id, customer_name, start_time, end_time, status, google_event_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    appointment.id, appointment.provider_id, appointment.service_id,
    appointment.customer_telegram_id, appointment.customer_name,
    appointment.start_time, appointment.end_time, appointment.status,
    appointment.google_event_id, now, now
  ).run();
}

export async function getAppointmentById(db: D1Database, id: string): Promise<Appointment | null> {
  const result = await db.prepare('SELECT * FROM appointments WHERE id = ?').bind(id).first<Appointment>();
  return result || null;
}

export async function getAppointmentsByCustomer(db: D1Database, customerTelegramId: string): Promise<Appointment[]> {
  const results = await db.prepare('SELECT * FROM appointments WHERE customer_telegram_id = ? ORDER BY start_time DESC').bind(customerTelegramId).all<Appointment>();
  return results.results;
}

export async function getAppointmentsByProvider(db: D1Database, providerId: string): Promise<Appointment[]> {
  const results = await db.prepare('SELECT * FROM appointments WHERE provider_id = ? ORDER BY start_time DESC').bind(providerId).all<Appointment>();
  return results.results;
}

export async function updateAppointmentStatus(db: D1Database, id: string, status: Appointment['status'], googleEventId?: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (googleEventId !== undefined) {
    await db.prepare('UPDATE appointments SET status = ?, google_event_id = ?, updated_at = ? WHERE id = ?').bind(status, googleEventId, now, id).run();
  } else {
    await db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, id).run();
  }
}

export async function updateAppointmentTime(db: D1Database, id: string, startTime: number, endTime: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE appointments SET start_time = ?, end_time = ?, status = ?, updated_at = ? WHERE id = ?').bind(startTime, endTime, 'rescheduled', now, id).run();
}

export async function getConflictingAppointments(db: D1Database, providerId: string, startTime: number, endTime: number, excludeId?: string): Promise<Appointment[]> {
  let query = 'SELECT * FROM appointments WHERE provider_id = ? AND status != ? AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))';
  const bindings: any[] = [providerId, 'cancelled', endTime, startTime, endTime, startTime, startTime, endTime];
  if (excludeId) {
    query += ' AND id != ?';
    bindings.push(excludeId);
  }
  const results = await db.prepare(query).bind(...bindings).all<Appointment>();
  return results.results;
}

export async function getUpcomingAppointments(db: D1Database, beforeTime: number): Promise<Appointment[]> {
  const results = await db.prepare('SELECT * FROM appointments WHERE start_time > ? AND status IN (?, ?) ORDER BY start_time ASC').bind(beforeTime, 'pending', 'confirmed').all<Appointment>();
  return results.results;
}
