import type { Context } from 'hono';
import { Env } from '../../db/types';
import { normalizePhone } from '../../lib/phone/normalize';
import { generateOTPSession, verifyOTP, issueJWT } from '../../lib/auth/phone-otp';
import { createProviderRegistry } from '../../lib/otp/providers/index';
import { getPatientByPhone, createPatient, markPhoneVerified } from '../../db/queries/patient-auth';
import { ValidationError, NotFoundError } from '../middleware/error';

export async function sendPatientOTP(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json() as { phone?: string };
  if (!body.phone) throw new ValidationError('Phone number required');

  const phone = normalizePhone(body.phone, c.env.DEFAULT_COUNTRY_CODE || '+91');

  // Generate and send OTP
  const otp = await generateOTPSession(c.env.DB, phone, 'sms');
  const registry = createProviderRegistry(c.env);
  const result = await registry.sendOTPWithFallback(phone, otp);

  if (!result.success) {
    return c.json({ error: 'Failed to send code. Please try again.' }, 500);
  }

  return c.json({ message: 'Code sent', channel: result.success ? 'whatsapp' : 'sms' });
}

export async function verifyPatientOTP(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json() as { phone?: string; code?: string };
  if (!body.phone || !body.code) throw new ValidationError('Phone and code required');

  const phone = normalizePhone(body.phone, c.env.DEFAULT_COUNTRY_CODE || '+91');

  await verifyOTP(c.env.DB, phone, body.code);

  // Find or create patient
  let patient = await getPatientByPhone(c.env.DB, phone);
  if (!patient) {
    patient = await createPatient(c.env.DB, { phone });
  }

  await markPhoneVerified(c.env.DB, patient.id);

  // Issue JWT
  const jwt = await issueJWT(
    { sub: patient.id, role: 'patient', phone: patient.phone },
    c.env.JWT_SECRET || '',
    c.env.JWT_EXPIRY || '7d'
  );

  return c.json({ token: jwt, patient: { id: patient.id, name: patient.name } });
}

export async function getPatientProfile(c: Context<{ Bindings: Env }>) {
  // This requires auth middleware — get userId from context
  const userId = (c as any).get('userId');
  if (!userId) throw new ValidationError('Not authenticated');

  const patient = await c.env.DB.prepare('SELECT * FROM patient_auth WHERE id = ?')
    .bind(userId).first();

  if (!patient) throw new NotFoundError('Patient not found');

  return c.json(patient);
}
