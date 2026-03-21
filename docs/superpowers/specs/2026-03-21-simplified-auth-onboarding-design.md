# Design: Simplified Doctor/Patient Auth & Onboarding

**Feature**: Replace Firebase auth with phone OTP, split messaging into onboarding + appointment bots, add rate limiting
**Created**: 2026-03-21
**Status**: Draft

## Problem

Doctors are not tech-savvy. The current flow requires them to obtain Firebase tokens and navigate OAuth — barriers that prevent adoption. Patients on WhatsApp also lack a smooth auth experience.

## Goals

1. Zero technical knowledge required for doctors to onboard
2. Unified phone OTP auth for both doctors and patients
3. Separate bot handlers for onboarding vs appointments
4. Platform-agnostic rate limiting to prevent DOS attacks

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth method | Phone OTP (WhatsApp + SMS) | No passwords, no tokens, doctors just enter a code |
| Session management | Server-issued JWT | Simple, stateless, replaces Firebase JWT |
| Bot architecture | Two internal handlers, same number | Single contact for doctors, clean code separation |
| Rate limiting | In-memory sliding window | Platform-agnostic, no external deps |
| Onboarding actor | Doctor self-registers | Simplest, self-service |
| Patient auth | Channel-dependent (Telegram ID or Phone OTP) | Telegram users identified by Telegram ID, WhatsApp/web by phone |
| Google Calendar | Unchanged OAuth flow | Only middleware changes, not the actual flow |

---

## Architecture

```
Doctor/Patient sends message to ONE number (WhatsApp or Telegram)
                    ↓
            Webhook → /api/whatsapp or /api/telegram
                    ↓
          ┌─────────────────┐
          │ Webhook Verify   │ ← validate WhatsApp/Telegram signatures
          └────────┬────────┘
                   ↓
          ┌─────────────────┐
          │ Rate Limiter     │ ← in-memory sliding window
          └────────┬────────┘
                   ↓
          ┌─────────────────┐
          │   Router         │ ← checks: is user registered? as doctor or patient?
          └────────┬────────┘
                   ↓
        ┌──────────┴──────────┐
        ↓                     ↓
  ┌──────────────┐    ┌────────────────┐
  │ OnboardingBot │    │ AppointmentBot │
  │               │    │                │
  │ /start        │    │ /book          │
  │ /register     │    │ /status        │
  │ OTP flow      │    │ /availability  │
  │ Clinic setup  │    │ /cancel        │
  │ Calendar link │    │ /calendar      │
  └──────────────┘    └────────────────┘
```

### Router Logic

The router checks the user's identity:
1. **Telegram message** → look up `telegram_id` in `providers` table → if found, route to AppointmentBot. Else look up in `patient_auth` → if found, route to AppointmentBot (patient). Else route to OnboardingBot.
2. **WhatsApp message** → look up phone number in `providers` table → if found, route to AppointmentBot. Else look up in `patient_auth` → if found, route to AppointmentBot (patient). Else route to OnboardingBot.
3. **Role switch**: A patient who wants to register as a doctor uses `/register` to enter the OnboardingBot flow. Their patient record is preserved — the new provider record links to the same phone.

### Patient Flow

```
Patient arrives via:
┌─────────────────┬──────────────────┬──────────────────┐
│   Telegram       │   WhatsApp       │   Web            │
├─────────────────┼──────────────────┼──────────────────┤
│ Telegram ID      │ Phone number     │ Phone number     │
│ (no OTP needed)  │ → OTP verify     │ → OTP verify     │
│ existing flow    │ → JWT issued     │ → JWT issued     │
└─────────────────┴──────────────────┴──────────────────┘
```

### Web Patient Flow

1. Patient opens booking page in browser
2. Enters phone number
3. Receives OTP via WhatsApp (primary) or SMS (fallback)
4. Enters OTP → JWT issued as httpOnly cookie
5. Proceeds to booking

---

## Auth Flows

### Phone Number Normalization

All phone numbers are normalized to E.164 format before storage or comparison:
- Strip non-digit characters
- Add country code if missing (default from config or infer from WhatsApp sender)
- Result: `+91XXXXXXXXXX`
- Stored as `providers.phone` and `patient_auth.phone` (both UNIQUE)

### Doctor Onboarding (Phone OTP)

```
1. Doctor: /start or /register
2. Bot:    "What's your full name?"
3. Doctor: "Dr. Smith"
4. Bot:    "Phone number for verification?"
5. Doctor: "+91XXXXXXXXXX"
6. Bot:    Sends OTP via WhatsApp + SMS
7. Doctor: Enters "123456"
8. Bot:    "Verified! Now let's set up your profile..."
9. Doctor: License, specialty, clinic info (existing flow)
10. Bot:   "Connect Google Calendar?" [Web Link]
11. Doctor: Clicks link → Google consent → Allow → Done
12. Bot:   "You're all set! Type /book to manage appointments."
```

### Patient Booking (Channel-Dependent)

**Telegram patient:**
```
1. Patient: /start
2. Bot:     "Welcome! What's your name?"
3. Patient: "John"
4. Bot:     Proceeds to booking flow (auth = telegram_user_id)
```

**WhatsApp patient:**
```
1. Patient: "Hi"
2. Bot:     "What's your phone number?"
3. Patient: "+91XXXXXXXXXX"
4. Bot:     Sends OTP
5. Patient: Enters code
6. Bot:     "Verified! What's your name?"
7. Patient: "John"
8. Bot:     Proceeds to booking flow (auth = phone-based JWT)
```

**Web patient:**
```
1. Patient: Opens booking page
2. UI:      "Enter your phone number"
3. Patient: "+91XXXXXXXXXX"
4. UI:      "Enter the code sent to your phone"
5. Patient: "123456"
6. UI:      JWT stored as httpOnly cookie
7. Patient: Proceeds to booking
```

### Cross-Channel Patient Linking

A patient who starts on Telegram and later uses WhatsApp:
1. WhatsApp flow asks for phone number
2. System checks `patient_auth` for matching phone
3. If no match, creates new record
4. If patient wants to link accounts, they can send `/link` on Telegram — bot sends a code to their WhatsApp, they enter it on Telegram → `telegram_id` is set on the existing `patient_auth` record

### Google Calendar OAuth (Unchanged UX)

```
Doctor clicks "Connect Calendar" link
       ↓
Opens Google consent screen (YOUR app's client_id)
       ↓
Doctor clicks "Allow"
       ↓
Google redirects back → server exchanges code for tokens
       ↓
Tokens stored in calendar_connections table
       ↓
Doctor sees "Calendar connected!"
```

**The doctor never sees tokens, client IDs, or OAuth jargon.**

---

## Rate Limiting

### In-Memory Sliding Window

```
Map<identifier, { requests: number[], blocked_until: timestamp }>

On each message:
1. Get identifier (phone number or telegram_id)
2. Check if blocked_until > now → reject with "Please wait"
3. Clean old requests outside window (60s)
4. If requests in window > threshold → set blocked_until = now + 5min
5. Otherwise → add request, proceed
```

**Note on Cloudflare Workers**: Workers are ephemeral — in-memory state is lost on cold start. This means rate limiting is best-effort and resets on redeploy or cold start. For most DOS scenarios (individual bots, not network-level), this is sufficient. If stronger protection is needed in the future, migrate to Cloudflare KV or D1-backed counters.

### Thresholds

| Actor | Threshold |
|-------|-----------|
| Doctor onboarding | 10 messages/min |
| Doctor appointments | 15 messages/min |
| Patient booking | 15 messages/min |
| OTP requests | 3 per phone per 5 min |

---

## Database Changes

```sql
-- Add phone auth columns to providers
ALTER TABLE providers ADD COLUMN phone TEXT UNIQUE;
ALTER TABLE providers ADD COLUMN phone_verified INTEGER DEFAULT 0;

-- New OTP sessions table
CREATE TABLE otp_sessions (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,       -- bcrypt hash of 6-digit OTP + per-session salt
  channel TEXT NOT NULL,        -- 'whatsapp' or 'sms'
  expires_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,   -- incremented on each wrong attempt, block at 3
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_otp_phone ON otp_sessions(phone);

-- Cleanup: delete expired OTP rows periodically (see Cleanup section below)

-- New patient auth table (for WhatsApp/web patients)
CREATE TABLE patient_auth (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  phone_verified INTEGER DEFAULT 0,
  name TEXT,
  telegram_id TEXT,             -- nullable, set if patient also uses Telegram
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_patient_telegram ON patient_auth(telegram_id);
```

### OTP Session Cleanup

Expired `otp_sessions` rows are cleaned up:
- **On OTP request**: Before creating a new OTP, delete any expired rows for that phone number
- **Periodic**: A cleanup query runs on each webhook invocation (cheap: `DELETE FROM otp_sessions WHERE expires_at < datetime('now')` with a LIMIT to avoid long-running queries)

---

## OTP Security

### Generation
- 6-digit numeric code, cryptographically random (`crypto.getRandomValues`)
- 10-minute expiry

### Storage
- Hashed with bcrypt before storing in `otp_hash`
- Per-session random salt included in the hash (bcrypt handles this automatically)
- Plain OTP never stored or logged

### Verification Logic
```typescript
1. Find latest otp_sessions row for phone WHERE expires_at > now
2. If not found → "Code expired, request a new one"
3. If found and attempts >= 3 → "Too many attempts, wait 5 minutes"
4. Increment attempts
5. bcrypt.compare(input_otp, otp_hash)
6. If match → delete row, issue JWT
7. If no match → "Incorrect code, try again"
```

### OTP Delivery

| Channel | Provider | Mechanism |
|---------|----------|-----------|
| WhatsApp | Twilio WhatsApp API | Use Twilio's WhatsApp channel with approved OTP message template |
| SMS | Twilio SMS API | Standard Twilio SMS |

**WhatsApp OTP Template**: Requires a pre-approved template in Twilio/Meta Business Manager (e.g., `Your verification code is {{1}}`). Must be submitted and approved before going live.

**Delivery fallback**: If WhatsApp delivery fails, automatically send via SMS. If SMS fails, inform user and suggest retry.

---

## JWT Security

### Payload
```json
{
  "sub": "<provider_id or patient_auth_id>",
  "role": "doctor" | "patient",
  "phone": "+91XXXXXXXXXX",
  "channel": "whatsapp" | "telegram" | "web",
  "iat": 1711000000,
  "exp": 1711604800
}
```

### Secret Management
- `JWT_SECRET` stored as a **wrangler secret** (not in `wrangler.toml`)
- Minimum 32 characters, cryptographically random
- Generated once: `openssl rand -base64 48`
- Rotation: When rotating, support a `JWT_SECRET_PREVIOUS` for graceful migration (verify with old secret, re-issue with new)

### Middleware
- `phoneOtpMiddleware` (replaces `firebaseAuthMiddleware`) verifies JWT signature, checks expiry, extracts `sub` (provider/patient ID) and `role` into Hono context
- Endpoints that require doctor role check `ctx.get('role') === 'doctor'`

---

## Webhook Verification

Both WhatsApp and Telegram webhooks **must** verify incoming requests:

| Platform | Verification Method |
|----------|-------------------|
| WhatsApp | Verify `X-Hub-Signature-256` header against `APP_SECRET` using HMAC-SHA256 |
| Telegram | Verify secret token in `X-Telegram-Bot-Api-Secret-Token` header against configured secret |

Both verifications are enforced in `src/api/routes/whatsapp.ts` and `src/api/routes/telegram.ts` before any message processing.

---

## Data Migration

Existing doctors with Firebase-linked accounts need a migration path:

1. **Add columns** (`phone`, `phone_verified`) via migration
2. **Backfill**: For each provider with `firebase_uid`, set `phone` from their existing contact info if available, mark `phone_verified = 0`
3. **Next login**: Doctor logs in via the bot → OTP flow → `phone_verified` set to 1, `firebase_uid` preserved for backward compatibility during transition
4. **Deprecation period**: Keep `firebase_uid` column for 30 days, then drop
5. **Calendar connections**: No migration needed — `calendar_connections` links to `provider_id`, which is unchanged

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/auth/phone-otp.ts` | **NEW** | OTP generation (crypto random), bcrypt hashing, verification, JWT issuing |
| `src/lib/auth/rate-limiter.ts` | **NEW** | In-memory sliding window rate limiter |
| `src/lib/auth/firebase.ts` | **DEPRECATE** | Replaced by phone-otp; keep for 30-day transition |
| `src/lib/auth/telegram.ts` | **KEEP** | Still used for Telegram patients |
| `src/lib/messaging/router.ts` | **NEW** | Routes messages: checks provider/patient registration, directs to onboarding or appointment bot |
| `src/lib/messaging/onboarding-flow.ts` | **UPDATE** | Use phone OTP instead of Firebase, add Google Calendar link step, E.164 normalization |
| `src/lib/messaging/appointment-bot.ts` | **NEW** | Extract appointment commands (/book, /status, /cancel, /availability, /calendar) |
| `src/lib/messaging/patient-bot.ts` | **NEW** | Patient booking/status flows for WhatsApp and web |
| `src/lib/phone/normalize.ts` | **NEW** | E.164 phone number normalization utility |
| `src/lib/otp/cleanup.ts` | **NEW** | Expired OTP session cleanup query |
| `src/api/routes/whatsapp.ts` | **UPDATE** | Webhook signature verification, router + rate limiter |
| `src/api/routes/telegram.ts` | **UPDATE** | Webhook secret verification, router + rate limiter |
| `src/api/routes/calendar.ts` | **UPDATE** | Swap Firebase middleware for phone OTP middleware |
| `src/api/routes/providers.ts` | **UPDATE** | Swap Firebase middleware for phone OTP middleware |
| `src/api/routes/patients.ts` | **NEW** | Patient registration, OTP verification, JWT endpoints (for web flow) |
| `src/db/migrations/003-phone-auth.sql` | **NEW** | DDL for otp_sessions, patient_auth, providers columns |
| `wrangler.toml` | **UPDATE** | Remove Firebase vars, add Twilio config |
| `.env.example` | **UPDATE** | Add Twilio vars, remove Firebase vars |

---

## Environment Variables

### Remove
- `FIREBASE_API_KEY`
- `FIREBASE_PROJECT_ID`

### Add
| Variable | Purpose | Storage |
|----------|---------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account for SMS/WhatsApp OTP | wrangler secret |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | wrangler secret |
| `TWILIO_PHONE_NUMBER` | Twilio SMS sender number | wrangler var |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp sender (e.g., `whatsapp:+14155238886`) | wrangler var |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars, crypto random) | wrangler secret |
| `JWT_SECRET_PREVIOUS` | Previous JWT secret for rotation (optional) | wrangler secret |
| `JWT_EXPIRY` | JWT expiry duration (e.g., "7d") | wrangler var |
| `DEFAULT_COUNTRY_CODE` | Default country code for phone normalization (e.g., "+91") | wrangler var |

### Keep Unchanged
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET` (for webhook signature verification)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

---

## Error Handling

| Scenario | Response |
|----------|----------|
| OTP expired | "Code expired. Request a new one?" |
| OTP wrong (3x) | "Too many attempts. Wait 5 minutes." |
| Rate limited | "Please wait a moment before trying again." |
| WhatsApp send fails | Fall back to SMS automatically |
| SMS send fails | "Couldn't send SMS. Try WhatsApp?" |
| Both fail | "Unable to send code. Contact support." |
| Phone already registered | "This number is already registered. Log in instead?" |
| Invalid phone format | "Please enter a valid phone number with country code." |
| Webhook signature invalid | Return 403, log warning |
| JWT expired | "Session expired. Please verify your phone again." |
| Google Calendar denied | "Calendar connection required for accepting bookings." |
| Google token expired | Auto-refresh (existing logic), notify if refresh fails |

---

## Success Criteria

- **SC-001**: Doctor can complete full onboarding (phone verify → profile → calendar) in under 5 minutes
- **SC-002**: Zero Firebase tokens visible to doctors or patients
- **SC-003**: 99% of OTP messages delivered within 10 seconds
- **SC-004**: Rate limiting blocks DOS attempts without impacting normal users
- **SC-005**: Patients can book via WhatsApp with phone OTP in under 2 minutes
- **SC-006**: Phone numbers correctly normalized to E.164 — no duplicate records for same phone
- **SC-007**: Webhook signature verification rejects 100% of forged requests
