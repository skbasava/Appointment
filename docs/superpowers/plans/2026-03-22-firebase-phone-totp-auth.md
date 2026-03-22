# Firebase Phone Auth + TOTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase Phone Auth for patient phone verification and TOTP (Google/Microsoft Authenticator) for doctor verification in the Telegram bot onboarding flow.

**Architecture:** Two new server-side auth modules — `firebase-phone.ts` (REST API calls to Firebase) and `totp.ts` (Web Crypto HMAC-SHA1). Existing Twilio OTP kept under feature flag. Onboarding flow updated to route patients to Firebase and doctors to TOTP.

**Tech Stack:** TypeScript, Cloudflare Workers, Web Crypto API, Firebase Auth REST API, Vitest

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/auth/totp.ts` | Create | TOTP generation/verification using Web Crypto |
| `src/lib/auth/firebase-phone.ts` | Create | Firebase phone auth via REST API |
| `src/lib/auth/feature-flags.ts` | Modify | Add `isTwilioOTPEnabled` function |
| `src/db/types.ts` | Modify | Add Firebase env vars to `Env` interface |
| `src/db/migrations/004-totp-auth.sql` | Create | Add `totp_secret`, `totp_enabled` to providers |
| `src/lib/messaging/onboarding-flow.ts` | Modify | Update patient (Firebase) and doctor (TOTP) flows |
| `tests/unit/auth/totp.test.ts` | Create | TOTP unit tests with known vectors |
| `tests/unit/auth/firebase-phone.test.ts` | Create | Firebase phone auth unit tests (mocked) |
| `tests/unit/auth/feature-flags.test.ts` | Modify | Add tests for `isTwilioOTPEnabled` |

---

### Task 1: TOTP Module (Web Crypto HMAC-SHA1)

**Files:**
- Create: `src/lib/auth/totp.ts`
- Test: `tests/unit/auth/totp.test.ts`

- [ ] **Step 1: Write failing TOTP unit tests**

```typescript
// tests/unit/auth/totp.test.ts
import { describe, it, expect } from 'vitest';
import { generateTOTPSecret, generateTOTP, verifyTOTP, base32Encode, base32Decode } from '../../../src/lib/auth/totp';

describe('TOTP', () => {
  describe('base32Encode/base32Decode', () => {
    it('should encode and decode round-trip', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const encoded = base32Encode(bytes);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(bytes);
    });

    it('should produce known base32 output', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(base32Encode(bytes)).toBe('JBSWY3DP');
    });
  });

  describe('generateTOTPSecret', () => {
    it('should generate a base32-encoded secret', () => {
      const secret = generateTOTPSecret();
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThanOrEqual(16);
    });
  });

  describe('generateTOTP', () => {
    it('should generate a 6-digit code', async () => {
      const code = await generateTOTP('JBSWY3DPEHPK3PXP');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should produce consistent codes for same time', async () => {
      const time = 1000000;
      const code1 = await generateTOTP('JBSWY3DPEHPK3PXP', time);
      const code2 = await generateTOTP('JBSWY3DPEHPK3PXP', time);
      expect(code1).toBe(code2);
    });
  });

  describe('verifyTOTP', () => {
    it('should verify a correct TOTP code', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = await generateTOTP(secret);
      const result = await verifyTOTP(secret, code);
      expect(result).toBe(true);
    });

    it('should reject an incorrect code', async () => {
      const result = await verifyTOTP('JBSWY3DPEHPK3PXP', '000000');
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/auth/totp.test.ts`
Expected: FAIL with "Cannot find module" or similar

- [ ] **Step 3: Implement TOTP module**

```typescript
// src/lib/auth/totp.ts

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += ALPHABET[parseInt(chunk, 2)];
  }
  return result;
}

export function base32Decode(str: string): Uint8Array {
  let bits = '';
  for (const char of str.toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

export function generateTOTPSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

export async function generateTOTP(secret: string, time?: number): Promise<string> {
  const timeStep = Math.floor((time ?? Date.now()) / 1000 / 30);
  const timeBytes = new ArrayBuffer(8);
  new DataView(timeBytes).setUint32(4, timeStep, false);
  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, timeBytes);
  const hmac = new Uint8Array(sigBuffer);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

export async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  const current = await generateTOTP(secret);
  if (current === code) return true;
  // Allow 1 period clock skew
  const before = await generateTOTP(secret, Date.now() - 30000);
  if (before === code) return true;
  const after = await generateTOTP(secret, Date.now() + 30000);
  if (after === code) return true;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth/totp.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/totp.ts tests/unit/auth/totp.test.ts
git commit -m "feat: add TOTP module with Web Crypto HMAC-SHA1"
```

---

### Task 2: Firebase Phone Auth Module

**Files:**
- Create: `src/lib/auth/firebase-phone.ts`
- Test: `tests/unit/auth/firebase-phone.test.ts`

- [ ] **Step 1: Write failing Firebase phone auth unit tests**

```typescript
// tests/unit/auth/firebase-phone.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendFirebaseVerificationCode, verifyFirebaseCode } from '../../../src/lib/auth/firebase-phone';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Firebase Phone Auth', () => {
  const env = { FIREBASE_API_KEY: 'test-api-key', FIREBASE_PROJECT_ID: 'test-project' } as any;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('sendFirebaseVerificationCode', () => {
    it('should call Firebase API with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionInfo: 'session-123' }),
      });

      const sessionInfo = await sendFirebaseVerificationCode('+911234567890', env);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=test-api-key',
        expect.objectContaining({ method: 'POST' })
      );
      expect(sessionInfo).toBe('session-123');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'INVALID_PHONE_NUMBER' } }),
      });

      await expect(sendFirebaseVerificationCode('+invalid', env))
        .rejects.toThrow('Firebase send verification failed');
    });
  });

  describe('verifyFirebaseCode', () => {
    it('should return ID token on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ idToken: 'firebase-id-token-123' }),
      });

      const result = await verifyFirebaseCode('session-123', '123456', env);

      expect(result.idToken).toBe('firebase-id-token-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=test-api-key',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionInfo: 'session-123', code: '123456' }),
        })
      );
    });

    it('should throw on invalid code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'INVALID_CODE' } }),
      });

      await expect(verifyFirebaseCode('session-123', '000000', env))
        .rejects.toThrow('Firebase verification failed');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/auth/firebase-phone.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement Firebase phone auth module**

```typescript
// src/lib/auth/firebase-phone.ts
import type { Env } from '../../db/types';

export interface FirebaseVerificationResult {
  idToken: string;
  phoneNumber?: string;
}

export async function sendFirebaseVerificationCode(
  phone: string,
  env: { FIREBASE_API_KEY: string }
): Promise<string> {
  const response = await fetch(
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

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    console.error('Firebase send verification failed:', errorData);
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
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionInfo, code }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    console.error('Firebase verification failed:', errorData);
    throw new Error(`Firebase verification failed: ${errorData.error?.message || 'Invalid code'}`);
  }

  const data = await response.json() as { idToken: string; localId?: string; phoneNumber?: string };
  return { idToken: data.idToken, phoneNumber: data.phoneNumber };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth/firebase-phone.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/firebase-phone.ts tests/unit/auth/firebase-phone.test.ts
git commit -m "feat: add Firebase phone auth module via REST API"
```

---

### Task 3: Feature Flags + Environment Variables

**Files:**
- Modify: `src/lib/auth/feature-flags.ts`
- Modify: `src/db/types.ts`
- Test: `tests/unit/auth/feature-flags.test.ts`

- [ ] **Step 1: Add env vars to `Env` interface**

Edit `src/db/types.ts` — add to the `Env` interface:

```typescript
FIREBASE_API_KEY: string;
FIREBASE_PROJECT_ID: string;
USE_TWILIO_OTP?: string;
```

- [ ] **Step 2: Add `isTwilioOTPEnabled` to feature-flags.ts**

Edit `src/lib/auth/feature-flags.ts` — add:

```typescript
export function isTwilioOTPEnabled(env: Record<string, string | boolean>): boolean {
  return env['USE_TWILIO_OTP'] === 'true' || env['USE_TWILIO_OTP'] === true;
}
```

- [ ] **Step 3: Write tests for new feature flag**

Edit `tests/unit/auth/feature-flags.test.ts` — add:

```typescript
import { isTwilioOTPEnabled } from '../../../src/lib/auth/feature-flags';

describe('isTwilioOTPEnabled', () => {
  it('should return true when USE_TWILIO_OTP is "true"', () => {
    expect(isTwilioOTPEnabled({ USE_TWILIO_OTP: 'true' })).toBe(true);
  });

  it('should return false when not set', () => {
    expect(isTwilioOTPEnabled({})).toBe(false);
  });

  it('should return false when set to "false"', () => {
    expect(isTwilioOTPEnabled({ USE_TWILIO_OTP: 'false' })).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth/feature-flags.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors (Env interface updated)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/feature-flags.ts src/db/types.ts tests/unit/auth/feature-flags.test.ts
git commit -m "feat: add USE_TWILIO_OTP flag and Firebase env vars"
```

---

### Task 4: Database Migration

**Files:**
- Create: `src/db/migrations/004-totp-auth.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration 004: TOTP authentication for doctors
-- Adds TOTP columns to providers table for authenticator-based verification

ALTER TABLE providers ADD COLUMN totp_secret TEXT;
ALTER TABLE providers ADD COLUMN totp_enabled INTEGER DEFAULT 0;

-- Add firebase_uid to users table for patient Firebase auth
-- Note: users table uses the patient_auth schema from migration 003
ALTER TABLE patient_auth ADD COLUMN firebase_uid TEXT;
```

- [ ] **Step 2: Verify SQL syntax**

Run: `sqlite3 :memory: < src/db/migrations/004-totp-auth.sql` (if sqlite3 available, otherwise manual review)
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/004-totp-auth.sql
git commit -m "feat: add TOTP and Firebase UID migration"
```

---

### Task 5: Update Onboarding Flow — Patient Firebase Phone Auth

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Add imports for new modules**

At the top of `onboarding-flow.ts`, add:

```typescript
import { sendFirebaseVerificationCode, verifyFirebaseCode } from '../../lib/auth/firebase-phone';
import { isTwilioOTPEnabled } from '../../lib/auth/feature-flags';
```

- [ ] **Step 2: Update PATIENT_STEPS to include PHONE_VERIFY**

Change the `PATIENT_STEPS` object to include:

```typescript
export const PATIENT_STEPS = {
  ROLE_SELECT: 'role_select',
  NAME: 'patient_name',
  AGE: 'patient_age',
  SEX: 'patient_sex',
  ADDRESS: 'patient_address',
  PHONE: 'patient_phone',
  PHONE_VERIFY: 'patient_phone_verify',  // NEW
  CONFIRM: 'patient_confirm',
  COMPLETE: 'patient_complete',
};
```

- [ ] **Step 3: Update PATIENT_STEPS.PHONE handler**

Replace the existing `PATIENT_STEPS.PHONE` case in `handleTextInput`:

```typescript
case PATIENT_STEPS.PHONE:
  try {
    session.data.phone = normalizePhone(text);
  } catch (e: any) {
    await plugin.send(message.chatId, { text: `❌ Invalid phone number. Please enter a valid number:` });
    return;
  }

  if (isTwilioOTPEnabled(this.env as any)) {
    // Twilio OTP path (existing)
    try {
      if (this.otpRegistry) {
        const otp = await generateOTPSession(this.db, session.data.phone, 'sms');
        await this.otpRegistry.sendOTPWithFallback(session.data.phone, otp);
      }
    } catch (e: any) {
      console.error('OTP send error:', e);
    }
    session.step = PATIENT_STEPS.PHONE_VERIFY;
    await plugin.send(message.chatId, { text: '🔐 We sent a verification code to your phone. Enter the code:' });
  } else {
    // Firebase Phone Auth path (new)
    try {
      const sessionInfo = await sendFirebaseVerificationCode(session.data.phone, this.env as any);
      session.data.firebaseSessionInfo = sessionInfo;
    } catch (e: any) {
      console.error('Firebase send error:', e);
      await plugin.send(message.chatId, { text: '❌ Failed to send verification code. Please try again:' });
      return;
    }
    session.step = PATIENT_STEPS.PHONE_VERIFY;
    await plugin.send(message.chatId, { text: '🔐 We sent a verification code to your phone via Firebase. Enter the code:' });
  }
  break;
```

- [ ] **Step 4: Add PATIENT_STEPS.PHONE_VERIFY handler**

Add a new case in `handleTextInput` for the verify step:

```typescript
case PATIENT_STEPS.PHONE_VERIFY:
  if (isTwilioOTPEnabled(this.env as any)) {
    // Twilio OTP verification
    try {
      if (this.otpRegistry) {
        await verifyOTP(this.db, session.data.phone, text.trim());
      }
    } catch (e: any) {
      await plugin.send(message.chatId, { text: `❌ ${e.message} Try again:` });
      return;
    }
    session.data.phone_verified = 1;
  } else {
    // Firebase verification
    try {
      const result = await verifyFirebaseCode(session.data.firebaseSessionInfo, text.trim(), this.env as any);
      session.data.firebase_uid = result.phoneNumber || session.data.phone;
      session.data.phone_verified = 1;
    } catch (e: any) {
      await plugin.send(message.chatId, { text: `❌ ${e.message} Try again:` });
      return;
    }
  }
  session.step = PATIENT_STEPS.CONFIRM;
  await plugin.send(message.chatId, { text: '✅ Phone verified!' });
  await this.showPatientConfirmation(message, session, plugin);
  break;
```

- [ ] **Step 5: Update savePatient to store firebase_uid**

Update the `savePatient` method to include `firebase_uid` and `phone_verified`:

```typescript
// In savePatient, add firebase_uid to the INSERT
await this.db.prepare(
  `INSERT INTO patient_auth (id, name, phone, phone_verified, firebase_uid, telegram_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).bind(
  patientId, name, phone,
  session.data.phone_verified || 0,
  session.data.firebase_uid || null,
  session.platform === 'telegram' ? session.platformUserId : null,
  Math.floor(Date.now() / 1000)
).run();
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: integrate Firebase phone auth into patient onboarding"
```

---

### Task 6: Update Onboarding Flow — Doctor TOTP

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Add TOTP imports**

Already added in Task 5. Also add:

```typescript
import { generateTOTPSecret, generateTOTP, verifyTOTP } from '../../lib/auth/totp';
```

- [ ] **Step 2: Update DOCTOR_STEPS.PHONE handler**

Replace the existing `DOCTOR_STEPS.PHONE` case in `handleTextInput`:

```typescript
case DOCTOR_STEPS.PHONE:
  try {
    session.data.phone = normalizePhone(text);
  } catch (e: any) {
    await plugin.send(message.chatId, { text: `❌ Invalid phone number. Please enter a valid number:` });
    return;
  }
  // Generate TOTP secret for doctor
  const totpSecret = generateTOTPSecret();
  session.data.totpSecret = totpSecret;
  session.step = DOCTOR_STEPS.PHONE_VERIFY;
  await plugin.send(message.chatId, {
    text: `🔐 <b>Set up your Authenticator app</b>\n\n` +
          `Secret key: <code>${totpSecret}</code>\n\n` +
          `Steps:\n` +
          `1. Open Google/Microsoft Authenticator\n` +
          `2. Tap '+' → 'Enter a setup key'\n` +
          `3. Account: Appoint-Dr.${session.data.name || 'Doctor'}\n` +
          `4. Key: <code>${totpSecret}</code>\n` +
          `5. Tap 'Add'\n\n` +
          `Then enter the 6-digit code from your authenticator:`,
  });
  break;
```

- [ ] **Step 3: Update DOCTOR_STEPS.PHONE_VERIFY handler**

Replace the existing `DOCTOR_STEPS.PHONE_VERIFY` case:

```typescript
case DOCTOR_STEPS.PHONE_VERIFY:
  const totpSecret = session.data.totpSecret;
  if (!totpSecret) {
    await plugin.send(message.chatId, { text: '❌ Session error. Please start over with /register_doctor' });
    return;
  }
  try {
    const valid = await verifyTOTP(totpSecret, text.trim());
    if (!valid) {
      await plugin.send(message.chatId, { text: '❌ Incorrect code. Try again:' });
      return;
    }
  } catch (e: any) {
    await plugin.send(message.chatId, { text: `❌ Verification error. Try again:` });
    return;
  }
  session.data.phone_verified = 1;
  session.data.totp_enabled = 1;
  session.step = DOCTOR_STEPS.SPECIALTY;
  await plugin.sendWithButtons(message.chatId, '✅ Authenticator verified!\n\n🏥 Select your specialty:', [
    [{ text: 'General Physician', callbackData: 'specialty:general' }],
    [{ text: 'Cardiologist', callbackData: 'specialty:cardiology' }],
    [{ text: 'Dermatologist', callbackData: 'specialty:dermatology' }],
    [{ text: 'Pediatrician', callbackData: 'specialty:pediatrics' }],
    [{ text: 'Orthopedic', callbackData: 'specialty:orthopedic' }],
    [{ text: 'Other', callbackData: 'specialty:other' }],
  ]);
  break;
```

- [ ] **Step 4: Update saveDoctor to store TOTP secret**

Update the `saveDoctor` method to include `totp_secret` and `totp_enabled`:

```typescript
// In saveDoctor INSERT, add totp_secret and totp_enabled
await this.db.prepare(
  `INSERT INTO providers (id, type, name, license_number, mobile_number, telegram_id, whatsapp_id, totp_secret, totp_enabled, timezone, status, created_at, updated_at)
   VALUES (?, 'doctor', ?, ?, ?, ?, ?, ?, ?, 'UTC', 'active', ?, ?)`
).bind(
  doctorId, name, licenseNumber, phone,
  session.platform === 'telegram' ? session.platformUserId : null,
  session.platform === 'whatsapp' ? session.platformUserId : null,
  session.data.totpSecret || null,
  session.data.totp_enabled || 0,
  Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
).run();
```

- [ ] **Step 5: Remove unused imports**

Remove `verifyOTP` and `generateOTPSession` imports from `onboarding-flow.ts` if no longer used (check if any other code depends on them). Actually, keep them since patients still use them when `USE_TWILIO_OTP` is enabled.

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: integrate TOTP authenticator into doctor onboarding"
```

---

### Task 7: Integration Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint/typecheck issues for auth integration"
```

---

## Test Commands Summary

| Command | Purpose |
|---------|---------|
| `npx vitest run tests/unit/auth/totp.test.ts` | TOTP module tests |
| `npx vitest run tests/unit/auth/firebase-phone.test.ts` | Firebase phone auth tests |
| `npx vitest run tests/unit/auth/feature-flags.test.ts` | Feature flag tests |
| `npx vitest run` | All tests |
| `npx tsc --noEmit` | Typecheck |
| `npm run lint` | Lint |
