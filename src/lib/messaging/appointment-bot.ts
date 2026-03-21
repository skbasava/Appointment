// Appointment Bot - handles appointment-related commands for registered users
// Extracts appointment logic from onboarding flow

import type { MessagingPlugin } from './plugin';
import type { D1Database } from '@cloudflare/workers-types';

interface AppointmentBotState {
  step: string;
  data: Record<string, unknown>;
}

export class AppointmentBot {
  private plugin: MessagingPlugin;
  private db: D1Database;
  private states = new Map<string, AppointmentBotState>();

  constructor(plugin: MessagingPlugin, db: D1Database) {
    this.plugin = plugin;
    this.db = db;
  }

  async handleMessage(message: {
    chatId: string;
    text?: string;
    callbackData?: string;
    type: string;
  }): Promise<void> {
    const { chatId, text } = message;

    if (text === '/appointments' || text === '/status') {
      await this.showAppointments(chatId);
    } else if (text === '/availability') {
      await this.showAvailability(chatId);
    } else if (text === '/calendar') {
      await this.showCalendarStatus(chatId);
    } else if (text === '/cancel') {
      await this.startCancellation(chatId);
    } else if (text === '/book') {
      await this.startBooking(chatId);
    } else {
      const state = this.states.get(chatId);
      if (state) {
        await this.handleStep(chatId, text, message.callbackData, state);
      } else {
        await this.plugin.send(chatId, {
          text: 'Use /appointments, /book, /availability, /calendar, or /cancel',
        });
      }
    }
  }

  private async showAppointments(chatId: string): Promise<void> {
    const appointments = await this.db
      .prepare(
        `SELECT a.*, p.name as provider_name, s.name as service_name
       FROM appointments a
       LEFT JOIN providers p ON a.provider_id = p.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.patient_telegram_id = ? OR a.patient_phone = ?
       ORDER BY a.start_time DESC LIMIT 10`
      )
      .bind(chatId, chatId)
      .all();

    if (appointments.results.length === 0) {
      await this.plugin.send(chatId, {
        text: 'No appointments found. Use /book to schedule one.',
      });
      return;
    }

    const lines = appointments.results.map(
      (a: Record<string, unknown>) =>
        `\uD83D\uDCC5 ${a.service_name} with ${a.provider_name}\n   ${a.start_time} — ${a.status}`
    );
    await this.plugin.send(chatId, {
      text: `Your appointments:\n\n${lines.join('\n\n')}`,
    });
  }

  private async showAvailability(chatId: string): Promise<void> {
    await this.plugin.send(chatId, {
      text: 'Availability management coming soon.',
    });
  }

  private async showCalendarStatus(chatId: string): Promise<void> {
    await this.plugin.send(chatId, {
      text: 'Calendar status check coming soon.',
    });
  }

  private async startCancellation(chatId: string): Promise<void> {
    await this.plugin.send(chatId, {
      text: 'Appointment cancellation coming soon.',
    });
  }

  private async startBooking(chatId: string): Promise<void> {
    await this.plugin.send(chatId, {
      text: 'Booking flow coming soon.',
    });
  }

  private async handleStep(
    chatId: string,
    text?: string,
    callbackData?: string,
    state?: AppointmentBotState
  ): Promise<void> {
    await this.plugin.send(chatId, {
      text: 'Step handling coming soon.',
    });
  }
}
