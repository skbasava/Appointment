# Firebase Phone Auth + TOTP Authentication Design

## Summary

Add Firebase Phone Auth for patient verification and TOTP (Google/Microsoft Authenticator) for doctor verification in the Telegram bot onboarding flow. Keep existing Twilio OTP under feature flag as patient fallback.

## Context

Currently, the Telegram bot onboarding flow has two user types:
- **Patients**: Phone number is optional and unverified (just collected and stored)
- **Doctors**: Phone verified via Twilio OTP SMS

The user wants:
1. **Patients**: Firebase Phone Auth via REST API (server-side, bot-driven flow)
2. **Doctors**: TOTP via Google/Microsoft Authenticator (text-based secret entry)
3. **Twilio**: Kept under feature flag as fallback for patients

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Telegram Bot                         │
├────────────────────┬────────────────────────────────┤
│  Patient Onboard   │       Doctor Onboard            │
│  (Firebase SMS)    │       (TOTP Authenticator)      │
├────────────────────┼────────────────────────────────┤
│ 1. Collect phone   │ 1. Collect phone                │
│ 2. Firebase REST   │ 2. Generate TOTP secret         │
│    → sends SMS     │ 3. Send secret as text          │
│ 3. Enter code      │ 4. Enter code from app          │
│ 4. Verify via API  │ 5. Verify via Web Crypto        │
│ 5. Store token     │ 6. Store TOTP secret            │
├────────────────────┴────────────────────────────────┤
│  Feature Flag: USE_TWILIO_OTP                        │
│  Fallback: Twilio OTP for patients when enabled      │
└─────────────────────────────────────────────────────┘
```

## Components

### 1. Firebase Phone Verification (`src/lib/auth/firebase-phone.ts`)

**New file** — Server-side Firebase phone auth via REST API.

**Functions:**
- `sendFirebaseVerificationCode(phone: string, env: Env): Promise<string>` — Calls Firebase `accounts:sendVerificationCode`, returns `sessionInfo`
- `verifyFirebaseCode(sessionInfo: string, code: string, env: Env): Promise<FirebaseVerificationResult>` — Calls Firebase `accounts:signInWithPhoneNumber`, returns verified token
- `verifyFirebaseIdToken(idToken: string, env: Env): Promise<FirebaseUser | null>` — Verifies Firebase ID token using existing `identitytoolkit.googleapis.com/v1/accounts:lookup` pattern from `firebase.ts`

**API endpoints used:**
- `POST https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key={FIREBASE_API_KEY}`
- `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key={FIREBASE_API_KEY}`
- `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={FIREBASE_API_KEY}`

**Required Firebase Console setup:**
- Enable Phone Authentication provider
- Configure reCAPTCHA Enterprise for server-side verification
- Obtain Firebase Web API Key from Project Settings

### 2. TOTP Implementation (`src/lib/auth/totp.ts`)

**New file** — TOTP generation and verification using Web Crypto API.

**Functions:**
- `generateTOTPSecret(): string` — Generates 20 random bytes, returns base32-encoded string
- `generateTOTP(secret: string, time?: number): Promise<string>` — Generates 6-digit TOTP code using HMAC-SHA1
- `verifyTOTP(secret: string, code: string): Promise<boolean>` — Verifies TOTP code (allows 1 period before/after for clock skew)
- `base32Encode(bytes: Uint8Array): string` — Encodes bytes to base32
- `base32Decode(str: string): Uint8Array` — Decodes base32 to bytes

**TOTP parameters (RFC 6238):**
- Algorithm: HMAC-SHA1
- Digits: 6
- Period: 30 seconds
- Secret: 20 bytes (160 bits)

**No external dependencies** — Uses `crypto.subtle.importKey` and `crypto.subtle.sign` (Web Crypto API, available in Cloudflare Workers).

### 3. Feature Flags (`src/lib/auth/feature-flags.ts`)

**Modified file** — Add new flag.

**New flag:**
```typescript
export function isTwilioOTPEnabled(env: Record<string, string | boolean>): boolean {
  return env['USE_TWILIO_OTP'] === 'true' || env['USE_TWILIO_OTP'] === true;
}
```

### 4. Onboarding Flow (`src/lib/messaging/onboarding-flow.ts`)

**Modified file** — Update patient and doctor flows.

**Patient changes:**
- `PATIENT_STEPS.PHONE`: Add phone verification step (currently missing)
- Add `PATIENT_STEPS.PHONE_VERIFY` step
- If `USE_TWILIO_OTP` is true → use existing Twilio OTP flow
- If `USE_TWILIO_OTP` is false (default) → use Firebase Phone Auth
- Phone becomes required for patients (remove `/skip` option)

**Doctor changes:**
- `DOCTOR_STEPS.PHONE`: Generate TOTP secret instead of sending OTP
- `DOCTOR_STEPS.PHONE_VERIFY`: Verify TOTP code instead of OTP code
- Remove Twilio dependency from doctor flow entirely

### 5. Environment Variables (`src/db/types.ts`)

**Modified file** — Add to `Env` interface:

```typescript
FIREBASE_API_KEY: string;
FIREBASE_PROJECT_ID: string;
USE_TWILIO_OTP?: string; // 'true' to enable Twilio for patients
```

### 6. Database Schema

**New migration** (`src/db/migrations/004-totp-auth.sql`):

```sql
-- Add TOTP columns to providers table
ALTER TABLE providers ADD COLUMN totp_secret TEXT;
ALTER TABLE providers ADD COLUMN totp_enabled INTEGER DEFAULT 0;

-- Add Firebase token column to users table
ALTER TABLE users ADD COLUMN firebase_uid TEXT;
ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0;
```

### 7. Patient Data Storage

**Modified save flow:**
- Store `firebase_uid` from verified Firebase token in `users` table
- Set `phone_verified = 1` after successful verification

## Data Flow

### Patient Firebase Phone Auth

```
Patient → Telegram Bot → Firebase REST API → SMS → Patient Phone
                                                      ↓
Patient enters code → Telegram Bot → Firebase REST API → Verify
                                                      ↓
                                              Store firebase_uid
                                              Mark phone_verified=1
```

### Doctor TOTP

```
Doctor → Telegram Bot → Generate TOTP Secret → Display in chat
                                                      ↓
Doctor enters secret into Authenticator app
                                                      ↓
Doctor sends 6-digit code → Bot → Web Crypto HMAC-SHA1 → Verify
                                                      ↓
                                              Store totp_secret
                                              Mark totp_enabled=1
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Firebase API error | Show user-friendly error, suggest retry |
| Firebase quota exceeded | Fall back to Twilio if enabled, else error |
| Invalid phone number | Reuse `normalizePhone()` validation |
| TOTP wrong code (≤3 attempts) | Show "Incorrect code, try again" |
| TOTP wrong code (>3 attempts) | Generate new secret, restart flow |
| Network timeout | Retry once, then show error |
| Firebase API key missing | Throw config error, log alert |

## Security Considerations

- TOTP secrets stored in D1 (encrypted at rest by Cloudflare)
- Firebase ID tokens stored per-session, not persisted long-term
- OTP/TOTP sessions have 10-minute expiry
- Max 3 verification attempts per session
- Rate limiting via existing sliding window rate limiter
- Firebase API key stored as Cloudflare Worker secret

## Testing

### Unit Tests
- `tests/unit/auth/firebase-phone.test.ts` — Firebase REST API integration (mocked)
- `tests/unit/auth/totp.test.ts` — TOTP generation/verification with known test vectors

### Integration Tests
- `tests/integration/auth.test.ts` — Update with Firebase phone auth scenarios
- `tests/integration/auth-totp.test.ts` — Doctor TOTP flow end-to-end

### Manual Testing
- Telegram bot patient onboarding with Firebase SMS
- Telegram bot doctor onboarding with authenticator app
- Feature flag toggling (Twilio ↔ Firebase)

## Migration Path

1. Deploy database migration (add `totp_secret`, `totp_enabled`, `firebase_uid`, `phone_verified` columns)
2. Set Firebase env vars in Cloudflare Workers (`wrangler secret put`)
3. Deploy new code
4. Existing Twilio OTP continues working via feature flag
5. Doctor flow switches to TOTP automatically
6. Patient flow switches to Firebase automatically

## Open Questions

- [ ] Firebase reCAPTCHA Enterprise setup — requires Firebase Console configuration. The `accounts:sendVerificationCode` endpoint requires an attestation token from reCAPTCHA Enterprise. The bot needs to generate or pass a reCAPTCHA token on each send. Confirm setup is in place before planning.
- [ ] Whether to show QR code in addition to text secret for doctor TOTP setup (future enhancement)
- [ ] Phone number country code handling for Firebase (uses E.164 format)
- [ ] Existing patients who onboarded without verified phone — decide whether to prompt verification on next interaction or leave as-is
