import { Appointment } from '../../db/types';
import { getAppointmentById, updateAppointmentStatus } from '../../db/queries/appointments';
import { ValidationError, NotFoundError } from '../../api/middleware/error';

export interface CancelResult {
  id: string;
  status: string;
}

export async function cancelAppointment(
  db: D1Database,
  appointmentId: string,
  customerTelegramId: string
): Promise<CancelResult> {
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

  return {
    id: appointmentId,
    status: 'cancelled',
  };
}

export async function cancelAppointmentByProvider(
  db: D1Database,
  appointmentId: string,
  providerId: string
): Promise<CancelResult> {
  const appointment = await getAppointmentById(db, appointmentId);

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (appointment.provider_id !== providerId) {
    throw new ValidationError('You can only cancel appointments for your own services');
  }

  if (appointment.status === 'cancelled') {
    throw new ValidationError('Appointment is already cancelled');
  }

  await updateAppointmentStatus(db, appointmentId, 'cancelled');

  return {
    id: appointmentId,
    status: 'cancelled',
  };
}
