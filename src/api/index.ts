import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env } from '../db/types';
import { errorHandler } from './middleware/error';
import { telegramAuthMiddleware } from '../lib/auth/telegram';
import { phoneOtpMiddleware } from '../lib/auth/middleware';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', errorHandler());

// Public routes
app.get('/', (c) => c.json({ status: 'ok', service: 'appoint' }));

// Messaging platform webhooks
app.post('/api/telegram/webhook', async (c) => {
  const { telegramWebhook } = await import('./routes/telegram');
  return telegramWebhook(c);
});

app.post('/api/whatsapp/webhook', async (c) => {
  const { whatsappWebhook } = await import('./routes/whatsapp');
  return whatsappWebhook(c);
});

// WhatsApp webhook verification (required by Meta)
app.get('/api/whatsapp/webhook', async (c) => {
  const { whatsappVerify } = await import('./routes/whatsapp');
  return whatsappVerify(c);
});

// Customer routes (Telegram auth)
app.get('/api/providers/:id/available-slots', telegramAuthMiddleware, async (c) => {
  const { getAvailableSlots } = await import('./routes/providers');
  return getAvailableSlots(c);
});

app.post('/api/appointments', telegramAuthMiddleware, async (c) => {
  const { createAppointment } = await import('./routes/appointments');
  return createAppointment(c);
});

app.get('/api/appointments', telegramAuthMiddleware, async (c) => {
  const { listCustomerAppointments } = await import('./routes/appointments');
  return listCustomerAppointments(c);
});

app.get('/api/appointments/:id', telegramAuthMiddleware, async (c) => {
  const { getAppointment } = await import('./routes/appointments');
  return getAppointment(c);
});

app.put('/api/appointments/:id/reschedule', telegramAuthMiddleware, async (c) => {
  const { rescheduleAppointment } = await import('./routes/appointments');
  return rescheduleAppointment(c);
});

app.put('/api/appointments/:id/cancel', telegramAuthMiddleware, async (c) => {
  const { cancelAppointment } = await import('./routes/appointments');
  return cancelAppointment(c);
});

// Patient web endpoints (OTP auth)
app.post('/api/patients/otp/send', async (c) => {
  const { sendPatientOTP } = await import('./routes/patients');
  return sendPatientOTP(c);
});

app.post('/api/patients/otp/verify', async (c) => {
  const { verifyPatientOTP } = await import('./routes/patients');
  return verifyPatientOTP(c);
});

app.get('/api/patients/me', phoneOtpMiddleware, async (c) => {
  const { getPatientProfile } = await import('./routes/patients');
  return getPatientProfile(c as any);
});

// Provider routes (OTP auth)
app.post('/api/providers/register', phoneOtpMiddleware, async (c) => {
  const { registerProvider } = await import('./routes/providers');
  return registerProvider(c as any);
});

app.get('/api/providers/:id/services', phoneOtpMiddleware, async (c) => {
  const { listServices } = await import('./routes/providers');
  return listServices(c as any);
});

app.post('/api/providers/:id/services', phoneOtpMiddleware, async (c) => {
  const { createService } = await import('./routes/providers');
  return createService(c as any);
});

app.post('/api/providers/:id/availability', phoneOtpMiddleware, async (c) => {
  const { setAvailability } = await import('./routes/providers');
  return setAvailability(c as any);
});

app.post('/api/providers/:id/blocked-dates', phoneOtpMiddleware, async (c) => {
  const { addBlockedDate } = await import('./routes/providers');
  return addBlockedDate(c as any);
});

app.put('/api/appointments/:id/approve', phoneOtpMiddleware, async (c) => {
  const { approveAppointment } = await import('./routes/appointments');
  return approveAppointment(c as any);
});

app.put('/api/appointments/:id/reject', phoneOtpMiddleware, async (c) => {
  const { rejectAppointment } = await import('./routes/appointments');
  return rejectAppointment(c as any);
});

// Calendar routes (public)
app.get('/api/providers/:id/calendar/oauth-url', async (c) => {
  const { getCalendarOAuthUrl } = await import('./routes/calendar');
  return getCalendarOAuthUrl(c);
});

// Single OAuth callback for all providers (state param contains provider_id)
app.get('/api/calendar/callback', async (c) => {
  const { calendarCallback } = await import('./routes/calendar');
  return calendarCallback(c);
});

// Calendar routes (OTP auth)
app.get('/api/providers/:id/calendar/connect', phoneOtpMiddleware, async (c) => {
  const { connectCalendar } = await import('./routes/calendar');
  return connectCalendar(c as any);
});

app.get('/api/providers/:id/calendar/status', phoneOtpMiddleware, async (c) => {
  const { getCalendarStatus } = await import('./routes/calendar');
  return getCalendarStatus(c as any);
});

app.get('/api/providers/:id/calendar/list', phoneOtpMiddleware, async (c) => {
  const { listCalendars } = await import('./routes/calendar');
  return listCalendars(c as any);
});

app.post('/api/providers/:id/calendar/select', phoneOtpMiddleware, async (c) => {
  const { selectCalendar } = await import('./routes/calendar');
  return selectCalendar(c as any);
});

app.post('/api/providers/:id/calendar/disconnect', phoneOtpMiddleware, async (c) => {
  const { disconnectCalendar } = await import('./routes/calendar');
  return disconnectCalendar(c as any);
});

// Static UI routes
app.get('/provider/*', async (c) => {
  return c.html(await import('../ui/pages/provider-register.html').then(m => m.default));
});

app.get('/booking/*', async (c) => {
  return c.html(await import('../ui/pages/booking.html').then(m => m.default));
});

app.get('/appointments/*', async (c) => {
  return c.html(await import('../ui/pages/appointments.html').then(m => m.default));
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const { sendReminders } = await import('./cron/reminders');
    await sendReminders(env);
  },
};
