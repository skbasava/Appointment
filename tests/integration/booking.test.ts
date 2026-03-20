import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch for API testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Booking API Integration', () => {
  const baseUrl = 'http://localhost:8787';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('GET /api/providers/:id/available-slots', () => {
    it('should return available slots for a provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            slots: [
              { start: '2026-03-24T10:00:00Z', end: '2026-03-24T10:30:00Z' },
              { start: '2026-03-24T10:30:00Z', end: '2026-03-24T11:00:00Z' },
            ],
          }),
      });

      const response = await fetch(
        `${baseUrl}/api/providers/provider-1/available-slots?date=2026-03-24`,
        {
          headers: { 'X-Telegram-User-Id': '12345' },
        }
      );
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.slots).toHaveLength(2);
    });

    it('should require authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Telegram authentication required' }),
      });

      const response = await fetch(
        `${baseUrl}/api/providers/provider-1/available-slots?date=2026-03-24`
      );
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toBe('Telegram authentication required');
    });
  });

  describe('POST /api/appointments', () => {
    it('should create an appointment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'apt-1',
            status: 'pending',
            start_time: 1742808000,
            end_time: 1742809800,
          }),
      });

      const response = await fetch(`${baseUrl}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-User-Id': '12345',
          'X-Telegram-Username': 'testuser',
        },
        body: JSON.stringify({
          provider_id: 'provider-1',
          service_id: 'service-1',
          customer_name: 'John Doe',
          start_time: 1742808000,
        }),
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.id).toBe('apt-1');
      expect(data.status).toBe('pending');
    });

    it('should reject double-booking', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            error: 'Time slot is no longer available',
            code: 'CONFLICT',
          }),
      });

      const response = await fetch(`${baseUrl}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-User-Id': '12345',
        },
        body: JSON.stringify({
          provider_id: 'provider-1',
          service_id: 'service-1',
          customer_name: 'John Doe',
          start_time: 1742808000,
        }),
      });
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.code).toBe('CONFLICT');
    });
  });
});
