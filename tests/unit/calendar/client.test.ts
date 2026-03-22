import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleCalendarClient } from '../../../src/lib/calendar/client';

describe('createEvent with tentative status', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockClear();
    global.fetch = mockFetch as any;
  });

  it('should send tentative status and transparent transparency', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'event123', summary: 'test' }),
    });

    const client = new GoogleCalendarClient('fake-token', 'primary');
    await client.createEvent({
      summary: 'Test',
      startTime: new Date('2026-03-23T10:00:00Z'),
      endTime: new Date('2026-03-23T10:30:00Z'),
      status: 'tentative',
      transparency: 'transparent',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('tentative');
    expect(body.transparency).toBe('transparent');
  });

  it('should not include status or transparency when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'event456', summary: 'test' }),
    });

    const client = new GoogleCalendarClient('fake-token', 'primary');
    await client.createEvent({
      summary: 'Test',
      startTime: new Date('2026-03-23T10:00:00Z'),
      endTime: new Date('2026-03-23T10:30:00Z'),
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBeUndefined();
    expect(body.transparency).toBeUndefined();
  });
});

describe('updateEvent with status and transparency', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockClear();
    global.fetch = mockFetch as any;
  });

  it('should send status and transparency in PATCH body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'event123', summary: 'test' }),
    });

    const client = new GoogleCalendarClient('fake-token', 'primary');
    await client.updateEvent('event123', {
      status: 'confirmed',
      transparency: 'opaque',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('confirmed');
    expect(body.transparency).toBe('opaque');
  });
});
