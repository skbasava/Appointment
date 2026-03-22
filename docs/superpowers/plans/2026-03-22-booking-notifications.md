# Platform-Agnostic Booking + Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable patients to discover and book doctors, with platform-agnostic notifications to both doctor and patient via Telegram/WhatsApp/SnapChat.

**Architecture:** Add `platform` + `platform_user_id` to providers table. Update booking flow to notify doctors and patients via their registered platform using existing `PluginManager`. Change reminders from 1hr to 10min.

**Tech Stack:** Cloudflare Workers, Hono, D1 (SQLite), Telegram Bot API

---

### Task 1: Add platform columns to providers table

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/db/types.ts`
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Add columns to D1**

```bash
cd /home/satish/Downloads/appointment/appoint
npx wrangler d1 execute appoint-db --remote --command "ALTER TABLE providers ADD COLUMN platform TEXT"
npx wrangler d1 execute appoint-db --remote --command "ALTER TABLE providers ADD COLUMN platform_user_id TEXT"
```

- [ ] **Step 2: Update Provider interface in types.ts**

Add to `Provider` interface:
```typescript
platform?: string;
platform_user_id?: string;
```

- [ ] **Step 3: Update saveDoctor to store platform**

In `src/lib/messaging/onboarding-flow.ts`, update the INSERT to include `platform` and `platform_user_id`:
```typescript
INSERT INTO providers (..., platform, platform_user_id)
VALUES (..., ?, ?)
```
Bind: `session.platform`, `session.platformUserId`

- [ ] **Step 4: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.sql src/db/types.ts src/lib/messaging/onboarding-flow.ts
git commit -m "feat: add platform columns to providers for multi-channel support"
```

---

### Task 2: Add provider queries

**Files:**
- Modify: `src/db/queries/providers.ts`

- [ ] **Step 1: Add getActiveDoctors query**

```typescript
export async function getActiveDoctors(db: D1Database, limit = 20, offset = 0) {
  const results = await db.prepare(
    'SELECT id, name, phone, platform, platform_user_id FROM providers WHERE type = ? AND status = ? ORDER BY name ASC LIMIT ? OFFSET ?'
  ).bind('doctor', 'active', limit, offset).all();
  return results.results;
}
```

- [ ] **Step 2: Add getProviderByPlatformUserId query**

```typescript
export async function getProviderByPlatformUserId(db: D1Database, platformUserId: string) {
  return await db.prepare(
    'SELECT * FROM providers WHERE platform_user_id = ?'
  ).bind(platformUserId).first();
}
```

- [ ] **Step 3: Run tests and commit**

```bash
npx vitest run
git add src/db/queries/providers.ts
git commit -m "feat: add provider search and platform lookup queries"
```

---

### Task 3: Update /book command — doctor list + service selection

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Update showBooking method**

Replace the current `showBooking` that sends a URL. Query active doctors and show as buttons:

```typescript
private async showBooking(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
  const doctors = await this.db.prepare(
    'SELECT id, name, phone FROM providers WHERE type = ? AND status = ? ORDER BY name ASC LIMIT 10'
  ).bind('doctor', 'active').all();

  if (!doctors.results || doctors.results.length === 0) {
    await plugin.send(message.chatId, { text: '📅 No doctors available right now.' });
    return;
  }

  const buttons = (doctors.results as any[]).map(doc => [
    { text: `👨‍⚕️ ${doc.name}`, callbackData: `book:doctor:${doc.id}` },
  ]);
  await plugin.sendWithButtons(message.chatId, '📅 <b>Select a doctor:</b>', buttons);
}
```

- [ ] **Step 2: Add book:doctor callback + showDoctorServices**

In `handleCallback`:
```typescript
} else if (data.startsWith('book:doctor:')) {
  const doctorId = data.split(':')[2];
  await this.showDoctorServices(message, session, plugin, doctorId);
}
```

Add method that queries doctor's services and shows as buttons:
```typescript
private async showDoctorServices(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, doctorId: string
): Promise<void> {
  const doctor = await this.db.prepare('SELECT name FROM providers WHERE id = ?').bind(doctorId).first() as any;
  if (!doctor) { await plugin.send(message.chatId, { text: '❌ Doctor not found.' }); return; }

  const services = await this.db.prepare(
    'SELECT id, name, duration_minutes FROM services WHERE provider_id = ? AND is_active = 1'
  ).bind(doctorId).all();

  if (!services.results || services.results.length === 0) {
    await plugin.send(message.chatId, { text: `📅 ${doctor.name} has no services.` }); return;
  }

  session.data.bookDoctorId = doctorId;
  const buttons = (services.results as any[]).map(svc => [
    { text: `${svc.name} (${svc.duration_minutes}min)`, callbackData: `book:service:${svc.id}` },
  ]);
  await plugin.sendWithButtons(message.chatId, `📅 <b>${doctor.name}</b>\nSelect a service:`, buttons);
}
```

- [ ] **Step 3: Tests and commit**

```bash
npx vitest run
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: add doctor browsing and service selection in /book"
```

---

### Task 4: Slot selection + booking + doctor notification

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`
- Modify: `src/lib/booking/service.ts`

- [ ] **Step 1: Add book:service callback + showAvailableDates**

In `handleCallback`:
```typescript
} else if (data.startsWith('book:service:')) {
  const serviceId = data.split(':')[2];
  await this.showAvailableDates(message, session, plugin, serviceId);
}
```

Add `showAvailableDates` method:
```typescript
private async showAvailableDates(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, serviceId: string
): Promise<void> {
  const doctorId = session.data.bookDoctorId;
  // Get doctor's availability windows
  const windows = await this.db.prepare(
    'SELECT day_of_week, start_time, end_time FROM availability_windows WHERE provider_id = ? AND is_active = 1'
  ).bind(doctorId).all();

  if (!windows.results || windows.results.length === 0) {
    await plugin.send(message.chatId, { text: '📅 No availability set.' }); return;
  }

  // Generate next 7 days of slots (30-min intervals)
  const buttons: any[][] = [];
  const now = new Date();
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dayOfWeek = date.getDay(); // 0=Sun
    const matchingWindows = (windows.results as any[]).filter(w => w.day_of_week === dayOfWeek);
    if (matchingWindows.length === 0) continue;

    for (const w of matchingWindows) {
      const [startH, startM] = w.start_time.split(':').map(Number);
      const [endH, endM] = w.end_time.split(':').map(Number);
      for (let h = startH; h < endH; h++) {
        for (let m = 0; m < 60; m += 30) {
          if (h === startH && m < startM) continue;
          if (h === endH && m >= endM) continue;
          const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
          const epoch = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime() / 1000);
          buttons.push([{ text: `${dateStr} ${timeStr}`, callbackData: `book:slot:${serviceId}:${epoch}` }]);
        }
      }
    }
  }

  if (buttons.length === 0) {
    await plugin.send(message.chatId, { text: '📅 No slots available in the next 7 days.' }); return;
  }

  session.data.bookServiceId = serviceId;
  await plugin.sendWithButtons(message.chatId, '📅 <b>Pick a time slot:</b>', buttons.slice(0, 20)); // max 20 buttons
}
```

- [ ] **Step 2: Add book:slot callback — create booking**

In `handleCallback`:
```typescript
} else if (data.startsWith('book:slot:')) {
  const [, , serviceId, epoch] = data.split(':');
  await this.createBooking(message, session, plugin, serviceId, parseInt(epoch));
}
```

Add `createBooking` method:
```typescript
private async createBooking(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin,
  serviceId: string, startTime: number
): Promise<void> {
  const doctorId = session.data.bookDoctorId;
  const customerName = session.data.name || 'Patient';

  // Get service for duration
  const service = await this.db.prepare(
    'SELECT name, duration_minutes FROM services WHERE id = ?'
  ).bind(serviceId).first() as any;

  if (!service) { await plugin.send(message.chatId, { text: '❌ Service not found.' }); return; }

  // Check conflicts
  const conflicts = await this.db.prepare(
    'SELECT id FROM appointments WHERE provider_id = ? AND status != ? AND start_time < ? AND end_time > ?'
  ).bind(doctorId, 'cancelled', startTime + service.duration_minutes * 60, startTime).all();

  if (conflicts.results && conflicts.results.length > 0) {
    await plugin.send(message.chatId, { text: '❌ That slot is no longer available. Please pick another.' }); return;
  }

  // Create appointment
  const aptId = crypto.randomUUID();
  const endTime = startTime + service.duration_minutes * 60;
  await this.db.prepare(
    `INSERT INTO appointments (id, provider_id, service_id, customer_name, customer_telegram_id, start_time, end_time, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(aptId, doctorId, serviceId, customerName, session.platformUserId, startTime, endTime,
    Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

  // Notify patient
  const dateStr = new Date(startTime * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = new Date(startTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  await plugin.send(message.chatId, {
    text: `✅ Booking requested!\n\n📅 ${dateStr} ${timeStr}\n👨‍⚕️ ${service.name}\n\nWaiting for doctor confirmation...`,
  });

  // Notify doctor
  const doctor = await this.db.prepare(
    'SELECT platform, platform_user_id FROM providers WHERE id = ?'
  ).bind(doctorId).first() as any;

  if (doctor?.platform && doctor?.platform_user_id) {
    // Send via PluginManager — platform-agnostic
    const { PluginManager } = await import('../messaging/plugin');
    const plugins = new PluginManager();
    // Import telegram plugin for now (extend for other platforms)
    const { TelegramPlugin } = await import('../messaging/telegram-plugin');
    plugins.register('telegram', new TelegramPlugin(this.env));

    await plugins.send(doctor.platform as any, doctor.platform_user_id, {
      text: `📋 <b>New Booking Request</b>\n\n👤 ${customerName}\n🏥 ${service.name}\n📅 ${dateStr} ${timeStr}`,
      buttons: [
        { text: '✅ Approve', callbackData: `apt:approve:${aptId}` },
        { text: '❌ Reject', callbackData: `apt:reject:${aptId}` },
        { text: '🔄 Reschedule', callbackData: `apt:reschedule:${aptId}` },
      ],
    });
  }
}
```

- [ ] **Step 3: Tests and commit**

```bash
npx vitest run
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: slot selection, booking creation, and doctor notification with approve/reject/reschedule"
```

---

### Task 5: Patient notification on approve/reject/reschedule

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts` (handleAppointmentAction)

- [ ] **Step 1: Update handleAppointmentAction to notify patient**

After doctor approves/rejects, look up appointment details and notify patient:

```typescript
private async handleAppointmentAction(
  message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin,
  appointmentId: string, newStatus: 'confirmed' | 'cancelled'
): Promise<void> {
  // ... existing validation ...

  await this.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
    .bind(newStatus, Math.floor(Date.now() / 1000), appointmentId).run();

  // Notify doctor (confirmation)
  const emoji = newStatus === 'confirmed' ? '✅' : '❌';
  const action = newStatus === 'confirmed' ? 'approved' : 'rejected';
  await plugin.send(message.chatId, { text: `${emoji} Appointment ${action} for ${appointment.customer_name}.` });

  // Notify patient
  if (appointment.customer_telegram_id) {
    const dateStr = new Date(appointment.start_time * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = new Date(appointment.start_time * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const msg = newStatus === 'confirmed'
      ? `✅ Your appointment is confirmed!\n📅 ${dateStr} ${timeStr}`
      : `❌ Your appointment was declined.\n📅 ${dateStr} ${timeStr}\nPlease book another slot.`;
    await plugin.send(appointment.customer_telegram_id, { text: msg });
  }
}
```

- [ ] **Step 2: Add reschedule callback handler**

Add `apt:reschedule:` handler. Doctor picks a new time, appointment updated, patient notified:

```typescript
} else if (data.startsWith('apt:reschedule:')) {
  const aptId = data.split(':')[2];
  await this.showRescheduleOptions(message, session, plugin, aptId);
}
```

`showRescheduleOptions` shows available slots like `showAvailableDates`, but when doctor picks one, updates the appointment and notifies the patient.

- [ ] **Step 3: Tests and commit**

```bash
npx vitest run
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: notify patient on approve/reject/reschedule"
```

---

### Task 6: Change reminder to 10 minutes + notify both parties

**Files:**
- Modify: `src/api/cron/reminders.ts`
- Modify: `src/lib/notifications/service.ts`

- [ ] **Step 1: Change reminder time to 10 minutes**

In `src/api/cron/reminders.ts`, change the time window:
```typescript
const tenMinutesFromNow = now + 600; // 10 * 60 seconds
```

- [ ] **Step 2: Add doctor notification via JOIN**

The appointments table doesn't have `platform` — need to JOIN with providers:

```typescript
const appointments = await db.prepare(
  `SELECT a.*, p.platform as doctor_platform, p.platform_user_id as doctor_platform_user_id
   FROM appointments a
   JOIN providers p ON a.provider_id = p.id
   WHERE a.status = 'confirmed' AND a.start_time BETWEEN ? AND ?`
).bind(tenMinutesFromNow - 60, tenMinutesFromNow).all();
```

- [ ] **Step 3: Notify both doctor and patient**

For each appointment, send reminder to both:
```typescript
for (const apt of appointments.results) {
  // Notify patient (existing)
  await notificationService.sendReminder(apt);

  // Notify doctor (new)
  if (apt.doctor_platform && apt.doctor_platform_user_id) {
    await pluginManager.send(apt.doctor_platform, apt.doctor_platform_user_id, {
      text: `⏰ Reminder: ${apt.customer_name} in 10 minutes`
    });
  }
}
```

- [ ] **Step 4: Tests and commit**

```bash
npx vitest run
git add src/api/cron/reminders.ts
git commit -m "feat: 10-min reminders to both doctor and patient"
```

---

### Task 7: Integration verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Deploy**

Run: `npx wrangler deploy`

- [ ] **Step 4: Test via Telegram**

1. Register as doctor → verify `platform` and `platform_user_id` stored
2. `/book` → see doctors → select → pick slot → booking created with `pending` status
3. Doctor gets notification with Approve/Reject/Reschedule buttons
4. Doctor approves → patient gets confirmation
5. Reschedule flow works
