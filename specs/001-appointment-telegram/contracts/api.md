# API Contract: Appointment System

**Feature**: 001-appointment-telegram  
**Date**: 2026-03-20

## Endpoints

### Provider Management

#### POST /api/providers/register

Register a new provider.

**Request**:
```json
{
  "type": "doctor | hospital",
  "name": "string",
  "email": "string",
  "phone": "string (optional)",
  "timezone": "string (IANA format)"
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "status": "pending",
  "message": "Provider registered. Verification email sent."
}
```

#### GET /api/providers/:id

Get provider details.

**Response** (200):
```json
{
  "id": "uuid",
  "type": "doctor",
  "name": "Dr. Smith",
  "email": "smith@example.com",
  "timezone": "America/New_York",
  "status": "active"
}
```

### Service Management

#### POST /api/providers/:id/services

Create a new service.

**Request**:
```json
{
  "name": "string",
  "description": "string (optional)",
  "duration_minutes": 30
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "name": "General Consultation",
  "duration_minutes": 30,
  "is_active": true
}
```

#### GET /api/providers/:id/services

List provider services.

**Response** (200):
```json
{
  "services": [
    {
      "id": "uuid",
      "name": "General Consultation",
      "duration_minutes": 30,
      "is_active": true
    }
  ]
}
```

### Availability Management

#### POST /api/providers/:id/availability

Set recurring availability windows.

**Request**:
```json
{
  "windows": [
    {
      "day_of_week": 1,
      "start_time": "09:00",
      "end_time": "12:00"
    },
    {
      "day_of_week": 1,
      "start_time": "14:00",
      "end_time": "17:00"
    }
  ]
}
```

**Response** (200):
```json
{
  "message": "Availability updated",
  "windows_count": 2
}
```

#### POST /api/providers/:id/blocked-dates

Block a specific date.

**Request**:
```json
{
  "date": "2026-04-15",
  "reason": "Conference attendance"
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "date": "2026-04-15",
  "blocked": true
}
```

### Booking

#### GET /api/providers/:id/available-slots

Get available time slots for a date.

**Query Params**: `date=2026-04-10&service_id=uuid`

**Response** (200):
```json
{
  "date": "2026-04-10",
  "provider_timezone": "America/New_York",
  "slots": [
    {
      "start_time": "09:00",
      "end_time": "09:30",
      "available": true
    },
    {
      "start_time": "09:30",
      "end_time": "10:00",
      "available": true
    }
  ]
}
```

#### POST /api/appointments

Book an appointment.

**Request**:
```json
{
  "provider_id": "uuid",
  "service_id": "uuid",
  "start_time": "2026-04-10T09:00:00-05:00",
  "customer_telegram_id": "string",
  "customer_name": "string"
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "status": "pending",
  "message": "Booking request sent to provider for approval"
}
```

#### GET /api/appointments/:id

Get appointment details.

**Response** (200):
```json
{
  "id": "uuid",
  "provider_name": "Dr. Smith",
  "service_name": "General Consultation",
  "start_time": "2026-04-10T09:00:00-05:00",
  "end_time": "2026-04-10T09:30:00-05:00",
  "status": "confirmed",
  "customer_name": "John Doe"
}
```

#### GET /api/appointments?customer_telegram_id=string

List customer appointments.

**Response** (200):
```json
{
  "appointments": [
    {
      "id": "uuid",
      "provider_name": "Dr. Smith",
      "service_name": "General Consultation",
      "start_time": "2026-04-10T09:00:00-05:00",
      "status": "confirmed"
    }
  ]
}
```

#### PUT /api/appointments/:id/cancel

Cancel an appointment.

**Response** (200):
```json
{
  "id": "uuid",
  "status": "cancelled",
  "message": "Appointment cancelled. Google Calendar event removed."
}
```

#### PUT /api/appointments/:id/reschedule

Reschedule an appointment.

**Request**:
```json
{
  "new_start_time": "2026-04-11T10:00:00-05:00"
}
```

**Response** (200):
```json
{
  "id": "uuid",
  "status": "confirmed",
  "new_start_time": "2026-04-11T10:00:00-05:00",
  "message": "Appointment rescheduled"
}
```

### Provider Approval

#### PUT /api/appointments/:id/approve

Provider approves a booking request.

**Response** (200):
```json
{
  "id": "uuid",
  "status": "confirmed",
  "message": "Booking confirmed. Customer notified via Telegram."
}
```

#### PUT /api/appointments/:id/reject

Provider rejects a booking request.

**Request**:
```json
{
  "reason": "Schedule conflict"
}
```

**Response** (200):
```json
{
  "id": "uuid",
  "status": "cancelled",
  "message": "Booking rejected. Customer notified via Telegram."
}
```

### Google Calendar

#### GET /api/providers/:id/calendar/connect

Initiate Google Calendar OAuth2 flow.

**Response** (302): Redirect to Google authorization URL.

#### GET /api/providers/:id/calendar/callback

Handle Google OAuth2 callback.

**Query Params**: `code=string`

**Response** (200):
```json
{
  "connected": true,
  "calendar_name": "Primary Calendar",
  "message": "Google Calendar connected successfully"
}
```

#### GET /api/providers/:id/calendar/status

Get calendar connection status.

**Response** (200):
```json
{
  "connected": true,
  "calendar_name": "Primary Calendar",
  "status": "connected",
  "last_synced_at": 1710892800
}
```

### Telegram Webhook

#### POST /api/telegram/webhook

Receive Telegram updates.

**Request**: Telegram Update object

**Response** (200):
```json
{
  "ok": true
}
```
