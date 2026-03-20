import { describe, it, expect } from 'vitest';

interface AvailabilityWindow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

describe('Availability Window Validation', () => {
  describe('validateAvailabilityWindow', () => {
    it('should accept valid availability window', () => {
      const window: AvailabilityWindow = {
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
      };
      const result = validateAvailabilityWindow(window);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid day of week', () => {
      const window: AvailabilityWindow = {
        day_of_week: 7,
        start_time: '09:00',
        end_time: '17:00',
      };
      const result = validateAvailabilityWindow(window);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('day_of_week must be between 0 and 6');
    });

    it('should reject invalid time format', () => {
      const window: AvailabilityWindow = {
        day_of_week: 1,
        start_time: '9:00',
        end_time: '17:00',
      };
      const result = validateAvailabilityWindow(window);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Time must be in HH:MM format');
    });

    it('should reject when start time is after end time', () => {
      const window: AvailabilityWindow = {
        day_of_week: 1,
        start_time: '17:00',
        end_time: '09:00',
      };
      const result = validateAvailabilityWindow(window);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Start time must be before end time');
    });

    it('should reject when start time equals end time', () => {
      const window: AvailabilityWindow = {
        day_of_week: 1,
        start_time: '09:00',
        end_time: '09:00',
      };
      const result = validateAvailabilityWindow(window);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Start time must be before end time');
    });
  });
});

function validateAvailabilityWindow(
  window: AvailabilityWindow
): { valid: boolean; error?: string } {
  if (window.day_of_week < 0 || window.day_of_week > 6) {
    return { valid: false, error: 'day_of_week must be between 0 and 6' };
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(window.start_time) || !timeRegex.test(window.end_time)) {
    return { valid: false, error: 'Time must be in HH:MM format' };
  }

  if (window.start_time >= window.end_time) {
    return { valid: false, error: 'Start time must be before end time' };
  }

  return { valid: true };
}
