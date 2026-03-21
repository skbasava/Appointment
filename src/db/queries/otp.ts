import type { D1Database } from '@cloudflare/workers-types';

export interface OTPSession {
  id: string;
  phone: string;
  otp_hash: string;
  otp_salt: string;
  channel: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}

export async function createOTPSession(
  db: D1Database, id: string, phone: string, otpHash: string,
  otpSalt: string, channel: string, expiresAt: string
): Promise<void> {
  await db.prepare(
    'INSERT INTO otp_sessions (id, phone, otp_hash, otp_salt, channel, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, phone, otpHash, otpSalt, channel, expiresAt).run();
}

export async function getLatestOTPSession(db: D1Database, phone: string): Promise<OTPSession | null> {
  return db.prepare(
    'SELECT * FROM otp_sessions WHERE phone = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(phone).first<OTPSession>();
}

export async function incrementOTPAttempts(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = ?').bind(id).run();
}

export async function deleteOTPSession(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM otp_sessions WHERE id = ?').bind(id).run();
}

export async function cleanupExpiredOTP(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM otp_sessions WHERE expires_at < datetime('now') LIMIT 100").run();
}
