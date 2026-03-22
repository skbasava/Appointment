# Google Calendar as Source of Truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google Calendar the source of truth for doctor availability, with hospital hierarchy and calendar-based booking.

**Architecture:** Add hospital/specialty to providers, update calendar client to support tentative events, rewrite booking flow to use FreeBusy for slots and tentative/confirmed events for booking lifecycle.

**Tech Stack:** Cloudflare Workers, Hono, D1, Google Calendar REST API v3, Telegram Bot API

**Spec:** `docs/superpowers/specs/2026-03-22-google-calendar-booking-design.md`

---

### Task 1: Schema — hospital hierarchy + specialty

**Files:**
- Create: `src/db/migrations/006-hospital-hierarchy.sql`
- Modify: `src/db/schema.sql`
- Modify: `src/db/types.ts`

- [ ] **Step 1: Create migration**

```sql
-- 006-hospital-hierarchy.sql
ALTER TABLE providers ADD COLUMN hospital_id TEXT;
ALTER TABLE providers ADD COLUMN specialty TEXT;
```

- [ ] **Step 2: Update schema.sql providers table**

Add after `firebase_uid`:
```sql
hospital_id TEXT,
specialty TEXT,
```

- [ ] **Step 3: Update Provider interface in types.ts**

Add:
```typescript
hospital_id?: string;
specialty?: string;
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/006-hospital-hierarchy.sql src/db/schema.sql src/db/types.ts
git commit -m "feat: add hospital_id and specialty to providers table"
```

---

### Task 2: Calendar client — tentative events + confirmation

**Files:**
- Modify: `src/lib/calendar/client.ts`
- Modify: `src/lib/calendar/sync.ts`
- Test: `tests/unit/calendar/client.test.ts`

- [ ] **Step 1: Write failing test for tentative event creation**

```typescript
// tests/unit/calendar/client.test.ts
describe('createEvent with tentative status', () => {
  it('should send tentative status and transparent transparency', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'event123', summary: 'test' }),
    });
    global.fetch = mockFetch;

    const client = new GoogleCalendarClient('fake-token', 'primary');
    await client.createEvent({
      summary: 'Test',
      startTime: new Date('2026-03-23T10:00:00Z'),
      endTime: new Date('2026-03-23T10:30:00Z'),
      status: 'tentative',
      transparency: 'transparent',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('tentative');
    expect(body.transparency).toBe('transparent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/calendar/client.test.ts
```
Expected: FAIL — `status` and `transparency` not accepted by createEvent

- [ ] **Step 3: Update `createEvent` to accept status/transparency**

In `src/lib/calendar/client.ts`, update the `createEvent` method signature and body:

```typescript
async createEvent(event: {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  status?: 'tentative' | 'confirmed' | 'cancelled';
  transparency?: 'opaque' | 'transparent';
}): Promise<CalendarEvent> {
  const response = await fetch(`${CALENDAR_API_BASE}/calendars/${this.calendarId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startTime.toISOString() },
      end: { dateTime: event.endTime.toISOString() },
      ...(event.status && { status: event.status }),
      ...(event.transparency && { transparency: event.transparency }),
    }),
  });
  // ... rest unchanged
}
```

- [ ] **Step 4: Update `updateEvent` to accept status/transparency**

```typescript
async updateEvent(
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    startTime?: Date;
    endTime?: Date;
    status?: 'tentative' | 'confirmed' | 'cancelled';
    transparency?: 'opaque' | 'transparent';
  }
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {};
  // ... existing fields ...
  if (event.status) body.status = event.status;
  if (event.transparency) body.transparency = event.transparency;
  // ... rest unchanged
}
```

- [ ] **Step 5: Add `confirmCalendarEvent` to sync.ts**

```typescript
export async function confirmCalendarEvent(
  env: Env,
  providerId: string,
  eventId: string
): Promise<boolean> {
  const client = await getCalendarClientForProvider(env, providerId);
  if (!client) return false;

  try {
    await client.updateEvent(eventId, {
      status: 'confirmed',
      transparency: 'opaque',
    });
    return true;
  } catch (error) {
    console.error('Failed to confirm calendar event:', error);
    return false;
  }
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/calendar/client.ts src/lib/calendar/sync.ts tests/unit/calendar/
git commit -m "feat: add tentative event creation and confirmation to calendar client"
```

---

### Task 3: Hospital registration + provider queries

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`
- Modify: `src/db/queries/providers.ts`

- [ ] **Step 1: Add `getHospitals` query to providers.ts**

```typescript
export async function getHospitals(db: D1Database) {
  const results = await db.prepare(
    'SELECT id, name FROM providers WHERE type = ? AND status = ? ORDER BY name ASC'
  ).bind('hospital', 'active').all();
  return results.results;
}
```

- [ ] **Step 2: Add `/register_hospital` handler to onboarding-flow.ts**

In the `handleTextCommand` method, add:

```typescript
case '/register_hospital':
  session.step = 'hospital_name';
  session.data = {};
  await plugin.send(message.chatId, { text: '🏥 Enter hospital name:' });
  break;
```

Add new step handler in `handleTextInput`:

```typescript
case 'hospital_name': {
  const hospitalId = crypto.randomUUID();
  await this.db.prepare(
    'INSERT INTO providers (id, type, name, email, firebase_uid, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(hospitalId, 'hospital', text.trim(), `hospital-${hospitalId}@placeholder.com`, hospitalId, 'UTC', 'active', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

  session.step = 'idle';
  await plugin.send(message.chatId, { text: `✅ Hospital "${text.trim()}" registered!` });
  break;
}
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts src/db/queries/providers.ts
git commit -m "feat: add hospital registration command and query"
```

---

### Task 4: Doctor onboarding — hospital selection + calendar OAuth

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Add hospital selection step to DOCTOR_STEPS**

Add `HOSPITAL` and `CALENDAR` steps:

```typescript
export const DOCTOR_STEPS = {
  ROLE_SELECT: 'role_select',
  NAME: 'doctor_name',
  PHONE: 'doctor_phone',
  PHONE_VERIFY: 'doctor_phone_verify',
  HOSPITAL: 'doctor_hospital',      // NEW
  SPECIALTY: 'doctor_specialty',
  CALENDAR: 'doctor_calendar',       // NEW
  CONFIRM: 'doctor_confirm',
  COMPLETE: 'doctor_complete',
};
```

- [ ] **Step 2: Update specialty step → go to HOSPITAL first**

In `handleTextInput`, after TOTP verification succeeds, instead of going to SPECIALTY, go to HOSPITAL:

```typescript
// After DOCTOR_STEPS.PHONE_VERIFY success:
session.step = DOCTOR_STEPS.HOSPITAL;
const hospitals = await this.db.prepare(
  'SELECT id, name FROM providers WHERE type = ? AND status = ? ORDER BY name ASC'
).bind('hospital', 'active').all();

if (!hospitals.results || hospitals.results.length === 0) {
  await plugin.send(message.chatId, { text: '⚠️ No hospitals registered yet. Contact admin.' });
  return;
}

const buttons = (hospitals.results as any[]).map(h => [
  { text: h.name, callbackData: `hospital:${h.id}` },
]);
await plugin.sendWithButtons(message.chatId, '🏥 Select your hospital:', buttons);
```

- [ ] **Step 3: Add hospital callback handler**

In `handleCallback`:

```typescript
} else if (data.startsWith('hospital:')) {
  const hospitalId = data.split(':')[1];
  session.data.hospitalId = hospitalId;

  // Show specialty options
  session.step = DOCTOR_STEPS.SPECIALTY;
  await plugin.sendWithButtons(message.chatId, '🏥 Select your specialty:', [
    [{ text: 'General Physician', callbackData: 'specialty:general' }],
    [{ text: 'Cardiologist', callbackData: 'specialty:cardiology' }],
    [{ text: 'Dermatologist', callbackData: 'specialty:dermatology' }],
    [{ text: 'Pediatrician', callbackData: 'specialty:pediatrics' }],
    [{ text: 'Orthopedic', callbackData: 'specialty:orthopedic' }],
    [{ text: 'Other', callbackData: 'specialty:other' }],
  ]);
}
```

- [ ] **Step 4: Update specialty callback → go to CALENDAR step**

Update the existing `specialty:` callback to store specialty and trigger calendar OAuth:

```typescript
} else if (data.startsWith('specialty:')) {
  const specialty = data.split(':')[1];
  session.data.specialty = specialty;

  // Trigger Google Calendar OAuth
  session.step = DOCTOR_STEPS.CALENDAR;
  const providerId = session.data.doctorId || crypto.randomUUID();
  session.data.doctorId = providerId;

  const pluginManager = this.pluginManager;

  // Build OAuth URL using existing API endpoint
  const baseUrl = this.env.BASE_URL || 'https://appoint.satish-aradhya.workers.dev';
  const oauthUrl = `${baseUrl}/api/providers/${providerId}/calendar/oauth-url`;

  await plugin.send(message.chatId, {
    text: `🔐 <b>Connect your Google Calendar</b>\n\nTap the link below to authorize:\n${oauthUrl}\n\nAfter authorizing, I'll detect it automatically.`,
  });

  // Start polling for calendar connection
  this.pollCalendarConnection(message, session, plugin, providerId);
}
```

- [ ] **Step 5: Add calendar polling method**

```typescript
private async pollCalendarConnection(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, providerId: string
): Promise<void> {
  let attempts = 0;
  const maxAttempts = 40; // 40 * 3s = 2 minutes

  const poll = async () => {
    if (session.step !== DOCTOR_STEPS.CALENDAR) return; // Already connected or cancelled

    const connection = await this.db.prepare(
      'SELECT * FROM calendar_connections WHERE provider_id = ? AND status = ?'
    ).bind(providerId, 'connected').first();

    if (connection) {
      // Calendar connected!
      session.step = DOCTOR_STEPS.CONFIRM;
      await plugin.send(message.chatId, { text: '✅ Google Calendar connected!' });
      await this.showDoctorConfirmation(message, session, plugin);
      return;
    }

    attempts++;
    if (attempts >= maxAttempts) {
      await plugin.send(message.chatId, {
        text: '⏰ Calendar connection timed out. Send /register_doctor to try again.',
      });
      return;
    }

    setTimeout(poll, 3000);
  };

  setTimeout(poll, 3000);
}
```

- [ ] **Step 6: Update `saveDoctor` to include hospital_id and specialty**

Update the INSERT in `saveDoctor`:

```typescript
INSERT INTO providers (id, type, name, email, phone, totp_secret, totp_enabled, platform, platform_user_id, hospital_id, specialty, timezone, status, created_at, updated_at)
VALUES (?, 'doctor', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UTC', 'active', ?, ?)
```

Bind: add `session.data.hospitalId || null, session.data.specialty || null`

- [ ] **Step 7: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: add hospital selection and Google Calendar OAuth to doctor onboarding"
```

---

### Task 5: Patient booking — hospital hierarchy + FreeBusy slots

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Rewrite `showBooking` to list hospitals first**

Replace `showBooking`:

```typescript
private async showBooking(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
  const hospitals = await this.db.prepare(
    'SELECT id, name FROM providers WHERE type = ? AND status = ? ORDER BY name ASC'
  ).bind('hospital', 'active').all();

  if (!hospitals.results || hospitals.results.length === 0) {
    await plugin.send(message.chatId, { text: '🏥 No hospitals available right now.' });
    return;
  }

  const buttons = (hospitals.results as any[]).map(h => [
    { text: `🏥 ${h.name}`, callbackData: `book:hospital:${h.id}` },
  ]);
  await plugin.sendWithButtons(message.chatId, '🏥 <b>Select a hospital:</b>', buttons);
}
```

- [ ] **Step 2: Add `book:hospital:` callback → list doctors at hospital**

```typescript
} else if (data.startsWith('book:hospital:')) {
  const hospitalId = data.split(':')[2];
  await this.showHospitalDoctors(message, session, plugin, hospitalId);
}
```

New method:

```typescript
private async showHospitalDoctors(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, hospitalId: string
): Promise<void> {
  const doctors = await this.db.prepare(
    'SELECT id, name, specialty FROM providers WHERE hospital_id = ? AND type = ? AND status = ? ORDER BY name ASC'
  ).bind(hospitalId, 'doctor', 'active').all();

  if (!doctors.results || doctors.results.length === 0) {
    await plugin.send(message.chatId, { text: '👨‍⚕️ No doctors at this hospital.' });
    return;
  }

  const hospital = await this.db.prepare('SELECT name FROM providers WHERE id = ?').bind(hospitalId).first() as any;
  session.data.bookHospitalId = hospitalId;

  const buttons = (doctors.results as any[]).map(doc => [
    { text: `👨‍⚕️ ${doc.name}${doc.specialty ? ` (${doc.specialty})` : ''}`, callbackData: `book:doctor:${doc.id}` },
  ]);
  await plugin.sendWithButtons(message.chatId, `👨‍⚕️ <b>${hospital.name}</b>\nSelect a doctor:`, buttons);
}
```

- [ ] **Step 3: Rewrite `showAvailableDates` to use FreeBusy API**

Replace the existing `showAvailableDates` method. Instead of querying `availability_windows`, use `checkCalendarConflicts`:

```typescript
private async showAvailableDates(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, serviceId: string
): Promise<void> {
  const doctorId = session.data.bookDoctorId;
  session.data.bookServiceId = serviceId;

  // Get service for duration
  const service = await this.db.prepare(
    'SELECT duration_minutes FROM services WHERE id = ?'
  ).bind(serviceId).first() as any;

  if (!service) {
    await plugin.send(message.chatId, { text: '❌ Service not found.' });
    return;
  }

  const duration = service.duration_minutes || 30;
  const buttons: any[][] = [];
  const now = new Date();

  // Generate 7 days of 30-min slots during default hours (9-17)
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);

    for (let h = 9; h < 17; h++) {
      for (let m = 0; m < 60; m += 30) {
        const slotStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

        // Skip past slots
        if (slotStart <= now) continue;

        // Check calendar conflicts via FreeBusy
        const { checkCalendarConflicts } = await import('../../lib/calendar/sync');
        const hasConflict = await checkCalendarConflicts(this.env as any, doctorId, slotStart, slotEnd);

        if (!hasConflict) {
          const dateStr = slotStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          const epoch = Math.floor(slotStart.getTime() / 1000);
          buttons.push([{ text: `${dateStr} ${timeStr}`, callbackData: `book:slot:${serviceId}:${epoch}` }]);
        }
      }
    }
  }

  if (buttons.length === 0) {
    await plugin.send(message.chatId, { text: '📅 No slots available in the next 7 days.' });
    return;
  }

  await plugin.sendWithButtons(message.chatId, '📅 <b>Pick a time slot:</b>', buttons.slice(0, 20));
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: update booking to use hospital hierarchy and FreeBusy slots"
```

---

### Task 6: Booking — tentative calendar event + approve/confirm/reject

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Update `createBooking` to create tentative calendar event + DB record**

Replace the existing `createBooking` method. Key changes:
- Create a tentative calendar event first
- Store appointment in DB as `pending` (so doctor can look it up)
- Use the appointment ID as the callback identifier

```typescript
private async createBooking(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin,
  serviceId: string, startTime: number
): Promise<void> {
  const doctorId = session.data.bookDoctorId;
  const customerName = session.data.name || 'Patient';

  const service = await this.db.prepare(
    'SELECT name, duration_minutes FROM services WHERE id = ?'
  ).bind(serviceId).first() as any;

  if (!service) { await plugin.send(message.chatId, { text: '❌ Service not found.' }); return; }

  const endTime = startTime + service.duration_minutes * 60;
  const startDate = new Date(startTime * 1000);
  const endDate = new Date(endTime * 1000);

  // Create tentative calendar event
  const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
  const calClient = await getCalendarClientForProvider(this.env as any, doctorId);

  let googleEventId: string | null = null;
  if (calClient) {
    try {
      const event = await calClient.createEvent({
        summary: `Appointment: ${service.name}`,
        description: `Booking with ${customerName}\nStatus: TENTATIVE - awaiting doctor approval`,
        startTime: startDate,
        endTime: endDate,
        status: 'tentative',
        transparency: 'transparent',
      });
      googleEventId = event.id;
    } catch (e) {
      console.error('Failed to create tentative calendar event:', e);
      await plugin.send(message.chatId, { text: '❌ Failed to create booking. Please try again.' });
      return;
    }
  }

  // Check if this is a reschedule flow
  if (session.data.rescheduleAptId) {
    const oldAptId = session.data.rescheduleAptId;
    const oldApt = await this.db.prepare(
      'SELECT google_event_id, customer_name, customer_telegram_id FROM appointments WHERE id = ?'
    ).bind(oldAptId).first() as any;

    if (oldApt?.google_event_id) {
      // Delete old tentative event
      const oldCalClient = await getCalendarClientForProvider(this.env as any, doctorId);
      if (oldCalClient) {
        try { await oldCalClient.deleteEvent(oldApt.google_event_id); } catch (e) { /* ignore */ }
      }
    }

    // Update existing appointment with new time and tentative event
    await this.db.prepare(
      'UPDATE appointments SET start_time = ?, end_time = ?, google_event_id = ?, status = ?, updated_at = ? WHERE id = ?'
    ).bind(startTime, endTime, googleEventId, 'pending', Math.floor(Date.now() / 1000), oldAptId).run();

    // Notify patient
    await plugin.send(oldApt.customer_telegram_id || session.platformUserId, {
      text: `🔄 Appointment rescheduled!\n\n📅 ${dateStr} ${timeStr}\n🏥 ${service.name}\n\nWaiting for doctor confirmation...`,
    });

    // Notify doctor
    const doctor = await this.db.prepare(
      'SELECT platform, platform_user_id FROM providers WHERE id = ?'
    ).bind(doctorId).first() as any;

    if (doctor?.platform && doctor?.platform_user_id) {
      const doctorPlugin = this.pluginManager.get(doctor.platform as any);
      if (doctorPlugin) {
        await doctorPlugin.sendWithButtons(doctor.platform_user_id,
          `🔄 <b>Rescheduled Booking</b>\n\n👤 ${oldApt.customer_name}\n🏥 ${service.name}\n📅 ${dateStr} ${timeStr}`,
          [
            [{ text: '✅ Approve', callbackData: `apt:approve:${oldAptId}` }],
            [{ text: '❌ Reject', callbackData: `apt:reject:${oldAptId}` }],
          ]
        );
      }
    }

    delete session.data.rescheduleAptId;
    return;
  }

  // Create DB record as 'pending' — so doctor can look it up from their chat
  const aptId = crypto.randomUUID();
  await this.db.prepare(
    `INSERT INTO appointments (id, provider_id, service_id, customer_name, customer_telegram_id, start_time, end_time, status, google_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).bind(aptId, doctorId, serviceId, customerName, session.platformUserId,
    startTime, endTime, googleEventId,
    Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

  // Notify patient
  const dateStr = startDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  await plugin.send(message.chatId, {
    text: `✅ Booking requested!\n\n📅 ${dateStr} ${timeStr}\n👨‍⚕️ ${service.name}\n\nWaiting for doctor confirmation...`,
  });

  // Notify doctor with appointment ID as callback key
  const doctor = await this.db.prepare(
    'SELECT platform, platform_user_id FROM providers WHERE id = ?'
  ).bind(doctorId).first() as any;

  if (doctor?.platform && doctor?.platform_user_id) {
    const pluginManager = this.pluginManager;
    const doctorPlugin = pluginManager.get(doctor.platform as any);
    if (doctorPlugin) {
      await doctorPlugin.sendWithButtons(doctor.platform_user_id,
        `📋 <b>New Booking Request</b>\n\n👤 ${customerName}\n🏥 ${service.name}\n📅 ${dateStr} ${timeStr}`,
        [
          [{ text: '✅ Approve', callbackData: `apt:approve:${aptId}` }],
          [{ text: '❌ Reject', callbackData: `apt:reject:${aptId}` }],
          [{ text: '🔄 Reschedule', callbackData: `apt:reschedule:${aptId}` }],
        ]
      );
    }
  }
}
```

- [ ] **Step 2: Update `handleAppointmentAction` — approve confirms calendar + updates DB, reject deletes event**

```typescript
private async handleAppointmentAction(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin,
  appointmentId: string, newStatus: 'confirmed' | 'cancelled'
): Promise<void> {
  // Look up appointment from DB (not session — doctor is a different user)
  const appointment = await this.db.prepare(
    'SELECT a.*, p.platform as doctor_platform, p.platform_user_id as doctor_platform_user_id FROM appointments a JOIN providers p ON a.provider_id = p.id WHERE a.id = ?'
  ).bind(appointmentId).first() as any;

  if (!appointment) {
    await plugin.send(message.chatId, { text: '❌ Appointment not found.' });
    return;
  }

  // Verify this doctor owns the appointment
  if (appointment.doctor_platform_user_id !== session.platformUserId) {
    await plugin.send(message.chatId, { text: '❌ Not authorized.' });
    return;
  }

  if (newStatus === 'confirmed') {
    // Confirm calendar event
    if (appointment.google_event_id) {
      const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
      const calClient = await getCalendarClientForProvider(this.env as any, appointment.provider_id);
      if (calClient) {
        try {
          await calClient.updateEvent(appointment.google_event_id, {
            status: 'confirmed',
            transparency: 'opaque',
          });
        } catch (e) {
          console.error('Failed to confirm calendar event:', e);
        }
      }
    }

    // Update DB status
    await this.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
      .bind('confirmed', Math.floor(Date.now() / 1000), appointmentId).run();

    await plugin.send(message.chatId, { text: `✅ Appointment approved for ${appointment.customer_name}.` });

    // Notify patient
    const dateStr = new Date(appointment.start_time * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = new Date(appointment.start_time * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    await plugin.send(appointment.customer_telegram_id, {
      text: `✅ Your appointment is confirmed!\n📅 ${dateStr} ${timeStr}`,
    });

  } else if (newStatus === 'cancelled') {
    // Delete tentative calendar event
    if (appointment.google_event_id) {
      const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
      const calClient = await getCalendarClientForProvider(this.env as any, appointment.provider_id);
      if (calClient) {
        try {
          await calClient.deleteEvent(appointment.google_event_id);
        } catch (e) {
          console.error('Failed to delete tentative event:', e);
        }
      }
    }

    // Delete appointment record (tentative booking rejected)
    await this.db.prepare('DELETE FROM appointments WHERE id = ?').bind(appointmentId).run();

    await plugin.send(message.chatId, { text: `❌ Appointment rejected for ${appointment.customer_name}.` });

    // Notify patient
    const dateStr = new Date(appointment.start_time * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = new Date(appointment.start_time * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    await plugin.send(appointment.customer_telegram_id, {
      text: `❌ Your appointment was declined.\n📅 ${dateStr} ${timeStr}\nPlease book another slot.`,
    });
  }
}
```

- [ ] **Step 2b: Add `apt:reschedule:` callback handler + reschedule flow**

In `handleCallback`:

```typescript
} else if (data.startsWith('apt:reschedule:')) {
  const aptId = data.split(':')[2];
  await this.showRescheduleForDoctor(message, session, plugin, aptId);
}
```

New method — doctor picks a new slot, tentative event is updated, patient is notified:

```typescript
private async showRescheduleForDoctor(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, aptId: string
): Promise<void> {
  const appointment = await this.db.prepare(
    'SELECT provider_id, service_id FROM appointments WHERE id = ?'
  ).bind(aptId).first() as any;

  if (!appointment) {
    await plugin.send(message.chatId, { text: '❌ Appointment not found.' }); return;
  }

  // Store reschedule context
  session.data.rescheduleAptId = aptId;
  session.data.bookDoctorId = appointment.provider_id;
  session.data.bookServiceId = appointment.service_id;

  // Show available slots using FreeBusy
  await this.showAvailableDates(message, session, plugin, appointment.service_id);
}
```

In `createBooking`, add a check at the top: if `session.data.rescheduleAptId` exists, update the existing appointment instead of creating a new one, delete old calendar event, create new tentative event, notify patient of new time.

- [ ] **Step 3: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: tentative calendar event on booking, confirm on approve, delete on reject, reschedule flow"
```

---

### Task 7: Integration verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: All pass

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```
Expected: No new errors

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: No new errors

- [ ] **Step 4: Deploy**

```bash
npx wrangler deploy
```

- [ ] **Step 5: Manual test via Telegram**

1. `/register_hospital` → create a hospital
2. `/register_doctor` → name → TOTP → pick hospital → pick specialty → calendar OAuth
3. `/book` → pick hospital → pick doctor → pick service → see slots from calendar
4. Pick slot → tentative event on calendar → doctor gets approve/reject buttons
5. Doctor approves → event confirmed → patient gets confirmation
