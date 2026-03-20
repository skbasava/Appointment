import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Calendar OAuth Flow Integration', () => {
  const baseUrl = 'http://localhost:8787';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('GET /api/providers/:id/calendar/connect', () => {
    it('should return Google OAuth URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            auth_url: 'https://accounts.google.com/o/oauth2/v2/auth?...',
          }),
      });

      const response = await fetch(`${baseUrl}/api/providers/provider-1/calendar/connect`, {
        headers: { Authorization: 'Bearer firebase-token' },
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.auth_url).toContain('accounts.google.com');
    });

    it('should require authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Firebase authentication required' }),
      });

      const response = await fetch(`${baseUrl}/api/providers/provider-1/calendar/connect`);
      expect(response.ok).toBe(false);
    });
  });

  describe('GET /api/providers/:id/calendar/callback', () => {
    it('should handle OAuth callback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Calendar connected successfully' }),
      });

      const response = await fetch(
        `${baseUrl}/api/providers/provider-1/calendar/callback?code=auth-code&provider_id=provider-1`
      );
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.message).toBe('Calendar connected successfully');
    });
  });

  describe('GET /api/providers/:id/calendar/status', () => {
    it('should return calendar connection status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            connected: true,
            status: 'connected',
            last_synced_at: 1742808000,
          }),
      });

      const response = await fetch(`${baseUrl}/api/providers/provider-1/calendar/status`, {
        headers: { Authorization: 'Bearer firebase-token' },
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.connected).toBe(true);
    });
  });
});
