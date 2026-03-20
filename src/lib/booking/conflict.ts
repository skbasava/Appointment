import { Appointment } from '../../db/types';

interface TimeRange {
  start_time: number;
  end_time: number;
}

export function hasConflict(
  newAppointment: TimeRange,
  existingAppointments: Appointment[]
): boolean {
  return existingAppointments.some((existing) => {
    // Ignore cancelled appointments
    if (existing.status === 'cancelled') {
      return false;
    }

    // Check for overlap: two intervals overlap if one starts before the other ends
    // and vice versa. Adjacent intervals (where end == start) don't overlap.
    return (
      existing.start_time < newAppointment.end_time &&
      existing.end_time > newAppointment.start_time
    );
  });
}

export function validateNoConflict(
  newAppointment: TimeRange,
  existingAppointments: Appointment[]
): void {
  if (hasConflict(newAppointment, existingAppointments)) {
    throw new Error('Time slot conflicts with an existing appointment');
  }
}

export function getConflictingAppointment(
  newAppointment: TimeRange,
  existingAppointments: Appointment[]
): Appointment | null {
  return (
    existingAppointments.find((existing) => {
      if (existing.status === 'cancelled') {
        return false;
      }
      return (
        existing.start_time < newAppointment.end_time &&
        existing.end_time > newAppointment.start_time
      );
    }) || null
  );
}
