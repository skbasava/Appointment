import type { D1Database } from '@cloudflare/workers-types';
import { createOTPSession, getLatestOTPSession, incrementOTPAttempts, deleteOTPSession } from '../../db/queries/otp';

function generateOTP(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

async function hashOTP(otp: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  // Use salt as hex string concatenated with OTP
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const data = encoder.encode(otp + saltHex);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function generateOTPSession(
  db: D1Database, phone: string, channel: string
): Promise<string> {
  const otp = generateOTP();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashOTP(otp, salt);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await createOTPSession(db, id, phone, hash, toHex(salt), channel, expiresAt);
  return otp;
}

export async function verifyOTP(db: D1Database, phone: string, inputOTP: string): Promise<boolean> {
  const session = await getLatestOTPSession(db, phone);
  if (!session) throw new Error('No OTP session found. Request a new code.');
  if (new Date(session.expires_at) < new Date()) {
    throw new Error('Code expired. Request a new one.');
  }
  if (session.attempts >= 3) {
    throw new Error('Too many attempts. Wait 5 minutes.');
  }
  await incrementOTPAttempts(db, session.id);
  const salt = fromHex(session.otp_salt);
  const inputHash = await hashOTP(inputOTP, salt);
  if (inputHash !== session.otp_hash) {
    throw new Error('Incorrect code. Try again.');
  }
  await deleteOTPSession(db, session.id);
  return true;
}

export async function issueJWT(
  payload: Record<string, unknown>, secret: string, expiry: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpiry(expiry);
  const encode = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const headerB64 = encode(header);
  const payloadB64 = encode({ ...payload, iat: now, exp });
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  // Convert ArrayBuffer to base64url
  const sigBytes = new Uint8Array(sigBuffer);
  const sigBinary = Array.from(sigBytes).map(b => String.fromCharCode(b)).join('');
  const sigB64 = btoa(sigBinary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sigB64}`;
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60;
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'd') return val * 86400;
  if (unit === 'h') return val * 3600;
  if (unit === 'm') return val * 60;
  return val;
}
