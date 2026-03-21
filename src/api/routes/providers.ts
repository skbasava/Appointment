import { Context } from 'hono';
import { Env } from '../../db/types';
import { getAvailableSlotsForDate } from '../../lib/booking/service';
import { ValidationError } from '../middleware/error';
import { getProviderById, createProvider } from '../../db/queries/providers';
import { getServicesByProvider, createService } from '../../db/queries/services';
import { getAvailabilityByProvider, createAvailabilityWindow, createBlockedDate } from '../../db/queries/availability';

function authUserId(c: Context<{ Bindings: Env }>): string {
  return (c as any).get('userId');
}

export async function getAvailableSlots(c: Context<{ Bindings: Env }>): Promise<Response> {
  const providerId = c.req.param('id');
  const dateStr = c.req.query('date');
  const serviceId = c.req.query('service_id');

  if (!dateStr) {
    throw new ValidationError('Date parameter is required');
  }

  if (!serviceId) {
    throw new ValidationError('Service ID parameter is required');
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new ValidationError('Invalid date format');
  }

  const slots = await getAvailableSlotsForDate(c.env.DB, providerId, date, serviceId);

  return c.json({
    slots: slots.map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
    })),
  });
}

export async function registerProvider(c: Context<{ Bindings: Env }>): Promise<Response> {
  const userId = authUserId(c);
  const body = await c.req.json();

  const { type, name, email, phone, timezone } = body;

  if (!type || !name || !email) {
    throw new ValidationError('type, name, and email are required');
  }

  if (!['doctor', 'hospital'].includes(type)) {
    throw new ValidationError('type must be "doctor" or "hospital"');
  }

  const provider = {
    id: crypto.randomUUID(),
    type: type as 'doctor' | 'hospital',
    name,
    email,
    phone: phone || null,
    firebase_uid: userId,
    timezone: timezone || 'UTC',
    status: 'pending' as const,
  };

  await createProvider(c.env.DB, provider);

  return c.json(provider, 201);
}

export async function listServices(c: Context<{ Bindings: Env }>): Promise<Response> {
  const providerId = c.req.param('id');
  const services = await getServicesByProvider(c.env.DB, providerId);
  return c.json({ services });
}

export async function createServiceHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const providerId = c.req.param('id');
  const body = await c.req.json();

  const { name, description, duration_minutes } = body;

  if (!name || !duration_minutes) {
    throw new ValidationError('name and duration_minutes are required');
  }

  if (typeof duration_minutes !== 'number' || duration_minutes < 15 || duration_minutes > 480) {
    throw new ValidationError('duration_minutes must be between 15 and 480');
  }

  const service = {
    id: crypto.randomUUID(),
    provider_id: providerId,
    name,
    description: description || null,
    duration_minutes,
    is_active: 1,
  };

  await createService(c.env.DB, service);

  return c.json(service, 201);
}

export { createServiceHandler as createService };

export async function setAvailability(c: Context<{ Bindings: Env }>): Promise<Response> {
  const providerId = c.req.param('id');
  const body = await c.req.json();

  const { day_of_week, start_time, end_time } = body;

  if (day_of_week === undefined || !start_time || !end_time) {
    throw new ValidationError('day_of_week, start_time, and end_time are required');
  }

  if (day_of_week < 0 || day_of_week > 6) {
    throw new ValidationError('day_of_week must be between 0 and 6');
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
    throw new ValidationError('Time must be in HH:MM format');
  }

  if (start_time >= end_time) {
    throw new ValidationError('start_time must be before end_time');
  }

  const window = {
    id: crypto.randomUUID(),
    provider_id: providerId,
    day_of_week,
    start_time,
    end_time,
    is_active: 1,
  };

  await createAvailabilityWindow(c.env.DB, window);

  return c.json(window, 201);
}

export async function addBlockedDate(c: Context<{ Bindings: Env }>): Promise<Response> {
  const providerId = c.req.param('id');
  const body = await c.req.json();

  const { date, reason } = body;

  if (!date) {
    throw new ValidationError('date is required');
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    throw new ValidationError('date must be in YYYY-MM-DD format');
  }

  const blockedDate = {
    id: crypto.randomUUID(),
    provider_id: providerId,
    date,
    reason: reason || null,
  };

  await createBlockedDate(c.env.DB, blockedDate);

  return c.json(blockedDate, 201);
}
