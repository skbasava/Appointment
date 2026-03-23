# Booking Flow Redesign

## Problem
- 3 duplicate booking flows (OnboardingFlowHandler, AppointmentBot, BookingService)
- In-memory session state lost between Cloudflare Worker requests
- Telegram callback_data exceeds 64-byte limit with two UUIDs
- Doctor approval flow not connected to calendar

## Solution

### New D1 Tables

```sql
CREATE TABLE booking_sessions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'idle',
  doctor_id TEXT,
  service_id TEXT,
  slot_start INTEGER,
  slot_end INTEGER,
  appointment_id TEXT,
  data TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE callback_keys (
  key TEXT PRIMARY KEY,
  callback_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
```

### Booking Flow (aligned to user's architecture)

1. Patient: `/book` → show hospitals/doctors
2. Tap doctor → show services (store in booking_sessions)
3. Tap service → fetch busy times (1 FreeBusy call), show slots
4. Tap slot → create appointment (status=pending), notify doctor
5. Doctor taps Approve → create Google Calendar event, update status, notify patient

### Bot Restructure

- `BookingFlow` (new): handles step-by-step booking with D1 sessions
- `AppointmentBot`: thin command router (/book, /appointments, /cancel)
- `OnboardingFlowHandler`: registration only, no booking callbacks
- `BookingService` (REST API): unchanged

### Session Management

- All state in `booking_sessions` D1 table
- Callback mappings in `callback_keys` D1 table (auto-expire after 1 hour)
- No in-memory Maps

## Files Changed

- `src/db/schema.sql` — add 2 new tables
- `src/lib/messaging/booking-flow.ts` — new BookingFlow class
- `src/lib/messaging/appointment-bot.ts` — delegate to BookingFlow
- `src/api/routes/telegram.ts` — update routing
- `src/lib/messaging/onboarding-flow.ts` — remove booking callbacks
