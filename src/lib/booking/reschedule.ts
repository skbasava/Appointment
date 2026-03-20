import { Appointment } from '../../db/types';
import { getAppointmentById, updateAppointmentTime } from '../../db/queries/appointments';
import { getServiceById } from '../../db/queries/services';
import { getConflictingAppointments } from '../../db/queries/appointments';
import { ValidationError, NotFoundError, ConflictError } from '../../api/middleware/error';

export interface RescheduleResult {
  id: string;
  status: string;
  start_time: number;
  end_time: number;
}

export async function rescheduleAppointment(
  db: D1Database,
  appointmentId: string,
  customerTelegramId: string,
  newStartTime: number
): Promise<RescheduleResult> {
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

  if (newStartTime < Math.floor(Date.now() / 1000)) {
    throw new ValidationError('Cannot reschedule to a past time');
  }

  if (newStartTime === appointment.start_time) {
    throw new ValidationError('New time must be different from current time');
  }

  const service = await getServiceById(db, appointment.service_id);
  if (!service) {
    throw new NotFoundError('Service');
  }

  const newEndTime = newStartTime + service.duration_minutes * 60;

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

  await updateAppointmentTime(db, appointmentId, newStartTime, newEndTime);

  return {
    id: appointmentId,
    status: 'rescheduled',
    start_time: newStartTime,
    end_time: newEndTime,
  };
}
