import { Context } from 'hono';
import { Env } from '../../db/types';
import { bookAppointment, cancelAppointmentByCustomer, rescheduleAppointmentByCustomer } from '../../lib/booking/service';
import { getAppointmentById, getAppointmentsByCustomer, getAppointmentsByProvider, updateAppointmentStatus } from '../../db/queries/appointments';
import { ValidationError, NotFoundError } from '../middleware/error';
import { getTelegramUser } from '../../lib/auth/telegram';
import { getProvider } from '../../lib/auth/firebase';

export async function createAppointment(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const telegramUser = getTelegramUser(c);
    const body = await c.req.json();

    const { provider_id, service_id, customer_name, start_time } = body;

    if (!provider_id || !service_id || !customer_name || !start_time) {
      throw new ValidationError('provider_id, service_id, customer_name, and start_time are required');
    }

    const result = await bookAppointment(c.env, {
      provider_id,
      service_id,
      customer_telegram_id: String(telegramUser.id),
      customer_name,
      start_time,
    });

    return c.json(result, 201);
  } catch (error: any) {
    if (error?.statusCode) {
      return c.json({ error: error.message, code: error.code }, error.statusCode);
    }
    throw error;
  }
}

export async function listCustomerAppointments(c: Context<{ Bindings: Env }>): Promise<Response> {
  const telegramUser = getTelegramUser(c);
  const appointments = await getAppointmentsByCustomer(c.env.DB, String(telegramUser.id));
  return c.json({ appointments });
}

export async function getAppointment(c: Context<{ Bindings: Env }>): Promise<Response> {
  const appointmentId = c.req.param('id');
  const appointment = await getAppointmentById(c.env.DB, appointmentId);

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  return c.json({ appointment });
}

export async function rescheduleAppointment(c: Context<{ Bindings: Env }>): Promise<Response> {
  const telegramUser = getTelegramUser(c);
  const appointmentId = c.req.param('id');
  const body = await c.req.json();

  const { start_time } = body;

  if (!start_time) {
    throw new ValidationError('start_time is required');
  }

  const result = await rescheduleAppointmentByCustomer(
    c.env.DB,
    appointmentId,
    String(telegramUser.id),
    start_time
  );

  return c.json(result);
}

export async function cancelAppointment(c: Context<{ Bindings: Env }>): Promise<Response> {
  const telegramUser = getTelegramUser(c);
  const appointmentId = c.req.param('id');

  await cancelAppointmentByCustomer(c.env.DB, appointmentId, String(telegramUser.id));

  return c.json({ message: 'Appointment cancelled successfully' });
}

export async function approveAppointment(c: Context<{ Bindings: Env }>): Promise<Response> {
  const provider = getProvider(c);
  if (!provider) {
    throw new ValidationError('Provider not found');
  }

  const appointmentId = c.req.param('id');
  const appointment = await getAppointmentById(c.env.DB, appointmentId);

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (appointment.provider_id !== provider.id) {
    throw new ValidationError('You can only approve appointments for your own services');
  }

  await updateAppointmentStatus(c.env.DB, appointmentId, 'confirmed');

  return c.json({ message: 'Appointment approved', status: 'confirmed' });
}

export async function rejectAppointment(c: Context<{ Bindings: Env }>): Promise<Response> {
  const provider = getProvider(c);
  if (!provider) {
    throw new ValidationError('Provider not found');
  }

  const appointmentId = c.req.param('id');
  const appointment = await getAppointmentById(c.env.DB, appointmentId);

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (appointment.provider_id !== provider.id) {
    throw new ValidationError('You can only reject appointments for your own services');
  }

  await updateAppointmentStatus(c.env.DB, appointmentId, 'cancelled');

  return c.json({ message: 'Appointment rejected', status: 'cancelled' });
}
