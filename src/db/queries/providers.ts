import { Provider, Env } from '../types';

export async function createProvider(db: D1Database, provider: Omit<Provider, 'created_at' | 'updated_at'>): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'INSERT INTO providers (id, type, name, email, phone, firebase_uid, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    provider.id, provider.type, provider.name, provider.email,
    provider.phone, provider.firebase_uid, provider.timezone,
    provider.status, now, now
  ).run();
}

export async function getProviderById(db: D1Database, id: string): Promise<Provider | null> {
  const result = await db.prepare('SELECT * FROM providers WHERE id = ?').bind(id).first<Provider>();
  return result || null;
}

export async function getProviderByFirebaseUid(db: D1Database, firebaseUid: string): Promise<Provider | null> {
  const result = await db.prepare('SELECT * FROM providers WHERE firebase_uid = ?').bind(firebaseUid).first<Provider>();
  return result || null;
}

export async function updateProviderStatus(db: D1Database, id: string, status: Provider['status']): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE providers SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, id).run();
}

export async function listProviders(db: D1Database, limit = 50, offset = 0): Promise<Provider[]> {
  const results = await db.prepare('SELECT * FROM providers ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all<Provider>();
  return results.results;
}

export async function getActiveDoctors(db: D1Database, limit = 20, offset = 0) {
  const results = await db.prepare(
    'SELECT id, name, phone, platform, platform_user_id FROM providers WHERE type = ? AND status = ? ORDER BY name ASC LIMIT ? OFFSET ?'
  ).bind('doctor', 'active', limit, offset).all();
  return results.results;
}

export async function getProviderByPlatformUserId(db: D1Database, platformUserId: string) {
  return await db.prepare(
    'SELECT * FROM providers WHERE platform_user_id = ?'
  ).bind(platformUserId).first();
}
