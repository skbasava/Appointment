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

describe('Appointment Cancellation', () => {
  const mockAppointment: Appointment = {
    id: 'apt-1',
    provider_id: 'provider-1',
    service_id: 'service-1',
    customer_telegram_id: '12345',
    customer_name: 'John Doe',
    start_time: 1742808000,
    end_time: 1742809800,
    status: 'confirmed',
    google_event_id: null,
  };

  describe('validateCancellation', () => {
    it('should allow cancelling a confirmed appointment', () => {
      const result = validateCancellation(mockAppointment, '12345');
      expect(result.valid).toBe(true);
    });

    it('should allow cancelling a pending appointment', () => {
      const pendingAppointment = { ...mockAppointment, status: 'pending' };
      const result = validateCancellation(pendingAppointment, '12345');
      expect(result.valid).toBe(true);
    });

    it('should not allow cancelling an already cancelled appointment', () => {
      const cancelledAppointment = { ...mockAppointment, status: 'cancelled' };
      const result = validateCancellation(cancelledAppointment, '12345');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Appointment is already cancelled');
    });

    it('should not allow cancelling another customer appointment', () => {
      const result = validateCancellation(mockAppointment, '67890');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You can only cancel your own appointments');
    });

    it('should not allow cancelling appointment within 24 hours', () => {
      const soonAppointment = {
        ...mockAppointment,
        start_time: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };
      const result = validateCancellation(soonAppointment, '12345', 24);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot cancel within 24 hours of appointment');
    });
  });
});

function validateCancellation(
  appointment: Appointment,
  customerTelegramId: string,
  cancellationWindowHours = 0
): { valid: boolean; error?: string } {
  if (appointment.customer_telegram_id !== customerTelegramId) {
    return { valid: false, error: 'You can only cancel your own appointments' };
  }

  if (appointment.status === 'cancelled') {
    return { valid: false, error: 'Appointment is already cancelled' };
  }

  if (cancellationWindowHours > 0) {
    const now = Math.floor(Date.now() / 1000);
    const windowSeconds = cancellationWindowHours * 3600;
    if (appointment.start_time - now < windowSeconds) {
      return { valid: false, error: `Cannot cancel within ${cancellationWindowHours} hours of appointment` };
    }
  }

  return { valid: true };
}
