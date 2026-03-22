import { Env } from '../../db/types';
import { NotificationService } from '../../lib/notifications/service';
import { PluginManager } from '../../lib/messaging/plugin';
import { TelegramPlugin } from '../../lib/messaging/telegram-plugin';

const REMINDER_WINDOW_SECONDS = 600; // 10 minutes before appointment

export async function sendReminders(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const tenMinutesFromNow = now + REMINDER_WINDOW_SECONDS;
  const notificationService = new NotificationService(env);

  const pluginManager = new PluginManager();
  pluginManager.register(new TelegramPlugin(env.TELEGRAM_BOT_TOKEN));

  // Get confirmed appointments starting within the next 10 minutes
  const appointments = await env.DB.prepare(
    `SELECT a.*, p.platform as doctor_platform, p.platform_user_id as doctor_platform_user_id
     FROM appointments a
     JOIN providers p ON a.provider_id = p.id
     WHERE a.status = 'confirmed' AND a.start_time BETWEEN ? AND ?`
  ).bind(tenMinutesFromNow - 60, tenMinutesFromNow).all();

  for (const apt of appointments.results as any[]) {
    // Notify patient (existing)
    await notificationService.sendReminder(apt.id, apt.customer_telegram_id);

    // Notify doctor (new)
    if (apt.doctor_platform && apt.doctor_platform_user_id) {
      await pluginManager.send(apt.doctor_platform, apt.doctor_platform_user_id, {
        text: `⏰ Reminder: ${apt.customer_name} in 10 minutes`
      });
    }
  }
}
