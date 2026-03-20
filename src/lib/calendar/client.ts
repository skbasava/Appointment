const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

export interface BusyTime {
  start: string;
  end: string;
}

export class GoogleCalendarClient {
  private accessToken: string;
  private calendarId: string;

  constructor(accessToken: string, calendarId: string = 'primary') {
    this.accessToken = accessToken;
    this.calendarId = encodeURIComponent(calendarId);
  }

  async createEvent(event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
  }): Promise<CalendarEvent> {
    const response = await fetch(`${CALENDAR_API_BASE}/calendars/${this.calendarId}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create calendar event: ${error}`);
    }

    return response.json() as Promise<CalendarEvent>;
  }

  async updateEvent(
    eventId: string,
    event: {
      summary?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
    }
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};

    if (event.summary) body.summary = event.summary;
    if (event.description) body.description = event.description;
    if (event.startTime) body.start = { dateTime: event.startTime.toISOString() };
    if (event.endTime) body.end = { dateTime: event.endTime.toISOString() };

    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/${this.calendarId}/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update calendar event: ${error}`);
    }

    return response.json() as Promise<CalendarEvent>;
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/${this.calendarId}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    return response.ok;
  }

  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/${this.calendarId}/events/${eventId}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<CalendarEvent>;
  }

  async getBusyTimes(startTime: Date, endTime: Date): Promise<BusyTime[]> {
    const response = await fetch(`${CALENDAR_API_BASE}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: this.calendarId }],
      }),
    });

    if (!response.ok) {
      console.error('Failed to fetch busy times:', await response.text());
      return [];
    }

    const data = (await response.json()) as {
      calendars: Record<string, { busy: BusyTime[] }>;
    };

    return data.calendars[this.calendarId]?.busy || [];
  }

  async hasConflict(startTime: Date, endTime: Date): Promise<boolean> {
    const busyTimes = await this.getBusyTimes(startTime, endTime);

    return busyTimes.some((busy) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return busyStart < endTime && busyEnd > startTime;
    });
  }

  async listCalendars(): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
    const response = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      console.error('Failed to list calendars:', await response.text());
      return [];
    }

    const data = (await response.json()) as {
      items: Array<{ id: string; summary: string; primary: boolean }>;
    };

    return data.items || [];
  }
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}
