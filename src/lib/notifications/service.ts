import { Env, Notification, Appointment } from '../../db/types';
import { createNotification, updateNotificationStatus, getNotificationsForReminder } from '../../db/queries/notifications';
import { getAppointmentById } from '../../db/queries/appointments';
import { TelegramBot } from './telegram';

export class NotificationService {
  private bot: TelegramBot;
  private db: D1Database;

  constructor(env: Env) {
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
    this.db = env.DB;
  }

  async sendConfirmation(appointmentId: string, customerTelegramId: string): Promise<void> {
    const appointment = await getAppointmentById(this.db, appointmentId);
    if (!appointment) return;

    const notification: Omit<Notification, 'created_at'> = {
      id: crypto.randomUUID(),
      appointment_id: appointmentId,
      channel: 'telegram',
      type: 'confirmation',
      status: 'pending',
      sent_at: null,
    };

    await createNotification(this.db, notification);

    const success = await this.bot.sendMessage(
      parseInt(customerTelegramId),
      this.formatConfirmation(appointment)
    );

    await updateNotificationStatus(
      this.db,
      notification.id,
      success ? 'sent' : 'failed'
    );
  }

  async sendCancellation(appointmentId: string, customerTelegramId: string): Promise<void> {
    const appointment = await getAppointmentById(this.db, appointmentId);
    if (!appointment) return;

    const notification: Omit<Notification, 'created_at'> = {
      id: crypto.randomUUID(),
      appointment_id: appointmentId,
      channel: 'telegram',
      type: 'cancellation',
      status: 'pending',
      sent_at: null,
    };

    await createNotification(this.db, notification);

    const success = await this.bot.sendMessage(
      parseInt(customerTelegramId),
      this.formatCancellation(appointment)
    );

    await updateNotificationStatus(
      this.db,
      notification.id,
      success ? 'sent' : 'failed'
    );
  }

  async sendReminder(appointmentId: string, customerTelegramId: string): Promise<void> {
    const appointment = await getAppointmentById(this.db, appointmentId);
    if (!appointment) return;

    const notification: Omit<Notification, 'created_at'> = {
      id: crypto.randomUUID(),
      appointment_id: appointmentId,
      channel: 'telegram',
      type: 'reminder',
      status: 'pending',
      sent_at: null,
    };

    await createNotification(this.db, notification);

    const success = await this.bot.sendMessage(
      parseInt(customerTelegramId),
      this.formatReminder(appointment)
    );

    await updateNotificationStatus(
      this.db,
      notification.id,
      success ? 'sent' : 'failed'
    );
  }

  private formatConfirmation(appointment: Appointment): string {
    const startTime = new Date(appointment.start_time * 1000);
    return `✅ Appointment Confirmed

Hello ${appointment.customer_name}!

Your appointment has been confirmed.

📅 Date: ${startTime.toLocaleDateString()}
⏰ Time: ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

See you there!`;
  }

  private formatCancellation(appointment: Appointment): string {
    return `❌ Appointment Cancelled

Hello ${appointment.customer_name}!

Your appointment has been cancelled.

If you have questions, please contact the provider.`;
  }

  private formatReminder(appointment: Appointment): string {
    const startTime = new Date(appointment.start_time * 1000);
    return `⏰ Reminder

Hello ${appointment.customer_name}!

You have an upcoming appointment:

📅 Date: ${startTime.toLocaleDateString()}
⏰ Time: ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

See you soon!`;
  }
}
