// Appointment Bot - thin wrapper around BookingFlow
// Handles /book, /appointments, /cancel commands for registered users

import type { MessagingPlugin } from './plugin';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../../db/types';
import { BookingFlow } from './booking-flow';

export class AppointmentBot {
  private plugin: MessagingPlugin;
  private bookingFlow: BookingFlow;

  constructor(plugin: MessagingPlugin, db: D1Database, env: Env) {
    this.plugin = plugin;
    this.bookingFlow = new BookingFlow(plugin, db, env);
  }

  async handleMessage(message: {
    chatId: string;
    userId?: string;
    text?: string;
    callbackData?: string;
    type: string;
  }): Promise<void> {
    const { chatId, text, callbackData } = message;

    // BookingFlow callbacks (bf:*) and appointment callbacks (apt:*)
    if (callbackData?.startsWith('bf:') || callbackData?.startsWith('apt:')) {
      await this.bookingFlow.handleMessage(message);
      return;
    }

    // Commands
    if (text === '/book') {
      await this.bookingFlow.showProviders(chatId, message.userId || chatId);
    } else if (text === '/appointments' || text === '/status') {
      await this.bookingFlow.handleMessage(message);
    } else if (text === '/reschedule') {
      await this.bookingFlow.showRescheduleAppointments(chatId, message.userId || chatId);
    } else if (text === '/cancel') {
      await this.plugin.send(chatId, { text: 'Cancellation feature coming soon.' });
    } else if (text === '/availability') {
      await this.plugin.send(chatId, { text: 'Availability management coming soon.' });
    } else if (text === '/calendar') {
      await this.plugin.send(chatId, { text: 'Calendar status check coming soon.' });
    } else if (text && !text.startsWith('/')) {
      await this.plugin.send(chatId, {
        text: 'Use /book to start booking or /appointments to view your bookings.',
      });
    } else {
      await this.plugin.send(chatId, {
        text: 'Use /book, /appointments, /cancel, /availability, or /calendar',
      });
    }
  }
}
