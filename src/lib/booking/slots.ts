import { AvailabilityWindow, BlockedDate } from '../../db/types';

interface TimeSlot {
  start: Date;
  end: Date;
}

interface ExistingAppointment {
  start_time: number;
  end_time: number;
}

export function calculateAvailableSlots(
  date: Date,
  availability: AvailabilityWindow[],
  blockedDates: BlockedDate[],
  durationMinutes: number,
  existingAppointments: ExistingAppointment[] = []
): TimeSlot[] {
  // Check if date is blocked
  const dateStr = date.toISOString().split('T')[0];
  const isBlocked = blockedDates.some((bd) => bd.date === dateStr);
  if (isBlocked) {
    return [];
  }

  // Get day of week (0=Sunday, 6=Saturday)
  const dayOfWeek = date.getDay();

  // Find availability for this day
  const dayAvailability = availability.filter(
    (a) => a.day_of_week === dayOfWeek && a.is_active === 1
  );

  if (dayAvailability.length === 0) {
    return [];
  }

  const slots: TimeSlot[] = [];
  const now = new Date();

  for (const window of dayAvailability) {
    const [startHour, startMinute] = window.start_time.split(':').map(Number);
    const [endHour, endMinute] = window.end_time.split(':').map(Number);

    const windowStart = new Date(date);
    windowStart.setHours(startHour, startMinute, 0, 0);

    const windowEnd = new Date(date);
    windowEnd.setHours(endHour, endMinute, 0, 0);

    // Generate slots
    const slotDurationMs = durationMinutes * 60 * 1000;
    let currentSlotStart = new Date(windowStart);

    while (currentSlotStart.getTime() + slotDurationMs <= windowEnd.getTime()) {
      const currentSlotEnd = new Date(currentSlotStart.getTime() + slotDurationMs);

      // Skip past slots
      if (currentSlotStart < now) {
        currentSlotStart = new Date(currentSlotStart.getTime() + slotDurationMs);
        continue;
      }

      // Check for conflicts with existing appointments
      const slotStartUnix = Math.floor(currentSlotStart.getTime() / 1000);
      const slotEndUnix = Math.floor(currentSlotEnd.getTime() / 1000);

      const hasConflict = existingAppointments.some((apt) => {
        return apt.start_time < slotEndUnix && apt.end_time > slotStartUnix;
      });

      if (!hasConflict) {
        slots.push({
          start: new Date(currentSlotStart),
          end: new Date(currentSlotEnd),
        });
      }

      currentSlotStart = new Date(currentSlotStart.getTime() + slotDurationMs);
    }
  }

  return slots;
}
