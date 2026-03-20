import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Google Calendar Conflict Detection', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('checkCalendarConflicts', () => {
    it('should detect conflicts from calendar busy times', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            kind: 'calendar#freeBusy',
            calendars: {
              primary: {
                busy: [
                  {
                    start: '2026-03-24T10:00:00Z',
                    end: '2026-03-24T11:00:00Z',
                  },
                ],
              },
            },
          }),
      });

      const result = await checkCalendarConflicts('fake-token', {
        start: new Date('2026-03-24T10:30:00Z'),
        end: new Date('2026-03-24T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflicts).toHaveLength(1);
    });

    it('should return no conflicts when calendar is free', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            kind: 'calendar#freeBusy',
            calendars: {
              primary: {
                busy: [],
              },
            },
          }),
      });

      const result = await checkCalendarConflicts('fake-token', {
        start: new Date('2026-03-24T10:00:00Z'),
        end: new Date('2026-03-24T10:30:00Z'),
      });

      expect(result.hasConflict).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await checkCalendarConflicts('invalid-token', {
        start: new Date('2026-03-24T10:00:00Z'),
        end: new Date('2026-03-24T10:30:00Z'),
      });

      expect(result.hasConflict).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

// Implementation placeholder
async function checkCalendarConflicts(
  accessToken: string,
  timeRange: { start: Date; end: Date }
): Promise<{ hasConflict: boolean; conflicts: { start: string; end: string }[]; error?: string }> {
  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: timeRange.start.toISOString(),
          timeMax: timeRange.end.toISOString(),
          items: [{ id: 'primary' }],
        }),
      }
    );

    if (!response.ok) {
      return { hasConflict: false, conflicts: [], error: 'Failed to check calendar' };
    }

    const data = (await response.json()) as {
      calendars: { primary: { busy: { start: string; end: string }[] } };
    };

    const busyTimes = data.calendars.primary.busy || [];
    const conflicts = busyTimes.filter((busy) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return busyStart < timeRange.end && busyEnd > timeRange.start;
    });

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  } catch (error) {
    return { hasConflict: false, conflicts: [], error: 'Calendar check failed' };
  }
}
