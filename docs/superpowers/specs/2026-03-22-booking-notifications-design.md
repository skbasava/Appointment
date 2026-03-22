# Platform-Agnostic Booking + Notification System Design

## Overview

Enable patients to discover and book doctors, with platform-agnostic notifications to both doctor and patient. Supports Telegram, WhatsApp, and Snapchat via the existing `PluginManager` architecture.

## Data Model Changes

### providers table
Add two columns:
- `platform TEXT` — 'telegram', 'whatsapp', 'snapchat'
- `platform_user_id TEXT` — chat ID on the platform

Stored during doctor onboarding from `session.platform` + `session.platformUserId`.

### No schema change for patients
Patients already have `telegram_id` in `users` and `patient_auth` tables. Future migration will rename to `platform` + `platform_user_id` for consistency.

## Booking Flow

### 1. Patient discovers doctors
- Patient sends `/book` in bot
- Bot queries `SELECT id, name, phone FROM providers WHERE type = 'doctor' AND status = 'active'`
- Bot shows list: "1. Dr. Smith — General Consultation"
- Patient selects a doctor

### 2. Patient picks a slot
- Bot shows available time slots for selected doctor (from `availability_windows`)
- Patient selects a date/time
- Bot creates appointment with `status = 'pending'`

### 3. Tentative calendar event
- If doctor has Google Calendar connected, create a tentative event
- Event marked as "tentative" until doctor approves

### 4. Doctor notified
- Bot sends message to doctor's `platform_user_id` via their `platform`:
  - "New booking request: Patient X, Service Y, Date Z"
  - Buttons: ✅ Approve, ❌ Reject, 🔄 Reschedule

### 5. Doctor action
- **Approve**: Status → `confirmed`, calendar event confirmed, patient notified
- **Reject**: Status → `cancelled`, calendar event deleted, patient notified
- **Reschedule**: Doctor picks new time, event updated, patient notified with new time

## Reminders

- **10 minutes** before appointment (changed from 1 hour)
- Sent to **both** doctor AND patient
- Uses `PluginManager.send(platform, userId, message)` for platform-agnostic delivery

## Notification Matrix

| Event | Who | Platform |
|-------|-----|----------|
| New booking created | Doctor | Doctor's registered platform |
| Doctor approves | Patient | Patient's registered platform |
| Doctor rejects | Patient | Patient's registered platform |
| Doctor reschedules | Patient | Patient's registered platform |
| 10-min reminder | Both | Each user's registered platform |

## Bot Commands

| Command | Patient | Doctor |
|---------|---------|--------|
| `/book` | Browse doctors, select, book | — |
| `/appointments` | View own bookings | View + approve/reject/reschedule |

## Files to Modify

- `src/db/schema.sql` — add `platform`, `platform_user_id` to providers
- `src/db/types.ts` — update Provider interface
- `src/lib/messaging/onboarding-flow.ts` — store platform during doctor onboarding
- `src/lib/booking/service.ts` — fix doctor notification, add patient notification
- `src/lib/notifications/service.ts` — add doctor notification method
- `src/api/cron/reminders.ts` — change reminder to 10 min, notify both parties
- `src/lib/messaging/onboarding-flow.ts` — update `/book` command to show doctor list
- `src/db/queries/providers.ts` — add `getActiveDoctors()` query

## Open Questions
- None remaining
