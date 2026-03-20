import { describe, it, expect } from 'vitest';

interface Appointment {
  id: string;
  provider_id: string;
  service_id: string;
  customer_telegram_id: string;
  customer_name: string;
  start_time: number;
  end_time: number;
  status: string;
  google_event_id: string | null;
}

describe('Appointment Reschedule', () => {
  // Use future timestamps for tests
  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 86400; // 24 hours from now
  const dayAfterTomorrow = now + 172800; // 48 hours from now

  const mockAppointment: Appointment = {
    id: 'apt-1',
    provider_id: 'provider-1',
    service_id: 'service-1',
    customer_telegram_id: '12345',
    customer_name: 'John Doe',
    start_time: tomorrow,
    end_time: tomorrow + 1800, // 30 min later
    status: 'confirmed',
    google_event_id: null,
  };

  describe('validateReschedule', () => {
    it('should allow rescheduling a confirmed appointment', () => {
      const result = validateReschedule(mockAppointment, dayAfterTomorrow);
      expect(result.valid).toBe(true);
    });

    it('should not allow rescheduling a cancelled appointment', () => {
      const cancelledAppointment = { ...mockAppointment, status: 'cancelled' };
      const result = validateReschedule(cancelledAppointment, dayAfterTomorrow);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot reschedule a cancelled appointment');
    });

    it('should not allow rescheduling to a past time', () => {
      const pastTime = now - 3600; // 1 hour ago
      const result = validateReschedule(mockAppointment, pastTime);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot reschedule to a past time');
    });

    it('should not allow rescheduling if new time is same as current', () => {
      const result = validateReschedule(mockAppointment, mockAppointment.start_time);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('New time must be different from current time');
    });
  });
});

function validateReschedule(
  appointment: Appointment,
  newStartTime: number
): { valid: boolean; error?: string } {
  if (appointment.status === 'cancelled') {
    return { valid: false, error: 'Cannot reschedule a cancelled appointment' };
  }

  if (newStartTime < Math.floor(Date.now() / 1000)) {
    return { valid: false, error: 'Cannot reschedule to a past time' };
  }

  if (newStartTime === appointment.start_time) {
    return { valid: false, error: 'New time must be different from current time' };
  }

  return { valid: true };
}
