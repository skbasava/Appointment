# Data Model: Appointment System with Telegram + Google Calendar

**Feature**: 001-appointment-telegram  
**Date**: 2026-03-20

## Entities

### Provider

Represents a doctor or hospital offering appointments.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| type | TEXT | NOT NULL | 'doctor' or 'hospital' |
| name | TEXT | NOT NULL | Provider display name |
| email | TEXT | UNIQUE, NOT NULL | Contact email |
| phone | TEXT | NULL | Contact phone |
| firebase_uid | TEXT | UNIQUE, NOT NULL | Firebase auth identifier |
| timezone | TEXT | NOT NULL | Provider's timezone (IANA format) |
| status | TEXT | NOT NULL | 'pending', 'verified', 'active', 'suspended' |
| created_at | INTEGER | NOT NULL | Unix timestamp |
| updated_at | INTEGER | NOT NULL | Unix timestamp |

### Service

Represents a bookable service offered by a provider.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| provider_id | TEXT | NOT NULL, FK → Provider | Owning provider |
| name | TEXT | NOT NULL | Service name |
| description | TEXT | NULL | Service description |
| duration_minutes | INTEGER | NOT NULL | Appointment duration |
| is_active | INTEGER | NOT NULL | 1 = active, 0 = inactive |
| created_at | INTEGER | NOT NULL | Unix timestamp |

### Availability Window

Represents recurring availability for a provider.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| provider_id | TEXT | NOT NULL, FK → Provider | Owning provider |
| day_of_week | INTEGER | NOT NULL | 0=Sunday, 6=Saturday |
| start_time | TEXT | NOT NULL | HH:MM format |
| end_time | TEXT | NOT NULL | HH:MM format |
| is_active | INTEGER | NOT NULL | 1 = active, 0 = inactive |

### Blocked Date

Represents a specific date when a provider is unavailable.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| provider_id | TEXT | NOT NULL, FK → Provider | Owning provider |
| date | TEXT | NOT NULL | YYYY-MM-DD format |
| reason | TEXT | NULL | Optional reason |

### Appointment

Represents a booked time slot.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| provider_id | TEXT | NOT NULL, FK → Provider | Service provider |
| service_id | TEXT | NOT NULL, FK → Service | Booked service |
| customer_telegram_id | TEXT | NOT NULL | Telegram user ID |
| customer_name | TEXT | NOT NULL | Customer display name |
| start_time | INTEGER | NOT NULL | Unix timestamp |
| end_time | INTEGER | NOT NULL | Unix timestamp |
| status | TEXT | NOT NULL | 'pending', 'confirmed', 'cancelled', 'rescheduled' |
| google_event_id | TEXT | NULL | Google Calendar event ID |
| created_at | INTEGER | NOT NULL | Unix timestamp |
| updated_at | INTEGER | NOT NULL | Unix timestamp |

### Calendar Connection

Represents the link between a provider and their Google Calendar.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| provider_id | TEXT | UNIQUE, NOT NULL, FK → Provider | Connected provider |
| google_calendar_id | TEXT | NOT NULL | Google Calendar ID |
| access_token | TEXT | NOT NULL | OAuth2 access token (encrypted) |
| refresh_token | TEXT | NOT NULL | OAuth2 refresh token (encrypted) |
| token_expires_at | INTEGER | NOT NULL | Token expiry timestamp |
| status | TEXT | NOT NULL | 'connected', 'revoked', 'expired' |
| last_synced_at | INTEGER | NULL | Last sync timestamp |

### Notification

Represents a sent or pending notification.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| appointment_id | TEXT | NOT NULL, FK → Appointment | Related appointment |
| channel | TEXT | NOT NULL | 'telegram' |
| type | TEXT | NOT NULL | 'confirmation', 'reminder', 'update', 'cancellation' |
| status | TEXT | NOT NULL | 'pending', 'sent', 'failed' |
| sent_at | INTEGER | NULL | Sent timestamp |
| created_at | INTEGER | NOT NULL | Unix timestamp |

## Relationships

```
Provider 1──* Service
Provider 1──* Availability Window
Provider 1──* Blocked Date
Provider 1──* Appointment
Provider 1──1 Calendar Connection
Service 1──* Appointment
Appointment 1──* Notification
```

## Indexes

- `idx_appointment_provider_time` ON Appointment(provider_id, start_time)
- `idx_appointment_customer` ON Appointment(customer_telegram_id)
- `idx_availability_provider` ON Availability Window(provider_id, day_of_week)
- `idx_blocked_date_provider` ON Blocked Date(provider_id, date)
