import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Manage Appointments API Integration', () => {
  const baseUrl = 'http://localhost:8787';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('GET /api/appointments', () => {
    it('should list customer appointments', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            appointments: [
              {
                id: 'apt-1',
                provider_id: 'provider-1',
                service_id: 'service-1',
                customer_name: 'John Doe',
                start_time: 1742808000,
                end_time: 1742809800,
                status: 'confirmed',
              },
            ],
          }),
      });

      const response = await fetch(`${baseUrl}/api/appointments`, {
        headers: { 'X-Telegram-User-Id': '12345' },
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.appointments).toHaveLength(1);
      expect(data.appointments[0].id).toBe('apt-1');
    });

    it('should require authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Telegram authentication required' }),
      });

      const response = await fetch(`${baseUrl}/api/appointments`);
      expect(response.ok).toBe(false);
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('should get appointment details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            appointment: {
              id: 'apt-1',
              provider_id: 'provider-1',
              service_id: 'service-1',
              customer_name: 'John Doe',
              start_time: 1742808000,
              end_time: 1742809800,
              status: 'confirmed',
            },
          }),
      });

      const response = await fetch(`${baseUrl}/api/appointments/apt-1`, {
        headers: { 'X-Telegram-User-Id': '12345' },
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.appointment.id).toBe('apt-1');
    });
  });

  describe('PUT /api/appointments/:id/reschedule', () => {
    it('should reschedule an appointment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'apt-1',
            status: 'rescheduled',
            start_time: 1742811600,
            end_time: 1742813400,
          }),
      });

      const response = await fetch(`${baseUrl}/api/appointments/apt-1/reschedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-User-Id': '12345',
        },
        body: JSON.stringify({ start_time: 1742811600 }),
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('rescheduled');
    });
  });

  describe('PUT /api/appointments/:id/cancel', () => {
    it('should cancel an appointment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Appointment cancelled successfully' }),
      });

      const response = await fetch(`${baseUrl}/api/appointments/apt-1/cancel`, {
        method: 'PUT',
        headers: { 'X-Telegram-User-Id': '12345' },
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.message).toBe('Appointment cancelled successfully');
    });
  });
});
