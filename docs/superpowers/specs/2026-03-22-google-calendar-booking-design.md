# Google Calendar as Source of Truth — Design Spec

## Problem

Doctors' Google Calendars are shared across multiple hospitals. The current system uses local `availability_windows` as the source of truth for booking, which doesn't reflect real-time calendar availability. Bookings need to be reflected on the shared calendar so hospitals can see tentative and confirmed appointments.

## Goals

1. Google Calendar is the single source of truth for doctor availability
2. Doctors connect their Google Calendar during onboarding
3. Patients browse hospitals → doctors → services → slots (from calendar)
4. Booking creates a tentative calendar event; approval confirms it
5. `availability_windows` becomes a read-only cache for display

## Architecture

```
Google Calendar (source of truth)
    ↕ FreeBusy API + Events API
calendar_connections (OAuth tokens)
    ↕ provider_id
providers (doctors + hospitals)
    ↕ id
appointments (DB records for confirmed bookings)
```

Hierarchy: Hospital → Doctor → Service → Slot → Booking

## Components

### 1. Schema Changes

**Add to `providers` table:**
- `hospital_id TEXT` — FK to providers.id (nullable, used when type='doctor')
- `specialty TEXT` — doctor specialty (e.g., 'cardiology')

**Migration:** `006-hospital-hierarchy.sql`

### 2. Hospital Registration

Hospitals are seeded via a `/register_hospital` bot command (admin-only) or manually inserted. A hospital is a row in `providers` with `type='hospital'`. The registration flow:

```
/register_hospital
→ hospital name
→ creates provider row: type='hospital', status='active'
```

This is a simple one-step flow — name only. Hospitals don't need TOTP or calendar connection. They serve as grouping entities for doctors.

### 3. Doctor Onboarding — Google Calendar Connection

**Updated flow:**
```
/register_doctor
→ name
→ phone (TOTP)
→ select hospital (from active hospitals in providers WHERE type='hospital')
→ select specialty
→ Google Calendar OAuth (link-then-poll)
→ done
```

**Calendar OAuth step:**
1. Bot generates OAuth URL with `state=providerId`
2. Bot sends link: "Tap here to connect your Google Calendar"
3. Doctor opens browser → Google consent → grants access
4. OAuth callback (`GET /api/calendar/callback`) — leverages existing infrastructure:
   - Exchanges code for tokens (already implemented)
   - Calls `listCalendars()` (already implemented)
   - Stores connection via `upsertCalendarConnection()` (already implemented)
5. Bot polls every 3 seconds (max 2 minutes):
   - Checks if `calendar_connections` row exists for this provider
   - If yes → doctor picks calendar → onboarding continues
   - If timeout → "Calendar connection timed out. Tap /register_doctor to try again."

**Onboarding cannot complete without calendar connection.** Doctor must have a connected calendar to receive bookings.

### 4. Patient Booking — Calendar-Based

**Updated flow:**
```
/book
→ list active hospitals (providers WHERE type='hospital' AND status='active')
→ patient picks hospital
→ list doctors at hospital (providers WHERE hospital_id=? AND type='doctor' AND status='active')
→ patient picks doctor
→ list doctor's services
→ patient picks service
→ query Google Calendar FreeBusy for next 7 days
→ show free 30-min slots
→ patient picks slot
→ create TENTATIVE calendar event
→ notify doctor with approve/reject/reschedule buttons
→ doctor approves → CONFIRM calendar event + create DB record → notify patient
→ doctor rejects → DELETE tentative calendar event → notify patient
→ doctor reschedules → show available slots → create new tentative → delete old tentative
```

**Slot discovery from Google Calendar:**
- Use `checkCalendarConflicts()` (already exists) or FreeBusy API
- Generate 30-min slots within doctor's working hours (from `availability_windows` as cache, or assume 9-17 if empty)
- Filter out slots that conflict with existing calendar events
- Show up to 20 available slots

**Tentative event creation:**
```typescript
{
  summary: `Appointment: ${serviceName}`,
  description: `Booking with ${customerName}\nStatus: TENTATIVE - awaiting doctor approval`,
  start: { dateTime: startTime.toISOString() },
  end: { dateTime: endTime.toISOString() },
  status: 'tentative',
  transparency: 'transparent', // doesn't block calendar
}
```

**Approval flow:**
```typescript
// On approve — make event confirmed
updateEvent(eventId, {
  status: 'confirmed',
  transparency: 'opaque', // blocks calendar
  summary: `Appointment: ${serviceName}`,
});
// Create DB record
INSERT INTO appointments (...)
```

**Rejection flow:**
```typescript
// On reject — delete tentative event
deleteEvent(eventId);
```

### 5. Calendar Integration Changes

| Change | File | Details |
|--------|------|---------|
| Create tentative events | `src/lib/calendar/sync.ts` | Add `status: "tentative"` and `transparency: "transparent"` to `createEvent()` |
| Confirm event | `src/lib/calendar/sync.ts` | Add `confirmCalendarEvent(env, eventId)` — PATCH status to `confirmed`, transparency to `opaque` |
| Delete event on reject | `src/lib/calendar/sync.ts` | Call existing `deleteCalendarEvent()` from rejection handler |
| Slot discovery | `src/lib/messaging/onboarding-flow.ts` | Use existing `checkCalendarConflicts()` (FreeBusy API) instead of availability_windows |
| Hospital listing | `src/lib/messaging/onboarding-flow.ts` | Query hospitals from providers table for /book and doctor onboarding |
| Store google_event_id | `src/lib/messaging/onboarding-flow.ts` | Store event ID during booking, use for approve/reject/reschedule |

### 6. `availability_windows` — Read-Only Cache

- No longer used as source of truth for booking
- Can be populated from doctor's calendar for display purposes
- Patients never interact with it directly

## Data Flow

### Booking Creation
```
Patient selects slot
  → createCalendarEvent(status='tentative', transparency='transparent')
  → store google_event_id in session
  → notify doctor (Telegram): approve/reject/reschedule
  → wait for doctor action
```

### Booking Approval
```
Doctor taps ✅ Approve
  → updateCalendarEvent(status='confirmed', transparency='opaque')
  → INSERT INTO appointments (..., status='confirmed', google_event_id=...)
  → notify patient: "✅ Appointment confirmed!"
```

### Booking Rejection
```
Doctor taps ❌ Reject
  → deleteCalendarEvent()
  → notify patient: "❌ Appointment declined. Please book another slot."
```

### 10-Minute Reminder (existing Task 6, unchanged)
```
Cron job every minute
  → SELECT appointments WHERE start_time BETWEEN now+540 AND now+600 AND status='confirmed'
  → JOIN providers for doctor platform
  → send reminder to both patient and doctor
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| Doctor has no calendar connected | Bot: "Please connect your calendar first: /register_doctor" |
| OAuth callback fails | Show error, allow retry |
| Calendar API returns 401 (expired token) | Auto-refresh token, retry once |
| Calendar API returns 403 (quota exceeded) | Fallback to availability_windows, show warning |
| No free slots in 7 days | Bot: "No available slots this week. Try next week?" |
| Tentative event creation fails | Abort booking, show error to patient |
| Doctor doesn't respond to booking | Tentative event expires after 24h (auto-delete via cron) |

## Testing

- Unit: tentative event creation, confirmation, rejection
- Integration: full booking flow (hospital → doctor → service → slot → approve)
- Integration: OAuth callback + calendar connection during onboarding
- E2E: Telegram bot booking with real Google Calendar (manual)

## Open Questions

1. **Working hours for slot generation**: If doctor hasn't set `availability_windows`, what default hours to use? (Proposed: 9:00-17:00 local time)
2. **Tentative event expiry**: Should unconfirmed tentative events auto-delete after 24h?
3. **Multiple hospitals**: Can a doctor belong to multiple hospitals? (Proposed: one hospital per doctor for simplicity)
4. **Calendar selection**: During onboarding, should the doctor pick which calendar to use, or always use primary?

## Out of Scope

- QR code for OAuth
- Web UI for calendar management
- Recurring appointments
- Multi-calendar support per doctor
