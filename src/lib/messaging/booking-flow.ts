import type { MessagingPlugin, MessageButton } from './plugin';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../../db/types';
import { getISTNow, istDate, formatDateIST, formatTimeIST } from '../timezone';

interface BookingSession {
  id: string;
  chat_id: string;
  user_id: string;
  step: string;
  doctor_id: string | null;
  service_id: string | null;
  slot_start: number | null;
  slot_end: number | null;
  appointment_id: string | null;
  data: string;
  created_at: number;
  updated_at: number;
}

export class BookingFlow {
  private plugin: MessagingPlugin;
  private db: D1Database;
  private env: Env;

  constructor(plugin: MessagingPlugin, db: D1Database, env: Env) {
    this.plugin = plugin;
    this.db = db;
    this.env = env;
  }

  // ─── Session Management (D1-backed) ─────────────────────────────

  private async getSession(chatId: string, userId: string): Promise<BookingSession> {
    const row = await this.db.prepare(
      'SELECT * FROM booking_sessions WHERE chat_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1'
    ).bind(chatId, userId).first<BookingSession>();

    if (row) return row;

    const now = Math.floor(Date.now() / 1000);
    const session: BookingSession = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      user_id: userId,
      step: 'idle',
      doctor_id: null,
      service_id: null,
      slot_start: null,
      slot_end: null,
      appointment_id: null,
      data: '{}',
      created_at: now,
      updated_at: now,
    };
    await this.db.prepare(
      `INSERT INTO booking_sessions (id, chat_id, user_id, step, data, created_at, updated_at)
       VALUES (?, ?, ?, 'idle', '{}', ?, ?)`
    ).bind(session.id, chatId, userId, now, now).run();
    return session;
  }

  private async updateSession(sessionId: string, updates: Record<string, unknown>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    sets.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(sessionId);
    await this.db.prepare(`UPDATE booking_sessions SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  private async resetSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, {
      step: 'idle', doctor_id: null, service_id: null,
      slot_start: null, slot_end: null, appointment_id: null, data: '{}',
    });
  }

  // ─── Callback Key Management (D1-backed) ────────────────────────

  private genKey(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  private async storeCallback(type: string, chatId: string, payload: object): Promise<string> {
    const key = this.genKey();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    await this.db.prepare(
      'INSERT INTO callback_keys (key, callback_type, payload, chat_id, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(key, type, JSON.stringify(payload), chatId, expiresAt).run();
    return key;
  }

  private async getCallback(key: string): Promise<{ type: string; payload: any; chat_id: string } | null> {
    const now = Math.floor(Date.now() / 1000);
    const row = await this.db.prepare(
      'SELECT callback_type, payload, chat_id FROM callback_keys WHERE key = ? AND expires_at > ?'
    ).bind(key, now).first<any>();
    if (!row) return null;
    return { type: row.callback_type, payload: JSON.parse(row.payload), chat_id: row.chat_id };
  }

  private async deleteCallback(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM callback_keys WHERE key = ?').bind(key).run();
  }

  // ─── Main Handler ───────────────────────────────────────────────

  async handleMessage(message: {
    chatId: string;
    userId?: string;
    text?: string;
    callbackData?: string;
    type: string;
  }): Promise<void> {
    const { chatId, text, callbackData, userId } = message;
    const effectiveUserId = userId || chatId;

    if (callbackData) {
      await this.handleCallback(chatId, effectiveUserId, callbackData);
      return;
    }

    if (text === '/book') {
      await this.showProviders(chatId, effectiveUserId);
    } else if (text === '/appointments' || text === '/status') {
      await this.showAppointments(chatId);
    } else if (text === '/reschedule') {
      await this.showRescheduleAppointments(chatId, effectiveUserId);
    } else {
      await this.plugin.send(chatId, {
        text: 'Use /book to start booking or /appointments to view your bookings.',
      });
    }
  }

  // ─── Callback Router ────────────────────────────────────────────

  private async handleCallback(chatId: string, userId: string, callbackData: string): Promise<void> {
    if (callbackData === 'bf:nop') {
      await this.plugin.send(chatId, { text: '❌ This slot is already booked. Please pick another.' });
      return;
    }

    // Doctor approval callbacks
    if (callbackData.startsWith('apt:')) {
      const parts = callbackData.split(':');
      const action = parts[1];
      const appointmentId = parts[2];
      if (action === 'approve') {
        await this.handleApproval(chatId, userId, appointmentId, 'confirmed');
      } else if (action === 'reject') {
        await this.handleApproval(chatId, userId, appointmentId, 'cancelled');
      }
      return;
    }

    if (callbackData.startsWith('bf:')) {
      const parts = callbackData.split(':');
      let key: string;
      let epochOverride: number | null = null;
      let dateStr = '';

      if (parts[1] === 'day') {
        // Format: bf:day:{key}:{date}
        key = parts[2];
        dateStr = parts.slice(3).join(':');
      } else if (parts.length > 2) {
        // Format: bf:{key}:{epoch}
        key = parts[1];
        epochOverride = parseInt(parts[2]);
      } else {
        // Format: bf:{key}
        key = parts[1];
      }

      const entry = await this.getCallback(key);
      if (!entry) {
        await this.plugin.send(chatId, { text: '❌ Session expired. Use /book to start again.' });
        return;
      }
      // Don't delete slot/day keys — reused across all buttons
      if (entry.type !== 'slot' && entry.type !== 'day') {
        await this.deleteCallback(key);
      }

      switch (entry.type) {
        case 'hospital':
          await this.showDoctors(chatId, userId, entry.payload.hospitalId);
          break;
        case 'doctor':
          await this.showServices(chatId, userId, entry.payload.doctorId);
          break;
        case 'service':
          await this.showSlots(chatId, userId, entry.payload.doctorId, entry.payload.serviceId);
          break;
        case 'day':
          await this.showDaySlots(chatId, entry.payload.doctorId, entry.payload.serviceId, dateStr);
          break;
        case 'reschedule':
          await this.showRescheduleSlots(chatId, userId, entry.payload.appointmentId);
          break;
        case 'rslot':
          if (!epochOverride) {
            await this.plugin.send(chatId, { text: '❌ Invalid slot. Use /reschedule again.' });
            return;
          }
          await this.executeReschedule(chatId, userId, epochOverride);
          break;
        case 'slot':
          // epoch comes from callback data, not from stored payload
          if (!epochOverride) {
            await this.plugin.send(chatId, { text: '❌ Invalid slot. Use /book to start again.' });
            return;
          }
          await this.createBooking(chatId, userId, entry.payload.doctorId, entry.payload.serviceId, epochOverride);
          break;
        case 'approve':
          await this.handleApproval(chatId, userId, entry.payload.appointmentId, 'confirmed');
          break;
        case 'reject':
          await this.handleApproval(chatId, userId, entry.payload.appointmentId, 'cancelled');
          break;
      }
    }
  }

  // ─── Step 1: Show Providers ─────────────────────────────────────

  async showProviders(chatId: string, userId: string): Promise<void> {
    const session = await this.getSession(chatId, userId);

    const hospitals = await this.db.prepare(
      'SELECT id, name FROM providers WHERE type = ? AND status = ? ORDER BY name ASC'
    ).bind('hospital', 'active').all();

    if (!hospitals.results || hospitals.results.length === 0) {
      // No hospitals — show doctors directly
      await this.showDoctors(chatId, userId, null);
      return;
    }

    const buttons: MessageButton[][] = [];
    for (const h of hospitals.results as any[]) {
      const key = await this.storeCallback('hospital', chatId, { hospitalId: h.id });
      buttons.push([{ text: `🏥 ${h.name}`, callbackData: `bf:${key}` }]);
    }

    await this.updateSession(session.id, { step: 'pick_hospital' });
    await this.plugin.sendWithButtons(chatId, '🏥 <b>Select a hospital:</b>', buttons);
  }

  // ─── Step 2: Show Doctors ───────────────────────────────────────

  async showDoctors(chatId: string, userId: string, hospitalId: string | null): Promise<void> {
    const session = await this.getSession(chatId, userId);

    let doctors;
    if (hospitalId) {
      doctors = await this.db.prepare(
        'SELECT id, name, specialty FROM providers WHERE hospital_id = ? AND type = ? AND status = ? ORDER BY name ASC'
      ).bind(hospitalId, 'doctor', 'active').all();
    } else {
      doctors = await this.db.prepare(
        'SELECT id, name, specialty FROM providers WHERE type = ? AND status = ? ORDER BY name ASC'
      ).bind('doctor', 'active').all();
    }

    if (!doctors.results || doctors.results.length === 0) {
      await this.plugin.send(chatId, { text: '👨‍⚕️ No doctors available.' });
      return;
    }

    const buttons: MessageButton[][] = [];
    for (const doc of doctors.results as any[]) {
      const key = await this.storeCallback('doctor', chatId, { doctorId: doc.id });
      const label = doc.specialty ? `${doc.name} (${doc.specialty})` : doc.name;
      buttons.push([{ text: `👨‍⚕️ ${label}`, callbackData: `bf:${key}` }]);
    }

    await this.updateSession(session.id, { step: 'pick_doctor' });
    await this.plugin.sendWithButtons(chatId, '👨‍⚕️ <b>Select a doctor:</b>', buttons);
  }

  // ─── Step 3: Show Services ──────────────────────────────────────

  async showServices(chatId: string, userId: string, doctorId: string): Promise<void> {
    const session = await this.getSession(chatId, userId);

    const doctor = await this.db.prepare('SELECT name FROM providers WHERE id = ?').bind(doctorId).first<any>();
    if (!doctor) {
      await this.plugin.send(chatId, { text: '❌ Doctor not found.' });
      return;
    }

    const services = await this.db.prepare(
      'SELECT id, name, duration_minutes FROM services WHERE provider_id = ? AND is_active = 1'
    ).bind(doctorId).all();

    if (!services.results || services.results.length === 0) {
      await this.plugin.send(chatId, { text: `📅 ${doctor.name} has no services available.` });
      return;
    }

    const buttons: MessageButton[][] = [];
    for (const svc of services.results as any[]) {
      const key = await this.storeCallback('service', chatId, { doctorId, serviceId: svc.id });
      buttons.push([{ text: `${svc.name} (${svc.duration_minutes}min)`, callbackData: `bf:${key}` }]);
    }

    await this.updateSession(session.id, { step: 'pick_service', doctor_id: doctorId });
    await this.plugin.sendWithButtons(chatId, `📅 <b>${doctor.name}</b>\nSelect a service:`, buttons);
  }

  // ─── Step 4: Show Available Slots ───────────────────────────────

  async showSlots(chatId: string, userId: string, doctorId: string, serviceId: string): Promise<void> {
    const service = await this.db.prepare(
      'SELECT name, duration_minutes FROM services WHERE id = ?'
    ).bind(serviceId).first<any>();

    if (!service) {
      await this.plugin.send(chatId, { text: '❌ Service not found.' });
      return;
    }

    const duration = service.duration_minutes || 30;
    const now = new Date();
    const istNow = getISTNow();

    // Single FreeBusy API call for entire 7-day range
    const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
    const calClient = await getCalendarClientForProvider(this.env, doctorId);
    let busyTimes: Array<{ start: Date; end: Date }> = [];

    if (calClient) {
      const rangeStart = istDate(istNow.year, istNow.month, istNow.day, 0, 0);
      const rangeEnd = istDate(istNow.year, istNow.month, istNow.day + 7, 23, 59);
      const raw = await calClient.getBusyTimes(rangeStart, rangeEnd);
      busyTimes = raw.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
    }

    // Check DB for existing appointments
    const rangeStartEpoch = Math.floor(now.getTime() / 1000);
    const rangeEndEpoch = rangeStartEpoch + 7 * 24 * 60 * 60;
    const existingAppts = await this.db.prepare(
      `SELECT start_time, end_time FROM appointments
       WHERE provider_id = ? AND status IN ('pending', 'confirmed') AND start_time >= ? AND start_time <= ?`
    ).bind(doctorId, rangeStartEpoch, rangeEndEpoch).all();

    for (const appt of (existingAppts.results as any[])) {
      busyTimes.push({ start: new Date(appt.start_time * 1000), end: new Date(appt.end_time * 1000) });
    }

    function isBusy(slotStart: Date, slotEnd: Date): boolean {
      return busyTimes.some(b => b.start < slotEnd && b.end > slotStart);
    }

    const buttons: MessageButton[][] = [];

    // Fetch doctor's availability windows (Mon-Fri 9-17 by default)
    const availWindows = await this.db.prepare(
      'SELECT day_of_week, start_time, end_time FROM availability_windows WHERE provider_id = ? AND is_active = 1'
    ).bind(doctorId).all();

    const availByDay = new Map<number, { sh: number; sm: number; eh: number; em: number }>();
    for (const w of (availWindows.results as any[])) {
      const [sh, sm] = w.start_time.split(':').map(Number);
      const [eh, em] = w.end_time.split(':').map(Number);
      availByDay.set(w.day_of_week, { sh, sm, eh, em });
    }

    const blockedDates = await this.db.prepare(
      'SELECT date FROM blocked_dates WHERE provider_id = ?'
    ).bind(doctorId).all();
    const blocked = new Set((blockedDates.results as any[]).map((b: any) => b.date));

    // Step 1: Show day picker — only days with availability
    const dayKey = await this.storeCallback('day', chatId, { doctorId, serviceId });

    for (let d = 0; d < 7; d++) {
      const slotDay = istDate(istNow.year, istNow.month, istNow.day + d, 0, 0);
      const dowStr = slotDay.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dowStr);

      const blockedDateStr = `${istNow.year}-${String(istNow.month + 1).padStart(2, '0')}-${String(istNow.day + d).padStart(2, '0')}`;
      if (blocked.has(blockedDateStr)) continue;

      const avail = availByDay.get(dayOfWeek);
      if (!avail) continue;

      // Check if there are any future slots for this day
      const startMinutes = avail.sh * 60 + avail.sm;
      let hasSlots = false;
      for (let mins = startMinutes; mins + duration <= (avail.eh * 60 + avail.em); mins += 30) {
        const slotStart = istDate(istNow.year, istNow.month, istNow.day + d, Math.floor(mins / 60), mins % 60);
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
        if (slotStart <= now) continue;
        if (!isBusy(slotStart, slotEnd)) { hasSlots = true; break; }
      }
      if (!hasSlots) continue;

      const epoch = Math.floor(slotDay.getTime() / 1000);
      const dateLabel = formatDateIST(epoch, { weekday: 'short', day: 'numeric', month: 'short' });
      buttons.push([{ text: `📅 ${dateLabel}`, callbackData: `bf:day:${dayKey}:${blockedDateStr}` }]);
    }

    if (buttons.length === 0) {
      await this.plugin.send(chatId, { text: '📅 No slots available in the next 7 days.' });
      return;
    }

    const session = await this.getSession(chatId, userId);
    await this.updateSession(session.id, { step: 'pick_slot', service_id: serviceId });
    await this.plugin.sendWithButtons(chatId, `📅 <b>${service.name}</b>\nSelect a date:`, buttons);
  }

  // ─── Step 4b: Show Day Slots (calendar view with ✅/❌) ─────────

  async showDaySlots(chatId: string, doctorId: string, serviceId: string, dateStr: string): Promise<void> {
    const service = await this.db.prepare(
      'SELECT name, duration_minutes FROM services WHERE id = ?'
    ).bind(serviceId).first<any>();
    if (!service) return;

    const duration = service.duration_minutes || 30;
    const now = new Date();

    // Parse date: "2026-03-24"
    const [year, month, day] = dateStr.split('-').map(Number);

    // Fetch availability for this day of week
    const slotDay = istDate(year, month - 1, day, 0, 0);
    const dowStr = slotDay.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dowStr);

    const availWindows = await this.db.prepare(
      'SELECT day_of_week, start_time, end_time FROM availability_windows WHERE provider_id = ? AND is_active = 1 AND day_of_week = ?'
    ).bind(doctorId, dayOfWeek).all();

    if (!availWindows.results || availWindows.results.length === 0) {
      await this.plugin.send(chatId, { text: '❌ No availability on this day.' });
      return;
    }

    // Fetch busy times from calendar
    const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
    const calClient = await getCalendarClientForProvider(this.env, doctorId);
    let busyTimes: Array<{ start: Date; end: Date }> = [];

    if (calClient) {
      const rangeStart = istDate(year, month - 1, day, 0, 0);
      const rangeEnd = istDate(year, month - 1, day, 23, 59);
      const raw = await calClient.getBusyTimes(rangeStart, rangeEnd);
      busyTimes = raw.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
    }

    // DB appointments
    const dayStartEpoch = Math.floor(slotDay.getTime() / 1000);
    const dayEndEpoch = dayStartEpoch + 86400;
    const existingAppts = await this.db.prepare(
      `SELECT start_time, end_time FROM appointments
       WHERE provider_id = ? AND status IN ('pending', 'confirmed') AND start_time >= ? AND start_time < ?`
    ).bind(doctorId, dayStartEpoch, dayEndEpoch).all();

    for (const appt of (existingAppts.results as any[])) {
      busyTimes.push({ start: new Date(appt.start_time * 1000), end: new Date(appt.end_time * 1000) });
    }

    function isBusy(slotStart: Date, slotEnd: Date): boolean {
      return busyTimes.some(b => b.start < slotEnd && b.end > slotStart);
    }

    // Generate slots for this day
    const slotKey = await this.storeCallback('slot', chatId, { doctorId, serviceId });
    const buttons: MessageButton[][] = [];
    const avail = availWindows.results[0] as any;
    const [sh, sm] = avail.start_time.split(':').map(Number);
    const [eh, em] = avail.end_time.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    for (let mins = startMinutes; mins + duration <= endMinutes; mins += 30) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const slotStart = istDate(year, month - 1, day, h, m);
      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      if (slotStart <= now) {
        // Past slot — show as unavailable
        buttons.push([{ text: `⬜ ${timeStr} (past)`, callbackData: `bf:nop` }]);
      } else if (isBusy(slotStart, slotEnd)) {
        // Busy — show as blocked
        buttons.push([{ text: `❌ ${timeStr}`, callbackData: `bf:nop` }]);
      } else {
        // Available
        const epoch = Math.floor(slotStart.getTime() / 1000);
        buttons.push([{ text: `✅ ${timeStr}`, callbackData: `bf:${slotKey}:${epoch}` }]);
      }
    }

    const dateLabel = formatDateIST(dayStartEpoch, { weekday: 'long', day: 'numeric', month: 'short' });
    await this.plugin.sendWithButtons(chatId, `📅 <b>${dateLabel}</b>\n${service.name} (${duration}min)\n\n✅ Available  ❌ Booked`, buttons);
  }

  // ─── Step 5: Create Booking (Pending) ───────────────────────────

  private async createBooking(chatId: string, userId: string, doctorId: string, serviceId: string, startTime: number): Promise<void> {
    console.log('createBooking startTime epoch:', startTime, 'UTC:', new Date(startTime * 1000).toISOString(), 'IST display:', formatDateIST(startTime, { day: 'numeric', month: 'short', weekday: 'short' }), formatTimeIST(startTime, { hour: '2-digit', minute: '2-digit' }));
    const service = await this.db.prepare(
      'SELECT name, duration_minutes FROM services WHERE id = ?'
    ).bind(serviceId).first<any>();

    if (!service) {
      await this.plugin.send(chatId, { text: '❌ Service not found.' });
      return;
    }

    const endTime = startTime + service.duration_minutes * 60;

    // Get patient name
    const patient = await this.db.prepare(
      'SELECT name FROM patient_auth WHERE telegram_id = ?'
    ).bind(chatId).first<any>();
    const customerName = patient?.name || 'Patient';

    // Insert appointment as pending
    const aptId = crypto.randomUUID();
    await this.db.prepare(
      `INSERT INTO appointments (id, provider_id, service_id, customer_name, customer_telegram_id, start_time, end_time, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(aptId, doctorId, serviceId, customerName, chatId, startTime, endTime,
      Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

    // Update session
    const session = await this.getSession(chatId, userId);
    await this.updateSession(session.id, {
      step: 'pending_approval', slot_start: startTime, slot_end: endTime, appointment_id: aptId,
    });

    // Confirm to patient
    const dateStr = formatDateIST(startTime, { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = formatTimeIST(startTime, { hour: '2-digit', minute: '2-digit' });
    await this.plugin.send(chatId, {
      text: `📅 Booking requested!\n\n${dateStr} ${timeStr}\n👨‍⚕️ ${service.name}\n\nWaiting for doctor confirmation...`,
    });

    // Notify doctor
    const doctor = await this.db.prepare(
      'SELECT platform_user_id FROM providers WHERE id = ?'
    ).bind(doctorId).first<any>();

    if (doctor?.platform_user_id) {
      await this.plugin.sendWithButtons(doctor.platform_user_id,
        `📋 <b>New Booking Request</b>\n\n👤 ${customerName}\n🏥 ${service.name}\n📅 ${dateStr} ${timeStr}`,
        [
          [{ text: '✅ Approve', callbackData: `apt:approve:${aptId}` }],
          [{ text: '❌ Reject', callbackData: `apt:reject:${aptId}` }],
        ]
      );
    }
  }

  // ─── Step 6: Doctor Approves/Rejects ────────────────────────────

  private async handleApproval(chatId: string, userId: string, appointmentId: string, status: 'confirmed' | 'cancelled'): Promise<void> {
    const appointment = await this.db.prepare(
      `SELECT a.*, p.platform_user_id as doctor_platform_user_id
       FROM appointments a JOIN providers p ON a.provider_id = p.id WHERE a.id = ?`
    ).bind(appointmentId).first<any>();

    if (!appointment) {
      await this.plugin.send(chatId, { text: '❌ Appointment not found.' });
      return;
    }

    // Verify doctor owns this appointment
    if (appointment.doctor_platform_user_id !== userId) {
      await this.plugin.send(chatId, { text: '❌ Not authorized.' });
      return;
    }

    if (status === 'confirmed') {
      // Update or create Google Calendar event
      const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
      const calClient = await getCalendarClientForProvider(this.env, appointment.provider_id);
      if (calClient) {
        const startDate = new Date(appointment.start_time * 1000);
        const endDate = new Date(appointment.end_time * 1000);
        try {
          if (appointment.google_event_id) {
            // Reschedule: update existing event with new time
            await calClient.updateEvent(appointment.google_event_id, {
              startTime: startDate,
              endTime: endDate,
              status: 'confirmed',
              transparency: 'opaque',
            });
          } else {
            // New booking: create event
            const event = await calClient.createEvent({
              summary: `Appointment: ${appointment.customer_name}`,
              description: `Appointment with ${appointment.customer_name}`,
              startTime: startDate,
              endTime: endDate,
              status: 'confirmed',
              transparency: 'opaque',
            });
            await this.db.prepare('UPDATE appointments SET google_event_id = ? WHERE id = ?')
              .bind(event.id, appointmentId).run();
          }
        } catch (e) {
          console.error('Calendar event error:', e);
        }
      }
    }

    // Update DB status
    await this.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, Math.floor(Date.now() / 1000), appointmentId).run();

    // Confirm to doctor
    const emoji = status === 'confirmed' ? '✅' : '❌';
    const action = status === 'confirmed' ? 'approved' : 'rejected';
    await this.plugin.send(chatId, { text: `${emoji} Appointment ${action} for ${appointment.customer_name}.` });

    // Notify patient
    if (appointment.customer_telegram_id) {
      const dateStr = formatDateIST(appointment.start_time, { weekday: 'short', day: 'numeric', month: 'short' });
      const timeStr = formatTimeIST(appointment.start_time, { hour: '2-digit', minute: '2-digit' });

      if (status === 'confirmed') {
        await this.plugin.send(String(appointment.customer_telegram_id), {
          text: `✅ Confirmed! Appointment\n📅 ${dateStr} ${timeStr}\n🔔 You'll get a reminder before your appointment.`,
        });
      } else {
        await this.plugin.send(String(appointment.customer_telegram_id), {
          text: `❌ Appointment cancelled.\n📅 ${dateStr} ${timeStr}\n\nPlease book again if needed.`,
        });
      }
    }

    // Clean up session
    const sessions = await this.db.prepare(
      'SELECT id FROM booking_sessions WHERE appointment_id = ?'
    ).bind(appointmentId).all();
    for (const s of (sessions.results as any[])) {
      await this.resetSession(s.id);
    }
  }

  // ─── Show Appointments ──────────────────────────────────────────

  private async showAppointments(chatId: string): Promise<void> {
    const appointments = await this.db.prepare(
      `SELECT a.*, p.name as provider_name, s.name as service_name
       FROM appointments a
       LEFT JOIN providers p ON a.provider_id = p.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.customer_telegram_id = ?
       ORDER BY a.start_time DESC LIMIT 10`
    ).bind(chatId).all();

    if (!appointments.results || appointments.results.length === 0) {
      await this.plugin.send(chatId, { text: 'No appointments found. Use /book to schedule one.' });
      return;
    }

    const lines = (appointments.results as any[]).map(a => {
      const date = formatDateIST(a.start_time, { weekday: 'short', day: 'numeric', month: 'short' });
      const time = formatTimeIST(a.start_time, { hour: '2-digit', minute: '2-digit' });
      const statusEmoji = a.status === 'confirmed' ? '✅' : a.status === 'pending' ? '⏳' : '❌';
      return `${statusEmoji} ${a.service_name} with ${a.provider_name}\n   📅 ${date} ${time} — ${a.status}`;
    });

    await this.plugin.send(chatId, { text: `Your appointments:\n\n${lines.join('\n\n')}` });
  }

  // ─── Reschedule Flow ───────────────────────────────────────────

  async showRescheduleAppointments(chatId: string, userId: string): Promise<void> {
    const appointments = await this.db.prepare(
      `SELECT a.*, p.name as provider_name, s.name as service_name
       FROM appointments a
       LEFT JOIN providers p ON a.provider_id = p.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.customer_telegram_id = ? AND a.status IN ('pending', 'confirmed') AND a.start_time >= ?
       ORDER BY a.start_time ASC LIMIT 5`
    ).bind(chatId, Math.floor(Date.now() / 1000)).all();

    if (!appointments.results || appointments.results.length === 0) {
      await this.plugin.send(chatId, { text: 'No upcoming appointments to reschedule.' });
      return;
    }

    for (const apt of (appointments.results as any[])) {
      const dateStr = formatDateIST(apt.start_time, { weekday: 'short', day: 'numeric', month: 'short' });
      const timeStr = formatTimeIST(apt.start_time, { hour: '2-digit', minute: '2-digit' });
      const key = await this.storeCallback('reschedule', chatId, { appointmentId: apt.id });

      await this.plugin.sendWithButtons(chatId,
        `${apt.service_name} with ${apt.provider_name}\n📅 ${dateStr} ${timeStr} — ${apt.status}`,
        [[{ text: '🔄 Reschedule', callbackData: `bf:${key}` }]]
      );
    }
  }

  async showRescheduleSlots(chatId: string, userId: string, appointmentId: string): Promise<void> {
    const appointment = await this.db.prepare(
      `SELECT a.*, s.name as service_name, s.duration_minutes
       FROM appointments a JOIN services s ON a.service_id = s.id
       WHERE a.id = ? AND a.customer_telegram_id = ?`
    ).bind(appointmentId, chatId).first<any>();

    if (!appointment) {
      await this.plugin.send(chatId, { text: '❌ Appointment not found.' });
      return;
    }

    if (appointment.status === 'cancelled') {
      await this.plugin.send(chatId, { text: '❌ Cannot reschedule a cancelled appointment.' });
      return;
    }

    // Store reschedule state in session
    const session = await this.getSession(chatId, userId);
    await this.updateSession(session.id, {
      step: 'reschedule_pick_slot',
      appointment_id: appointmentId,
      doctor_id: appointment.provider_id,
      service_id: appointment.service_id,
    });

    // Show day slots for this doctor/service (reuse showDaySlots flow but with reschedule on slot pick)
    // We'll show the day picker first
    const service = await this.db.prepare(
      'SELECT duration_minutes FROM services WHERE id = ?'
    ).bind(appointment.service_id).first<any>();
    const duration = service?.duration_minutes || 30;
    const istNow = getISTNow();
    const now = new Date();

    // Fetch busy times
    const { getCalendarClientForProvider } = await import('../../lib/calendar/sync');
    const calClient = await getCalendarClientForProvider(this.env, appointment.provider_id);
    let busyTimes: Array<{ start: Date; end: Date }> = [];

    if (calClient) {
      const rangeStart = istDate(istNow.year, istNow.month, istNow.day, 0, 0);
      const rangeEnd = istDate(istNow.year, istNow.month, istNow.day + 7, 23, 59);
      const raw = await calClient.getBusyTimes(rangeStart, rangeEnd);
      busyTimes = raw.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
    }

    const rangeStartEpoch = Math.floor(now.getTime() / 1000);
    const rangeEndEpoch = rangeStartEpoch + 7 * 24 * 60 * 60;
    const existingAppts = await this.db.prepare(
      `SELECT start_time, end_time FROM appointments
       WHERE provider_id = ? AND status IN ('pending', 'confirmed') AND id != ? AND start_time >= ? AND start_time <= ?`
    ).bind(appointment.provider_id, appointmentId, rangeStartEpoch, rangeEndEpoch).all();

    for (const appt of (existingAppts.results as any[])) {
      busyTimes.push({ start: new Date(appt.start_time * 1000), end: new Date(appt.end_time * 1000) });
    }

    function isBusy(slotStart: Date, slotEnd: Date): boolean {
      return busyTimes.some(b => b.start < slotEnd && b.end > slotStart);
    }

    // Show day picker
    const availWindows = await this.db.prepare(
      'SELECT day_of_week, start_time, end_time FROM availability_windows WHERE provider_id = ? AND is_active = 1'
    ).bind(appointment.provider_id).all();

    const availByDay = new Map<number, { sh: number; sm: number; eh: number; em: number }>();
    for (const w of (availWindows.results as any[])) {
      const [sh, sm] = w.start_time.split(':').map(Number);
      const [eh, em] = w.end_time.split(':').map(Number);
      availByDay.set(w.day_of_week, { sh, sm, eh, em });
    }

    const rslotKey = await this.storeCallback('rslot', chatId, { appointmentId });
    const buttons: MessageButton[][] = [];

    for (let d = 0; d < 7; d++) {
      const slotDay = istDate(istNow.year, istNow.month, istNow.day + d, 0, 0);
      const dowStr = slotDay.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dowStr);

      const avail = availByDay.get(dayOfWeek);
      if (!avail) continue;

      let hasSlots = false;
      const startMins = avail.sh * 60 + avail.sm;
      const endMins = avail.eh * 60 + avail.em;
      for (let mins = startMins; mins + duration <= endMins; mins += 30) {
        const slotStart = istDate(istNow.year, istNow.month, istNow.day + d, Math.floor(mins / 60), mins % 60);
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
        if (slotStart <= now) continue;
        if (!isBusy(slotStart, slotEnd)) { hasSlots = true; break; }
      }
      if (!hasSlots) continue;

      // Show all slots for this day directly
      for (let mins = startMins; mins + duration <= endMins; mins += 30) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const slotStart = istDate(istNow.year, istNow.month, istNow.day + d, h, m);
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        if (slotStart <= now) continue;
        if (isBusy(slotStart, slotEnd)) continue;

        const epoch = Math.floor(slotStart.getTime() / 1000);
        const dateLabel = formatDateIST(epoch, { day: 'numeric', month: 'short' });
        buttons.push([{ text: `✅ ${dateLabel} ${timeStr}`, callbackData: `bf:${rslotKey}:${epoch}` }]);
      }
    }

    if (buttons.length === 0) {
      await this.plugin.send(chatId, { text: '📅 No available slots for reschedule.' });
      return;
    }

    await this.plugin.sendWithButtons(chatId,
      `🔄 <b>Reschedule: ${appointment.service_name}</b>\nPick a new time:`,
      buttons.slice(0, 20)
    );
  }

  async executeReschedule(chatId: string, userId: string, newEpoch: number): Promise<void> {
    const session = await this.getSession(chatId, userId);
    const appointmentId = session.appointment_id;

    if (!appointmentId) {
      await this.plugin.send(chatId, { text: '❌ Session expired. Use /reschedule again.' });
      return;
    }

    const appointment = await this.db.prepare(
      `SELECT a.*, s.name as service_name, s.duration_minutes, p.name as provider_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN providers p ON a.provider_id = p.id
       WHERE a.id = ? AND a.customer_telegram_id = ?`
    ).bind(appointmentId, chatId).first<any>();

    if (!appointment) {
      await this.plugin.send(chatId, { text: '❌ Appointment not found.' });
      return;
    }

    const newEndEpoch = newEpoch + (appointment.duration_minutes || 30) * 60;

    // Check for conflicts
    const conflicts = await this.db.prepare(
      `SELECT id FROM appointments
       WHERE provider_id = ? AND status IN ('pending', 'confirmed') AND id != ?
       AND start_time < ? AND end_time > ?`
    ).bind(appointment.provider_id, appointmentId, newEndEpoch, newEpoch).all();

    if (conflicts.results && conflicts.results.length > 0) {
      await this.plugin.send(chatId, { text: '❌ That slot is no longer available. Please pick another.' });
      return;
    }

    // Update appointment
    await this.db.prepare(
      'UPDATE appointments SET start_time = ?, end_time = ?, status = ?, updated_at = ? WHERE id = ?'
    ).bind(newEpoch, newEndEpoch, 'pending', Math.floor(Date.now() / 1000), appointmentId).run();

    // Clean up session
    await this.updateSession(session.id, { step: 'idle', appointment_id: null, doctor_id: null, service_id: null });

    const dateStr = formatDateIST(newEpoch, { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = formatTimeIST(newEpoch, { hour: '2-digit', minute: '2-digit' });

    await this.plugin.send(chatId, {
      text: `🔄 Appointment rescheduled!\n\n📅 ${dateStr} ${timeStr}\n👨‍⚕️ ${appointment.provider_name}\n\nWaiting for doctor confirmation...`,
    });

    // Notify doctor
    const doctor = await this.db.prepare(
      'SELECT platform_user_id FROM providers WHERE id = ?'
    ).bind(appointment.provider_id).first<any>();

    if (doctor?.platform_user_id) {
      await this.plugin.sendWithButtons(doctor.platform_user_id,
        `🔄 <b>Reschedule Request</b>\n\n👤 ${appointment.customer_name}\n📅 ${dateStr} ${timeStr}\n\nWas: ${formatDateIST(appointment.start_time, { day: 'numeric', month: 'short' })} ${formatTimeIST(appointment.start_time, { hour: '2-digit', minute: '2-digit' })}`,
        [
          [{ text: '✅ Approve', callbackData: `apt:approve:${appointmentId}` }],
          [{ text: '❌ Reject', callbackData: `apt:reject:${appointmentId}` }],
        ]
      );
    }
  }

  // ─── Cleanup Expired Keys ───────────────────────────────────────

  async cleanup(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.prepare('DELETE FROM callback_keys WHERE expires_at < ?').bind(now).run();
    const old = now - 86400; // 24 hours
    await this.db.prepare('DELETE FROM booking_sessions WHERE updated_at < ? AND step = ?').bind(old, 'idle').run();
  }
}
