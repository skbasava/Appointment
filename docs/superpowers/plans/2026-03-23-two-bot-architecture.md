# Two-Bot Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single Telegram bot into two separate bots — Patient Bot and Doctor Bot — with clear command separation and independent webhooks.

**Architecture:** Two Telegram bots with separate tokens and webhooks. Patient Bot handles `/book`, `/appointments`, `/cancel` and patient booking flow. Doctor Bot handles `/pending`, `/approve`, `/reject` and doctor appointment management. Shared `BookingFlow` class handles core logic, both bots call into it.

**Tech Stack:** Cloudflare Workers, D1 Database, Telegram Bot API, TypeScript

---

## File Structure

### Files to Create
- `src/api/routes/doctor-telegram.ts` — Doctor Bot webhook handler (mirrors telegram.ts)
- `src/lib/messaging/doctor-bot.ts` — Doctor Bot command handler

### Files to Modify
- `wrangler.toml` — Add `DOCTOR_TELEGRAM_BOT_TOKEN` env var
- `src/api/routes/telegram.ts` — Simplify to patient-only, remove doctor logic
- `src/lib/messaging/booking-flow.ts` — Send notifications to correct bot based on recipient
- `src/lib/messaging/appointment-bot.ts` — Patient-only commands
- `src/api/index.ts` — Add doctor webhook route

### Files to Remove (later)
- None — keep both bots using shared code

---

### Task 1: Create Doctor Bot Command Handler

**Files:**
- Create: `src/lib/messaging/doctor-bot.ts`

- [ ] **Step 1: Create DoctorBot class**

```typescript
// Doctor Bot - handles doctor-facing commands
// /pending - show pending booking requests
// /schedule - show today's appointments
// /availability - manage availability

import type { MessagingPlugin } from './plugin';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../../db/types';

export class DoctorBot {
  private plugin: MessagingPlugin;
  private db: D1Database;
  private env: Env;

  constructor(plugin: MessagingPlugin, db: D1Database, env: Env) {
    this.plugin = plugin;
    this.db = db;
    this.env = env;
  }

  async handleMessage(message: {
    chatId: string;
    userId?: string;
    text?: string;
    callbackData?: string;
    type: string;
  }): Promise<void> {
    const { chatId, text, callbackData, userId } = message;

    if (callbackData?.startsWith('apt:')) {
      await this.handleApprovalCallback(chatId, userId || chatId, callbackData);
      return;
    }

    if (text === '/pending') {
      await this.showPending(chatId);
    } else if (text === '/schedule') {
      await this.showSchedule(chatId);
    } else if (text === '/start') {
      await this.plugin.send(chatId, {
        text: '👨‍⚕️ <b>Doctor Bot</b>\n\n/pending - View pending requests\n/schedule - Today\'s appointments\n/help - Show commands',
      });
    } else if (text === '/help') {
      await this.plugin.send(chatId, {
        text: '👨‍⚕️ <b>Doctor Bot Commands</b>\n\n/pending - Pending booking requests\n/schedule - Today\'s appointments\n/help - This message',
      });
    } else {
      await this.plugin.send(chatId, {
        text: 'Use /pending, /schedule, or /help',
      });
    }
  }

  private async handleApprovalCallback(chatId: string, userId: string, callbackData: string): Promise<void> {
    const parts = callbackData.split(':');
    const action = parts[1]; // approve, reject, reschedule
    const appointmentId = parts[2];

    // Verify this doctor owns the appointment
    const appointment = await this.db.prepare(
      `SELECT a.*, p.platform_user_id as doctor_user_id, s.name as service_name
       FROM appointments a
       JOIN providers p ON a.provider_id = p.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.id = ?`
    ).bind(appointmentId).first<any>();

    if (!appointment) {
      await this.plugin.send(chatId, { text: '❌ Appointment not found.' });
      return;
    }

    if (appointment.doctor_user_id !== userId) {
      await this.plugin.send(chatId, { text: '❌ Not your appointment.' });
      return;
    }

    if (action === 'approve') {
      // Create Google Calendar event
      const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
      const calClient = await getCalendarClientForProvider(this.env, appointment.provider_id);
      if (calClient) {
        try {
          const event = await calClient.createEvent({
            summary: `Appointment: ${appointment.customer_name}`,
            description: `Appointment with ${appointment.customer_name}`,
            startTime: new Date(appointment.start_time * 1000),
            endTime: new Date(appointment.end_time * 1000),
            status: 'confirmed',
            transparency: 'opaque',
          });
          await this.db.prepare('UPDATE appointments SET google_event_id = ? WHERE id = ?')
            .bind(event.id, appointmentId).run();
        } catch (e) {
          console.error('Calendar create failed:', e);
        }
      }

      await this.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
        .bind('confirmed', Math.floor(Date.now() / 1000), appointmentId).run();

      await this.plugin.send(chatId, { text: `✅ Approved: ${appointment.customer_name} — ${appointment.service_name}` });

      // Notify patient via patient bot
      await this.notifyPatient(appointment, 'confirmed');

    } else if (action === 'reject') {
      await this.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
        .bind('cancelled', Math.floor(Date.now() / 1000), appointmentId).run();

      await this.plugin.send(chatId, { text: `❌ Rejected: ${appointment.customer_name} — ${appointment.service_name}` });

      await this.notifyPatient(appointment, 'cancelled');
    }
  }

  private async notifyPatient(appointment: any, status: string): Promise<void> {
    // Send via patient bot (uses PATIENT bot token)
    const patientToken = this.env.TELEGRAM_BOT_TOKEN;
    if (!patientToken || !appointment.customer_telegram_id) return;

    const dateStr = new Date(appointment.start_time * 1000)
      .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    const timeStr = new Date(appointment.start_time * 1000)
      .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

    const emoji = status === 'confirmed' ? '✅' : '❌';
    const action = status === 'confirmed' ? 'confirmed' : 'cancelled';

    try {
      await fetch(`https://api.telegram.org/bot${patientToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: appointment.customer_telegram_id,
          text: `${emoji} Appointment ${action}!\n📅 ${dateStr} ${timeStr}`,
          parse_mode: 'HTML',
        }),
      });
    } catch (e) {
      console.error('Failed to notify patient:', e);
    }
  }

  private async showPending(chatId: string): Promise<void> {
    // Find doctor by platform_user_id
    const doctor = await this.db.prepare(
      'SELECT id, name FROM providers WHERE platform_user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(chatId, 'doctor').first<any>();

    if (!doctor) {
      await this.plugin.send(chatId, { text: '❌ You\'re not registered as a doctor. Use the main bot to register.' });
      return;
    }

    const appointments = await this.db.prepare(
      `SELECT a.*, s.name as service_name
       FROM appointments a LEFT JOIN services s ON a.service_id = s.id
       WHERE a.provider_id = ? AND a.status = 'pending' AND a.start_time >= ?
       ORDER BY a.start_time ASC LIMIT 10`
    ).bind(doctor.id, Math.floor(Date.now() / 1000)).all();

    if (!appointments.results || appointments.results.length === 0) {
      await this.plugin.send(chatId, { text: '✅ No pending requests.' });
      return;
    }

    for (const apt of (appointments.results as any[])) {
      const dateStr = new Date(apt.start_time * 1000)
        .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      const timeStr = new Date(apt.start_time * 1000)
        .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

      await this.plugin.sendWithButtons(chatId,
        `📋 <b>Pending</b>\n\n👤 ${apt.customer_name}\n🏥 ${apt.service_name}\n📅 ${dateStr} ${timeStr}`,
        [
          [{ text: '✅ Approve', callbackData: `apt:approve:${apt.id}` }],
          [{ text: '❌ Reject', callbackData: `apt:reject:${apt.id}` }],
        ]
      );
    }
  }

  private async showSchedule(chatId: string): Promise<void> {
    const doctor = await this.db.prepare(
      'SELECT id, name FROM providers WHERE platform_user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(chatId, 'doctor').first<any>();

    if (!doctor) {
      await this.plugin.send(chatId, { text: '❌ Not registered as doctor.' });
      return;
    }

    const now = new Date();
    const istNow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => istNow.find(p => p.type === type)?.value;
    const todayStr = `${get('year')}-${get('month')}-${get('day')}`;

    // IST midnight today
    const istMidnight = new Date(`${todayStr}T00:00:00+05:30`);
    const startEpoch = Math.floor(istMidnight.getTime() / 1000);
    const endEpoch = startEpoch + 86400;

    const appointments = await this.db.prepare(
      `SELECT a.*, s.name as service_name
       FROM appointments a LEFT JOIN services s ON a.service_id = s.id
       WHERE a.provider_id = ? AND a.status IN ('pending', 'confirmed') AND a.start_time >= ? AND a.start_time < ?
       ORDER BY a.start_time ASC`
    ).bind(doctor.id, startEpoch, endEpoch).all();

    if (!appointments.results || appointments.results.length === 0) {
      await this.plugin.send(chatId, { text: '📅 No appointments today.' });
      return;
    }

    const lines = (appointments.results as any[]).map(a => {
      const timeStr = new Date(a.start_time * 1000)
        .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      const emoji = a.status === 'confirmed' ? '✅' : '⏳';
      return `${emoji} ${timeStr} — ${a.customer_name} (${a.service_name})`;
    });

    await this.plugin.send(chatId, { text: `📅 <b>Today's Schedule</b>\n\n${lines.join('\n')}` });
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep doctor-bot`
Expected: No errors

---

### Task 2: Create Doctor Bot Webhook

**Files:**
- Create: `src/api/routes/doctor-telegram.ts`

- [ ] **Step 1: Create webhook handler**

```typescript
import { Hono } from 'hono';
import { PluginManager } from '../../lib/messaging/plugin';
import { DoctorBot } from '../../lib/messaging/doctor-bot';

let pm: PluginManager | null = null;
let doctorBot: DoctorBot | null = null;

function getHandlers(env: any) {
  if (!pm) {
    pm = new PluginManager();
    pm.register('telegram', {
      token: env.DOCTOR_TELEGRAM_BOT_TOKEN,
      baseUrl: env.BASE_URL || '',
    });
  }
  if (!doctorBot) {
    doctorBot = new DoctorBot(pm.get('telegram')!, env.DB, env);
  }
  return { pm, doctorBot };
}

const doctorTelegram = new Hono();

doctorTelegram.post('/webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.DOCTOR_WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const { pm, doctorBot } = getHandlers(c.env);
  const telegram = pm.get('telegram')!;
  const message = telegram.parseWebhook(body);

  if (!message) return c.json({ ok: true });

  await doctorBot.handleMessage(message);
  return c.json({ ok: true });
});

export default doctorTelegram;
```

- [ ] **Step 2: Add route to main app**

**Files:**
- Modify: `src/api/index.ts`

Add import and route:
```typescript
import doctorTelegram from './routes/doctor-telegram';
// ...
app.route('/api/doctor-telegram', doctorTelegram);
```

---

### Task 3: Update Environment Variables

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Add doctor bot token to wrangler.toml**

Add under `[vars]`:
```toml
DOCTOR_TELEGRAM_BOT_TOKEN = "<your-doctor-bot-token>"
DOCTOR_WEBHOOK_SECRET = "<generate-a-random-secret>"
```

- [ ] **Step 2: Add to Env types**

**Files:**
- Modify: `src/db/types.ts`

Add to Env interface:
```typescript
DOCTOR_TELEGRAM_BOT_TOKEN: string;
DOCTOR_WEBHOOK_SECRET: string;
```

---

### Task 4: Update Booking Flow to Use Correct Bot

**Files:**
- Modify: `src/lib/messaging/booking-flow.ts`

- [ ] **Step 1: Update doctor notification in createBooking**

In `createBooking`, send approve/reject buttons via the **doctor bot** (DOCTOR_TELEGRAM_BOT_TOKEN) instead of the patient bot. The doctor's `platform_user_id` is the same chat_id, but we use the doctor bot's token to send.

Replace the doctor notification section:
```typescript
// Notify doctor via doctor bot
if (doctor?.platform_user_id) {
  const doctorToken = this.env.DOCTOR_TELEGRAM_BOT_TOKEN;
  if (doctorToken) {
    try {
      await fetch(`https://api.telegram.org/bot${doctorToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: doctor.platform_user_id,
          text: `📋 <b>New Booking Request</b>\n\n👤 ${customerName}\n🏥 ${service.name}\n📅 ${dateStr} ${timeStr}`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Approve', callback_data: `apt:approve:${aptId}` }],
              [{ text: '❌ Reject', callback_data: `apt:reject:${aptId}` }],
            ],
          },
        }),
      });
    } catch (e) {
      console.error('Failed to notify doctor:', e);
    }
  }
}
```

- [ ] **Step 2: Remove approve/reject handling from BookingFlow**

Since approve/reject is now handled by `DoctorBot`, remove the `apt:approve:` and `apt:reject:` cases from `BookingFlow.handleCallback` and the `handleApproval` method.

---

### Task 5: Simplify Patient Bot

**Files:**
- Modify: `src/api/routes/telegram.ts`

- [ ] **Step 1: Remove doctor-specific routing**

The patient bot (telegram.ts) should only handle:
- Patient onboarding (`/register_patient`)
- Booking (`/book`, `/appointments`, `/cancel`)
- General help

Remove `/register_doctor` and `/register_hospital` from patient bot onboarding commands.

- [ ] **Step 2: Update help text**

Patient bot help:
```
👤 Patient Bot
/book - Book an appointment
/appointments - View your appointments
/cancel - Cancel an appointment
/help - Show commands
```

---

### Task 6: Set Up Doctor Bot Webhook

- [ ] **Step 1: Register doctor bot webhook**

After deploying, set the webhook for the doctor bot:

```bash
curl "https://api.telegram.org/bot<DOCTOR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://appoint.satish-aradhya.workers.dev/api/doctor-telegram/webhook", "secret_token": "<DOCTOR_WEBHOOK_SECRET>"}'
```

- [ ] **Step 2: Verify both bots respond**

Test patient bot: send `/book`
Test doctor bot: send `/pending`

---

### Task 7: Deploy and Test

- [ ] **Step 1: Deploy**

```bash
npm run deploy
```

- [ ] **Step 2: Set doctor bot webhook (after deploy)**

```bash
curl "https://api.telegram.org/bot<DOCTOR_TOKEN>/setWebhook?url=https://appoint.satish-aradhya.workers.dev/api/doctor-telegram/webhook"
```

- [ ] **Step 3: Test end-to-end flow**

1. Patient bot: `/book` → select doctor → select service → select day → select slot
2. Doctor bot: `/pending` → see the booking request → tap Approve
3. Patient bot: receive "✅ Appointment confirmed" message
4. Check Google Calendar for the event
