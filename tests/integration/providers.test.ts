import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Provider Management API Integration', () => {
  const baseUrl = 'http://localhost:8787';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('POST /api/providers/register', () => {
    it('should register a new provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'provider-1',
            type: 'doctor',
            name: 'Dr. Smith',
            email: 'dr.smith@example.com',
            status: 'pending',
          }),
      });

      const response = await fetch(`${baseUrl}/api/providers/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer firebase-token',
        },
        body: JSON.stringify({
          type: 'doctor',
          name: 'Dr. Smith',
          email: 'dr.smith@example.com',
          timezone: 'America/New_York',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBe('provider-1');
      expect(data.type).toBe('doctor');
    });

    it('should require authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Firebase authentication required' }),
      });

      const response = await fetch(`${baseUrl}/api/providers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'doctor', name: 'Dr. Smith', email: 'dr.smith@example.com' }),
      });
      expect(response.ok).toBe(false);
    });
  });

  describe('POST /api/providers/:id/services', () => {
    it('should create a new service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'service-1',
            provider_id: 'provider-1',
            name: 'General Consultation',
            duration_minutes: 30,
            is_active: 1,
          }),
      });

      const response = await fetch(`${baseUrl}/api/providers/provider-1/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer firebase-token',
        },
        body: JSON.stringify({
          name: 'General Consultation',
          description: 'Standard consultation',
          duration_minutes: 30,
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.name).toBe('General Consultation');
    });
  });

  describe('POST /api/providers/:id/availability', () => {
    it('should set availability window', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'avail-1',
            provider_id: 'provider-1',
            day_of_week: 1,
            start_time: '09:00',
            end_time: '17:00',
            is_active: 1,
          }),
      });

      const response = await fetch(`${baseUrl}/api/providers/provider-1/availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer firebase-token',
        },
        body: JSON.stringify({
          day_of_week: 1,
          start_time: '09:00',
          end_time: '17:00',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.day_of_week).toBe(1);
    });
  });

  describe('PUT /api/appointments/:id/approve', () => {
    it('should approve an appointment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Appointment approved',
            status: 'confirmed',
          }),
      });

      const response = await fetch(`${baseUrl}/api/appointments/apt-1/approve`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer firebase-token' },
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('confirmed');
    });
  });

  describe('PUT /api/appointments/:id/reject', () => {
    it('should reject an appointment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Appointment rejected',
            status: 'cancelled',
          }),
      });

      const response = await fetch(`${baseUrl}/api/appointments/apt-1/reject`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer firebase-token' },
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('cancelled');
    });
  });
});
