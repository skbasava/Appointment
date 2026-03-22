export interface FirebaseVerificationResult {
  idToken: string;
  phoneNumber?: string;
}

export async function sendFirebaseVerificationCode(
  phone: string,
  env: { FIREBASE_API_KEY: string }
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone,
          recaptchaToken: 'skip', // Server-side bot flow; reCAPTCHA Enterprise handles this
        }),
      }
    );
  } catch (error) {
    throw new Error('Firebase send verification failed: network error');
  }

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    console.error('Firebase send verification failed:', errorData.error?.message || 'Unknown error');
    throw new Error(`Firebase send verification failed: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json() as { sessionInfo: string };
  return data.sessionInfo;
}

export async function verifyFirebaseCode(
  sessionInfo: string,
  code: string,
  env: { FIREBASE_API_KEY: string }
): Promise<FirebaseVerificationResult> {
  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionInfo, code }),
      }
    );
  } catch (error) {
    throw new Error('Firebase verification failed: network error');
  }

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    console.error('Firebase verification failed:', errorData.error?.message || 'Invalid code');
    throw new Error(`Firebase verification failed: ${errorData.error?.message || 'Invalid code'}`);
  }

  const data = await response.json() as { idToken: string; localId?: string; phoneNumber?: string };
  return { idToken: data.idToken, phoneNumber: data.phoneNumber };
}
