import { Env, Appointment } from '../../db/types';
import { createAppointment, getConflictingAppointments, getAppointmentById, updateAppointmentStatus } from '../../db/queries/appointments';
import { getServiceById } from '../../db/queries/services';
import { getAvailabilityByProvider, getBlockedDatesByProvider } from '../../db/queries/availability';
import { getProviderById } from '../../db/queries/providers';
import { calculateAvailableSlots } from './slots';
import { hasConflict } from './conflict';
import { ConflictError, NotFoundError, ValidationError } from '../../api/middleware/error';
import { syncAppointmentToCalendar } from '../calendar/sync';
import { TelegramBot } from '../notifications/telegram';

export interface BookingRequest {
  provider_id: string;
  service_id: string;
  customer_telegram_id: string;
  customer_name: string;
  start_time: number;
}

export interface BookingResult {
  id: string;
  status: string;
  start_time: number;
  end_time: number;
}

export async function bookAppointment(
  env: Env,
  request: BookingRequest
): Promise<BookingResult> {
  const db = env.DB;
  
  // Validate service exists
  const service = await getServiceById(db, request.service_id);
  if (!service) {
    throw new NotFoundError('Service');
  }

  if (service.provider_id !== request.provider_id) {
    throw new ValidationError('Service does not belong to this provider');
  }

  // Calculate end time based on service duration
  const startTime = request.start_time;
  const endTime = startTime + service.duration_minutes * 60;

  // Check for conflicts
  const conflictingAppointments = await getConflictingAppointments(
    db,
    request.provider_id,
    startTime,
    endTime
  );

  if (conflictingAppointments.length > 0) {
    throw new ConflictError('Time slot is no longer available');
  }

  // Generate UUID for appointment
  const appointmentId = crypto.randomUUID();

  // Create appointment
  const appointment: Omit<Appointment, 'created_at' | 'updated_at'> = {
    id: appointmentId,
    provider_id: request.provider_id,
    service_id: request.service_id,
    customer_telegram_id: request.customer_telegram_id,
    customer_name: request.customer_name,
    start_time: startTime,
    end_time: endTime,
    status: 'pending',
    google_event_id: null,
  };

  await createAppointment(db, appointment);

  // Sync to Google Calendar (await to ensure it completes)
  let calendarSynced = false;
  try {
    await syncAppointmentToGoogleCalendar(env, appointment, service.name);
    calendarSynced = true;
  } catch (e) {
    console.error('Calendar sync error (non-blocking):', e);
  }

  // Send Telegram confirmation to customer
  try {
    const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
    const provider = await getProviderById(db, request.provider_id);
    const providerName = provider?.name || 'Provider';
    
    const startDate = new Date(startTime * 1000);
    const message = `✅ <b>Appointment Booked!</b>

📋 Service: ${service.name}
👨‍⚕️ Provider: ${providerName}
📅 Date: ${startDate.toLocaleDateString()}
⏰ Time: ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
⏳ Duration: ${service.duration_minutes} minutes

${calendarSynced ? '📆 Added to Google Calendar' : ''}

Status: <i>Pending confirmation from doctor</i>

You will be notified once the doctor confirms.`;

    await bot.sendMessage(parseInt(request.customer_telegram_id), message);
    console.log('Telegram confirmation sent to customer:', request.customer_telegram_id);

    // Notify doctor about new appointment request
    if (provider?.telegram_id) {
      const doctorMessage = `🔔 <b>New Appointment Request!</b>

👤 Patient: ${request.customer_name}
📋 Service: ${service.name}
📅 Date: ${startDate.toLocaleDateString()}
⏰ Time: ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
⏳ Duration: ${service.duration_minutes} minutes

Do you want to confirm this appointment?`;

      await bot.sendMessageWithKeyboard(
        parseInt(provider.telegram_id),
        doctorMessage,
        [
          [
            { text: '✅ Confirm', callback_data: `approve:${appointmentId}` },
            { text: '❌ Reject', callback_data: `reject:${appointmentId}` }
          ]
        ]
      );
      console.log('Doctor notification sent to:', provider.telegram_id);
    } else {
      console.log('Doctor has no Telegram ID configured');
    }
  } catch (e) {
    console.error('Telegram notification error (non-blocking):', e);
  }

  return {
    id: appointmentId,
    status: 'pending',
    start_time: startTime,
    end_time: endTime,
  };
}

async function syncAppointmentToGoogleCalendar(
  env: Env,
  appointment: Omit<Appointment, 'created_at' | 'updated_at'>,
  serviceName: string
): Promise<void> {
  try {
    const provider = await getProviderById(env.DB, appointment.provider_id);
    const providerName = provider?.name || 'Provider';

    const eventId = await syncAppointmentToCalendar(
      env,
      appointment as Appointment,
      serviceName,
      providerName
    );

    if (eventId) {
      const { updateAppointmentStatus } = await import('../../db/queries/appointments');
      await updateAppointmentStatus(env.DB, appointment.id, appointment.status, eventId);
      console.log('Calendar sync successful, event ID saved:', eventId);
    }
  } catch (error) {
    console.error('Calendar sync failed with error:', error);
  }
}

export async function getAvailableSlotsForDate(
  db: D1Database,
  providerId: string,
  date: Date,
  serviceId: string
): Promise<{ start: Date; end: Date }[]> {
  // Get service duration
  const service = await getServiceById(db, serviceId);
  if (!service) {
    throw new NotFoundError('Service');
  }

  // Get provider availability
  const availability = await getAvailabilityByProvider(db, providerId);

  // Get blocked dates
  const blockedDates = await getBlockedDatesByProvider(db, providerId);

  // Get existing appointments for this date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const existingAppointments = await getConflictingAppointments(
    db,
    providerId,
    Math.floor(startOfDay.getTime() / 1000),
    Math.floor(endOfDay.getTime() / 1000)
  );

  // Calculate available slots
  return calculateAvailableSlots(
    date,
    availability,
    blockedDates,
    service.duration_minutes,
    existingAppointments
  );
}

export async function cancelAppointmentByCustomer(
  db: D1Database,
  appointmentId: string,
  customerTelegramId: string
): Promise<void> {
  const appointment = await getAppointmentById(db, appointmentId);

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (appointment.customer_telegram_id !== customerTelegramId) {
    throw new ValidationError('You can only cancel your own appointments');
  }

  if (appointment.status === 'cancelled') {
    throw new ValidationError('Appointment is already cancelled');
  }

  await updateAppointmentStatus(db, appointmentId, 'cancelled');
}

export async function rescheduleAppointmentByCustomer(
  db: D1Database,
  appointmentId: string,
  customerTelegramId: string,
  newStartTime: number
): Promise<BookingResult> {
  const appointment = await getAppointmentById(db, appointmentId);

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (appointment.customer_telegram_id !== customerTelegramId) {
    throw new ValidationError('You can only reschedule your own appointments');
  }

  if (appointment.status === 'cancelled') {
    throw new ValidationError('Cannot reschedule a cancelled appointment');
  }

  // Get service to calculate new end time
  const service = await getServiceById(db, appointment.service_id);
  if (!service) {
    throw new NotFoundError('Service');
  }

  const newEndTime = newStartTime + service.duration_minutes * 60;

  // Check for conflicts (excluding current appointment)
  const conflictingAppointments = await getConflictingAppointments(
    db,
    appointment.provider_id,
    newStartTime,
    newEndTime,
    appointmentId
  );

  if (conflictingAppointments.length > 0) {
    throw new ConflictError('New time slot is not available');
  }

  // Update appointment time
  const { updateAppointmentTime } = await import('../../db/queries/appointments');
  await updateAppointmentTime(db, appointmentId, newStartTime, newEndTime);

  return {
    id: appointmentId,
    status: 'rescheduled',
    start_time: newStartTime,
    end_time: newEndTime,
  };
}
