import { describe, it, expect } from 'vitest';
import { calculateAvailableSlots } from '../../../src/lib/booking/slots';
import { AvailabilityWindow, BlockedDate } from '../../../src/db/types';

// Mock availability window data
interface ExistingAppointment {
  start_time: number;
  end_time: number;
}

describe('Slot Calculation', () => {
  const availability: AvailabilityWindow[] = [
    { id: 'a1', provider_id: 'p1', day_of_week: 1, start_time: '09:00', end_time: '17:00', is_active: 1 }, // Monday
    { id: 'a2', provider_id: 'p1', day_of_week: 2, start_time: '10:00', end_time: '16:00', is_active: 1 }, // Tuesday
  ];

  const blockedDates: BlockedDate[] = [
    { id: 'b1', provider_id: 'p1', date: '2026-03-23', reason: null }, // Monday
  ];

  describe('calculateAvailableSlots', () => {
    it('should return empty array when no availability for the day', () => {
      // Sunday - no availability defined
      const date = new Date('2026-03-22'); // Sunday
      const slots = calculateAvailableSlots(date, availability, [], 30);
      expect(slots).toEqual([]);
    });

    it('should return available slots for a valid day', () => {
      // Use a future date to ensure slots are not filtered as past
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 1 week from now
      // Find the next Tuesday
      while (futureDate.getDay() !== 2) {
        futureDate.setDate(futureDate.getDate() + 1);
      }
      futureDate.setHours(0, 0, 0, 0);

      const slots = calculateAvailableSlots(futureDate, availability, [], 30);
      expect(slots.length).toBeGreaterThan(0);
      // Tuesday 10:00-16:00 with 30min slots = 12 slots
      expect(slots.length).toBe(12);
    });

    it('should respect blocked dates', () => {
      const date = new Date('2026-03-23'); // Monday, blocked
      const slots = calculateAvailableSlots(date, availability, blockedDates, 30);
      expect(slots).toEqual([]);
    });

    it('should filter out past time slots', () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const slots = calculateAvailableSlots(today, availability, [], 30);
      // All slots in the past should be filtered out
      slots.forEach(slot => {
        expect(slot.start.getTime()).toBeGreaterThanOrEqual(now.getTime());
      });
    });

    it('should exclude conflicting appointments', () => {
      // Use a future date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      while (futureDate.getDay() !== 2) {
        futureDate.setDate(futureDate.getDate() + 1);
      }
      futureDate.setHours(0, 0, 0, 0);

      const startOfDay = new Date(futureDate);
      startOfDay.setHours(10, 0, 0, 0);

      const existingAppointments: ExistingAppointment[] = [
        {
          start_time: Math.floor(startOfDay.getTime() / 1000),
          end_time: Math.floor(startOfDay.getTime() / 1000) + 1800, // 30 min
        },
      ];

      const slots = calculateAvailableSlots(futureDate, availability, [], 30, existingAppointments);
      // Should have 11 slots (12 - 1 conflicting)
      expect(slots.length).toBe(11);
    });
  });
});
