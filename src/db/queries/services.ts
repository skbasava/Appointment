import { Service } from '../types';

export async function createService(db: D1Database, service: Omit<Service, 'created_at'>): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'INSERT INTO services (id, provider_id, name, description, duration_minutes, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    service.id, service.provider_id, service.name,
    service.description, service.duration_minutes, service.is_active, now
  ).run();
}

export async function getServiceById(db: D1Database, id: string): Promise<Service | null> {
  const result = await db.prepare('SELECT * FROM services WHERE id = ?').bind(id).first<Service>();
  return result || null;
}

export async function getServicesByProvider(db: D1Database, providerId: string): Promise<Service[]> {
  const results = await db.prepare('SELECT * FROM services WHERE provider_id = ? AND is_active = 1').bind(providerId).all<Service>();
  return results.results;
}

export async function updateService(db: D1Database, id: string, updates: Partial<Omit<Service, 'id' | 'provider_id' | 'created_at'>>): Promise<void> {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  await db.prepare(`UPDATE services SET ${fields} WHERE id = ?`).bind(...values, id).run();
}

export async function deleteService(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').bind(id).run();
}
