import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Google Calendar Event Creation', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('createCalendarEvent', () => {
    it('should create a calendar event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'event-123',
            summary: 'Appointment with Dr. Smith',
            start: { dateTime: '2026-03-24T10:00:00Z' },
            end: { dateTime: '2026-03-24T10:30:00Z' },
          }),
      });

      const result = await createCalendarEvent('fake-token', {
        summary: 'Appointment with Dr. Smith',
        description: 'Consultation',
        startTime: new Date('2026-03-24T10:00:00Z'),
        endTime: new Date('2026-03-24T10:30:00Z'),
      });

      expect(result.id).toBe('event-123');
      expect(result.summary).toBe('Appointment with Dr. Smith');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(
        createCalendarEvent('invalid-token', {
          summary: 'Test',
          startTime: new Date(),
          endTime: new Date(),
        })
      ).rejects.toThrow('Failed to create calendar event');
    });
  });

  describe('deleteCalendarEvent', () => {
    it('should delete a calendar event', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await deleteCalendarEvent('fake-token', 'event-123');
      expect(result).toBe(true);
    });
  });
});

// Implementation placeholder
async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
  }
): Promise<{ id: string; summary: string }> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to create calendar event');
  }

  return response.json() as Promise<{ id: string; summary: string }>;
}

async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<boolean> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  return response.ok;
}
