import type { Context, Next } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';

export interface AuthEnv {
  JWT_SECRET?: string;
  JWT_SECRET_PREVIOUS?: string;
  DB: D1Database;
}

interface AuthVariables {
  userId: string;
  userRole: string;
  userPhone: string;
}

type AuthContext = Context<{ Bindings: AuthEnv; Variables: AuthVariables }>;

export async function phoneOtpMiddleware(c: AuthContext, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const secret = c.env.JWT_SECRET;
  if (!secret) return c.json({ error: 'Server misconfigured' }, 500);

  try {
    const payload = await verifyJWT(token, secret);
    c.set('userId', payload.sub as string);
    c.set('userRole', payload.role as string);
    c.set('userPhone', payload.phone as string);
    await next();
  } catch {
    // Try previous secret for rotation
    if (c.env.JWT_SECRET_PREVIOUS) {
      try {
        const payload = await verifyJWT(token, c.env.JWT_SECRET_PREVIOUS);
        c.set('userId', payload.sub as string);
        c.set('userRole', payload.role as string);
        c.set('userPhone', payload.phone as string);
        await next();
        return;
      } catch {}
    }
    return c.json({ error: 'Token expired or invalid' }, 401);
  }
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );

  // Decode base64url signature
  const sigBase64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
  const sigBytes = Uint8Array.from(atob(sigBase64), c => c.charCodeAt(0));
  
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error('Invalid signature');

  // Decode base64url payload
  const payloadBase64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(payloadBase64));
  
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

// Context helpers
export function getUserId(c: AuthContext): string {
  return c.get('userId') as string;
}

export function getUserRole(c: AuthContext): string {
  return c.get('userRole') as string;
}

export function getUserPhone(c: AuthContext): string {
  return c.get('userPhone') as string;
}
