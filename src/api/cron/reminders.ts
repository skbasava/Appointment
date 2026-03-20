import { Env } from '../../db/types';
import { getUpcomingAppointments } from '../../db/queries/appointments';
import { NotificationService } from '../../lib/notifications/service';

const REMINDER_WINDOW_SECONDS = 3600; // 1 hour before appointment

export async function sendReminders(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const notificationService = new NotificationService(env);

  // Get appointments starting within the next hour
  const upcomingAppointments = await getUpcomingAppointments(env.DB, now + REMINDER_WINDOW_SECONDS);

  for (const appointment of upcomingAppointments) {
    // Only send reminder if appointment is within the reminder window
    if (appointment.start_time - now <= REMINDER_WINDOW_SECONDS && appointment.start_time > now) {
      await notificationService.sendReminder(
        appointment.id,
        appointment.customer_telegram_id
      );
    }
  }
}
