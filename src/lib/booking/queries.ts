import { Appointment } from '../db/types';
import { getAppointmentsByCustomer, getAppointmentById } from '../db/queries/appointments';

export async function getCustomerAppointments(
  db: D1Database,
  customerTelegramId: string
): Promise<Appointment[]> {
  return getAppointmentsByCustomer(db, customerTelegramId);
}

export async function getAppointmentDetails(
  db: D1Database,
  appointmentId: string
): Promise<Appointment | null> {
  return getAppointmentById(db, appointmentId);
}

export function groupAppointmentsByStatus(
  appointments: Appointment[]
): Record<string, Appointment[]> {
  return appointments.reduce(
    (groups, appointment) => {
      const status = appointment.status;
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(appointment);
      return groups;
    },
    {} as Record<string, Appointment[]>
  );
}

export function sortAppointmentsByDate(
  appointments: Appointment[],
  order: 'asc' | 'desc' = 'desc'
): Appointment[] {
  return [...appointments].sort((a, b) => {
    const diff = a.start_time - b.start_time;
    return order === 'asc' ? diff : -diff;
  });
}
