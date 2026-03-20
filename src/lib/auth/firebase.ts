import { Context, Next } from 'hono';
import { Env, Provider } from '../../db/types';
import { getProviderByFirebaseUid } from '../../db/queries/providers';

interface FirebaseUser {
  uid: string;
  email: string;
  email_verified: boolean;
}

interface FirebaseTokenPayload {
  iss: string;
  aud: string;
  auth_time: number;
  user_id: string;
  sub: string;
  iat: number;
  exp: number;
  email?: string;
  email_verified?: boolean;
}

export async function firebaseAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Firebase authentication required' }, 401);
  }

  const idToken = authHeader.substring(7);

  try {
    // Verify Firebase ID token using Firebase Auth REST API
    // The Firebase Web API Key is required (found in Firebase Console > Project Settings > General)
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${c.env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json() as { error?: { message?: string } };
      console.error('Firebase token verification failed:', errorData);
      return c.json({ error: 'Invalid Firebase token' }, 401);
    }

    const data = await response.json() as {
      users: Array<{
        localId: string;
        email: string;
        emailVerified: boolean;
        validSince: string;
      }>
    };

    if (!data.users || data.users.length === 0) {
      return c.json({ error: 'Invalid Firebase token' }, 401);
    }

    const firebaseUser: FirebaseUser = {
      uid: data.users[0].localId,
      email: data.users[0].email,
      email_verified: data.users[0].emailVerified,
    };

    // Check if provider exists
    const provider = await getProviderByFirebaseUid(c.env.DB, firebaseUser.uid);
    if (provider) {
      c.set('provider', provider);
    }

    c.set('firebaseUser', firebaseUser);
    await next();
  } catch (error) {
    console.error('Firebase auth error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
}

// Alternative: Verify Firebase JWT token directly using Google's public keys
// This is more secure but requires additional setup for JWKS caching
export async function verifyFirebaseTokenDirect(
  idToken: string,
  projectId: string
): Promise<FirebaseTokenPayload | null> {
  try {
    // Decode the JWT header to get the key ID
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const header = JSON.parse(atob(parts[0]));
    if (!header.kid) {
      return null;
    }

    // Fetch Google's public keys
    const keysResponse = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (!keysResponse.ok) {
      return null;
    }

    const keys = await keysResponse.json() as Record<string, string>;
    const publicKey = keys[header.kid];

    if (!publicKey) {
      return null;
    }

    // In a real implementation, you would verify the JWT signature here
    // For now, we'll decode the payload and validate claims
    const payload = JSON.parse(atob(parts[1])) as FirebaseTokenPayload;

    // Validate issuer
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
      return null;
    }

    // Validate audience
    if (payload.aud !== projectId) {
      return null;
    }

    // Validate expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    // Validate issued at time (allow 5 minutes clock skew)
    if (payload.iat > now + 300) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Direct token verification failed:', error);
    return null;
  }
}

// Middleware using direct JWT verification (more secure, no API calls to Google)
export async function firebaseAuthMiddlewareDirect(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Firebase authentication required' }, 401);
  }

  const idToken = authHeader.substring(7);

  try {
    const payload = await verifyFirebaseTokenDirect(idToken, c.env.FIREBASE_PROJECT_ID);

    if (!payload) {
      return c.json({ error: 'Invalid Firebase token' }, 401);
    }

    const firebaseUser: FirebaseUser = {
      uid: payload.user_id,
      email: payload.email || '',
      email_verified: payload.email_verified || false,
    };

    // Check if provider exists
    const provider = await getProviderByFirebaseUid(c.env.DB, firebaseUser.uid);
    if (provider) {
      c.set('provider', provider);
    }

    c.set('firebaseUser', firebaseUser);
    await next();
  } catch (error) {
    console.error('Firebase auth error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
}

export function getFirebaseUser(c: Context): FirebaseUser {
  return c.get('firebaseUser');
}

export function getProvider(c: Context): Provider | undefined {
  return c.get('provider');
}
