# API Documentation

## Base URL

```
https://appoint.workers.dev
```

## Authentication

### Telegram Authentication (Customers)
Include `X-Telegram-User-Id` header with your Telegram user ID.

### Firebase Authentication (Providers)
Include `Authorization: Bearer <firebase-id-token>` header.

## Endpoints

### Public Endpoints

#### Health Check
```
GET /
```
Returns service status.

**Response:**
```json
{
  "status": "ok",
  "service": "appoint"
}
```

### Customer Endpoints (Telegram Auth)

#### Get Available Slots
```
GET /api/providers/:id/available-slots?date=YYYY-MM-DD&service_id=SERVICE_ID
```

**Parameters:**
- `id`: Provider ID
- `date`: Date to check (YYYY-MM-DD format)
- `service_id`: Service ID for duration calculation

**Response:**
```json
{
  "slots": [
    {
      "start": "2026-03-24T10:00:00.000Z",
      "end": "2026-03-24T10:30:00.000Z"
    }
  ]
}
```

#### Create Appointment
```
POST /api/appointments
```

**Request Body:**
```json
{
  "provider_id": "provider-uuid",
  "service_id": "service-uuid",
  "customer_name": "John Doe",
  "start_time": 1742808000
}
```

**Response:**
```json
{
  "id": "appointment-uuid",
  "status": "pending",
  "start_time": 1742808000,
  "end_time": 1742809800
}
```

#### List Customer Appointments
```
GET /api/appointments
```

**Response:**
```json
{
  "appointments": [
    {
      "id": "appointment-uuid",
      "provider_id": "provider-uuid",
      "service_id": "service-uuid",
      "customer_name": "John Doe",
      "start_time": 1742808000,
      "end_time": 1742809800,
      "status": "pending"
    }
  ]
}
```

#### Get Appointment Details
```
GET /api/appointments/:id
```

#### Reschedule Appointment
```
PUT /api/appointments/:id/reschedule
```

**Request Body:**
```json
{
  "start_time": 1742811600
}
```

#### Cancel Appointment
```
PUT /api/appointments/:id/cancel
```

### Provider Endpoints (Firebase Auth)

#### Register Provider
```
POST /api/providers/register
```

**Request Body:**
```json
{
  "type": "doctor",
  "name": "Dr. Smith",
  "email": "dr.smith@example.com",
  "phone": "+1234567890",
  "timezone": "America/New_York"
}
```

#### List Services
```
GET /api/providers/:id/services
```

#### Create Service
```
POST /api/providers/:id/services
```

**Request Body:**
```json
{
  "name": "General Consultation",
  "description": "Standard consultation",
  "duration_minutes": 30
}
```

#### Set Availability
```
POST /api/providers/:id/availability
```

**Request Body:**
```json
{
  "day_of_week": 1,
  "start_time": "09:00",
  "end_time": "17:00"
}
```

#### Add Blocked Date
```
POST /api/providers/:id/blocked-dates
```

**Request Body:**
```json
{
  "date": "2026-03-25",
  "reason": "Holiday"
}
```

#### Approve Appointment
```
PUT /api/appointments/:id/approve
```

#### Reject Appointment
```
PUT /api/appointments/:id/reject
```

### Calendar Endpoints

#### Connect Calendar
```
GET /api/providers/:id/calendar/connect
```
Returns Google OAuth URL.

**Response:**
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

#### Calendar Callback
```
GET /api/providers/:id/calendar/callback?code=CODE&provider_id=ID
```
Handles OAuth callback and stores calendar connection.

**Response:**
```json
{
  "message": "Calendar connected successfully",
  "calendar_id": "user@example.com"
}
```

#### Get Calendar Status
```
GET /api/providers/:id/calendar/status
```

**Response:**
```json
{
  "connected": true,
  "status": "connected",
  "calendar_id": "user@example.com",
  "last_synced_at": 1742808000
}
```

#### List Available Calendars
```
GET /api/providers/:id/calendar/list
```
Lists all calendars accessible by the provider.

**Response:**
```json
{
  "calendars": [
    {
      "id": "user@example.com",
      "summary": "My Calendar",
      "primary": true
    }
  ],
  "current_calendar_id": "user@example.com"
}
```

#### Select Calendar
```
POST /api/providers/:id/calendar/select
```

**Request Body:**
```json
{
  "calendar_id": "user@example.com"
}
```

**Response:**
```json
{
  "message": "Calendar updated successfully",
  "calendar_id": "user@example.com"
}
```

#### Disconnect Calendar
```
POST /api/providers/:id/calendar/disconnect
```

**Response:**
```json
{
  "message": "Calendar disconnected successfully"
}
```

### Telegram Webhook
```
POST /api/telegram/webhook
```
Receives Telegram updates.

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

**Common Error Codes:**
- `VALIDATION_ERROR`: Invalid input data
- `NOT_FOUND`: Resource not found
- `CONFLICT`: Resource conflict (e.g., double booking)
- `UNAUTHORIZED`: Authentication required
- `INTERNAL_ERROR`: Server error

## Rate Limiting

No rate limiting currently implemented.

## Data Types

### Timestamps
All timestamps are Unix timestamps (seconds since epoch).

### Durations
Duration is specified in minutes.
