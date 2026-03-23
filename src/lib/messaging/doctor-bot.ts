import type { MessagingPlugin, MessageButton } from './plugin';
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
    } else if (text === '/start' || text === '/help') {
      await this.plugin.send(chatId, {
        text: '👨‍⚕️ <b>Doctor Bot</b>\n\n/pending - Pending booking requests\n/schedule - Today\'s appointments',
      });
    } else {
      await this.plugin.send(chatId, {
        text: 'Use /pending, /schedule, or /help',
      });
    }
  }

  private async handleApprovalCallback(chatId: string, userId: string, callbackData: string): Promise<void> {
    const parts = callbackData.split(':');
    const action = parts[1];
    const appointmentId = parts[2];

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

      const dateStr = new Date(appointment.start_time * 1000)
        .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      const timeStr = new Date(appointment.start_time * 1000)
        .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

      await this.plugin.send(chatId, { text: `✅ Approved: ${appointment.customer_name} — ${dateStr} ${timeStr}` });
      await this.notifyPatient(appointment, 'confirmed');

    } else if (action === 'reject') {
      await this.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
        .bind('cancelled', Math.floor(Date.now() / 1000), appointmentId).run();

      await this.plugin.send(chatId, { text: `❌ Rejected: ${appointment.customer_name}` });
      await this.notifyPatient(appointment, 'cancelled');
    }
  }

  private async notifyPatient(appointment: any, status: string): Promise<void> {
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
    const doctor = await this.db.prepare(
      'SELECT id, name FROM providers WHERE platform_user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(chatId, 'doctor').first<any>();

    if (!doctor) {
      await this.plugin.send(chatId, { text: '❌ Not registered as a doctor.' });
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

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
