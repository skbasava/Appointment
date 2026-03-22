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
  const userId = (c as any).get('userId');
  if (!userId) throw new ValidationError('Not authenticated');

  const provider = await c.env.DB.prepare('SELECT * FROM providers WHERE id = ?').bind(userId).first() as any;
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
  const userId = (c as any).get('userId');
  if (!userId) throw new ValidationError('Not authenticated');

  const provider = await c.env.DB.prepare('SELECT * FROM providers WHERE id = ?').bind(userId).first() as any;
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

export async function verifyAppointment(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    `SELECT a.id, a.customer_name, a.start_time, a.end_time, a.status, a.created_at,
            p.name as doctor_name, p.type as doctor_type,
            h.name as hospital_name
     FROM appointments a
     LEFT JOIN providers p ON a.provider_id = p.id
     LEFT JOIN providers h ON p.hospital_id = h.id
     WHERE a.id = ?`
  ).bind(id).first();

  if (!result) {
    return c.html('<html><body><h1>Appointment not found</h1></body></html>', 404);
  }

  const startTime = new Date((result.start_time as number) * 1000);
  const endTime = new Date((result.end_time as number) * 1000);

  return c.html(`<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Appointment Verification</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 400px; margin: 40px auto; padding: 20px; }
  .card { border: 2px solid ${result.status === 'confirmed' ? '#22c55e' : result.status === 'cancelled' ? '#ef4444' : '#f59e0b'}; border-radius: 12px; padding: 24px; }
  .status { font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 16px; color: ${result.status === 'confirmed' ? '#22c55e' : result.status === 'cancelled' ? '#ef4444' : '#f59e0b'}; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
  .label { color: #666; }
  .value { font-weight: 500; }
</style></head>
<body>
  <div class="card">
    <div class="status">${result.status === 'confirmed' ? '✅ Confirmed' : result.status === 'cancelled' ? '❌ Cancelled' : '⏳ Pending'}</div>
    <div class="row"><span class="label">Patient</span><span class="value">${result.customer_name || 'N/A'}</span></div>
    <div class="row"><span class="label">Doctor</span><span class="value">${result.doctor_name || 'N/A'}</span></div>
    <div class="row"><span class="label">Hospital</span><span class="value">${result.hospital_name || 'N/A'}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${startTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    <div class="row"><span class="label">Time</span><span class="value">${startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></div>
    <div class="row"><span class="label">Booked</span><span class="value">${new Date((result.created_at as number) * 1000).toLocaleDateString('en-IN')}</span></div>
  </div>
</body></html>`);
}
