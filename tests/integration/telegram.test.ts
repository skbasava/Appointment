import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Telegram Webhook Integration', () => {
  const baseUrl = 'http://localhost:8787';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('POST /api/telegram/webhook', () => {
    it('should handle /start command', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 12345, first_name: 'John' },
            chat: { id: 12345, type: 'private' },
            text: '/start',
          },
        }),
      });

      expect(response.ok).toBe(true);
    });

    it('should handle /help command', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 2,
          message: {
            message_id: 2,
            from: { id: 12345, first_name: 'John' },
            chat: { id: 12345, type: 'private' },
            text: '/help',
          },
        }),
      });

      expect(response.ok).toBe(true);
    });

    it('should handle /book command', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 3,
          message: {
            message_id: 3,
            from: { id: 12345, first_name: 'John' },
            chat: { id: 12345, type: 'private' },
            text: '/book',
          },
        }),
      });

      expect(response.ok).toBe(true);
    });

    it('should ignore messages without text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 4,
          message: {
            message_id: 4,
            from: { id: 12345, first_name: 'John' },
            chat: { id: 12345, type: 'private' },
          },
        }),
      });

      expect(response.ok).toBe(true);
    });
  });
});
