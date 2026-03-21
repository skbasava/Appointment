import type { D1Database } from '@cloudflare/workers-types';

export interface PatientAuth {
  id: string;
  phone: string;
  phone_verified: number;
  name: string | null;
  telegram_id: string | null;
  created_at: string;
}

export async function getPatientByPhone(
  db: D1Database, phone: string
): Promise<PatientAuth | null> {
  return db.prepare('SELECT * FROM patient_auth WHERE phone = ?')
    .bind(phone).first<PatientAuth>();
}

export async function getPatientByTelegramId(
  db: D1Database, telegramId: string
): Promise<PatientAuth | null> {
  return db.prepare('SELECT * FROM patient_auth WHERE telegram_id = ?')
    .bind(telegramId).first<PatientAuth>();
}

export async function createPatient(
  db: D1Database,
  data: { phone?: string; name?: string; telegram_id?: string }
): Promise<PatientAuth> {
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO patient_auth (id, phone, name, telegram_id, phone_verified) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, data.phone || null, data.name || null, data.telegram_id || null, data.phone ? 0 : 1).run();
  return (await db.prepare('SELECT * FROM patient_auth WHERE id = ?')
    .bind(id).first<PatientAuth>())!;
}

export async function linkTelegram(
  db: D1Database, patientId: string, telegramId: string
): Promise<void> {
  await db.prepare('UPDATE patient_auth SET telegram_id = ? WHERE id = ?')
    .bind(telegramId, patientId).run();
}

export async function markPhoneVerified(
  db: D1Database, patientId: string
): Promise<void> {
  await db.prepare('UPDATE patient_auth SET phone_verified = 1 WHERE id = ?')
    .bind(patientId).run();
}
