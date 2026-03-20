import { Notification } from '../types';

export async function createNotification(db: D1Database, notification: Omit<Notification, 'created_at'>): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'INSERT INTO notifications (id, appointment_id, channel, type, status, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    notification.id, notification.appointment_id, notification.channel,
    notification.type, notification.status, notification.sent_at, now
  ).run();
}

export async function getNotificationsByAppointment(db: D1Database, appointmentId: string): Promise<Notification[]> {
  const results = await db.prepare('SELECT * FROM notifications WHERE appointment_id = ? ORDER BY created_at DESC').bind(appointmentId).all<Notification>();
  return results.results;
}

export async function updateNotificationStatus(db: D1Database, id: string, status: Notification['status']): Promise<void> {
  const sentAt = status === 'sent' ? Math.floor(Date.now() / 1000) : null;
  await db.prepare('UPDATE notifications SET status = ?, sent_at = ? WHERE id = ?').bind(status, sentAt, id).run();
}

export async function getPendingNotifications(db: D1Database): Promise<Notification[]> {
  const results = await db.prepare('SELECT * FROM notifications WHERE status = ? ORDER BY created_at ASC').bind('pending').all<Notification>();
  return results.results;
}

export async function getNotificationsForReminder(db: D1Database, appointmentStartTime: number, reminderWindowSeconds: number): Promise<Notification[]> {
  const now = Math.floor(Date.now() / 1000);
  const results = await db.prepare(
    `SELECT n.* FROM notifications n
     JOIN appointments a ON n.appointment_id = a.id
     WHERE n.type = ? AND n.status = ?
     AND a.start_time > ? AND a.start_time <= ?`
  ).bind('reminder', 'pending', now, now + reminderWindowSeconds).all<Notification>();
  return results.results;
}
