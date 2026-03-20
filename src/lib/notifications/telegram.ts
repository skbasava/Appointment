const TELEGRAM_API_BASE = 'https://api.telegram.org';

export class TelegramBot {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async sendMessage(chatId: number, text: string, parseMode?: string): Promise<boolean> {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode || 'HTML',
        }),
      });

      if (!response.ok) {
        console.error('Failed to send Telegram message:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  }

  async sendMessageWithKeyboard(
    chatId: number,
    text: string,
    keyboard: Array<Array<{ text: string; callback_data: string }>>
  ): Promise<boolean> {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        }),
      });

      if (!response.ok) {
        console.error('Failed to send keyboard message:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('Failed to send keyboard message:', error);
      return false;
    }
  }

  async sendConfirmation(chatId: number, appointmentDetails: AppointmentDetails): Promise<boolean> {
    const message = formatConfirmationMessage(appointmentDetails);
    return this.sendMessage(chatId, message);
  }

  async sendReminder(chatId: number, appointmentDetails: AppointmentDetails): Promise<boolean> {
    const message = formatReminderMessage(appointmentDetails);
    return this.sendMessage(chatId, message);
  }

  async sendCancellation(chatId: number, appointmentDetails: AppointmentDetails): Promise<boolean> {
    const message = formatCancellationMessage(appointmentDetails);
    return this.sendMessage(chatId, message);
  }

  async sendReschedule(
    chatId: number,
    oldAppointment: AppointmentDetails,
    newAppointment: AppointmentDetails
  ): Promise<boolean> {
    const message = formatRescheduleMessage(oldAppointment, newAppointment);
    return this.sendMessage(chatId, message);
  }

  async setWebhook(webhookUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/bot${this.token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to set webhook:', error);
      return false;
    }
  }
}

interface AppointmentDetails {
  customer_name: string;
  provider_name: string;
  service_name: string;
  start_time: number;
  end_time: number;
}

function formatConfirmationMessage(apt: AppointmentDetails): string {
  const startTime = new Date(apt.start_time * 1000);
  return `✅ <b>Appointment Confirmed</b>

Hello ${apt.customer_name}!

Your appointment has been confirmed:

📋 Service: ${apt.service_name}
👨‍⚕️ Provider: ${apt.provider_name}
📅 Date: ${startTime.toLocaleDateString()}
⏰ Time: ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

See you there!`;
}

function formatReminderMessage(apt: AppointmentDetails): string {
  const startTime = new Date(apt.start_time * 1000);
  return `⏰ <b>Reminder</b>

Hello ${apt.customer_name}!

You have an upcoming appointment:

📋 Service: ${apt.service_name}
👨‍⚕️ Provider: ${apt.provider_name}
📅 Date: ${startTime.toLocaleDateString()}
⏰ Time: ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

See you soon!`;
}

function formatCancellationMessage(apt: AppointmentDetails): string {
  return `❌ <b>Appointment Cancelled</b>

Hello ${apt.customer_name}!

Your appointment has been cancelled:

📋 Service: ${apt.service_name}
👨‍⚕️ Provider: ${apt.provider_name}

If you have questions, please contact the provider.`;
}

function formatRescheduleMessage(oldApt: AppointmentDetails, newApt: AppointmentDetails): string {
  const newStartTime = new Date(newApt.start_time * 1000);
  return `📅 <b>Appointment Rescheduled</b>

Hello ${newApt.customer_name}!

Your appointment has been rescheduled:

📋 Service: ${newApt.service_name}
👨‍⚕️ Provider: ${newApt.provider_name}
📅 New Date: ${newStartTime.toLocaleDateString()}
⏰ New Time: ${newStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
