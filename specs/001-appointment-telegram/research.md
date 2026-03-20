# Research: Appointment System with Telegram + Google Calendar

**Feature**: 001-appointment-telegram  
**Date**: 2026-03-20

## Cloudflare Workers Capabilities

### D1 Database (SQLite)

- SQLite-based, supports standard SQL
- Good for relational data (providers, appointments, availability)
- No connection pooling needed — edge-native
- Supports transactions for double-booking prevention

### Workers Runtime

- V8 isolates — fast cold starts (<5ms)
- 128MB memory limit per request
- No persistent connections (use fetch for external APIs)
- Cron Triggers available for scheduled tasks (appointment reminders)

### Limitations

- No file storage (aligns with user requirement — no image uploads)
- 30-second execution limit per request
- No WebSocket support in standard Workers (use Durable Objects if needed later)

## Google Calendar API Integration

### OAuth2 Flow (Provider)

- Providers authorize via Google OAuth2
- Access tokens stored in D1
- Refresh tokens needed for long-lived access
- Calendar events created/updated via REST API

### Calendar Sync Strategy

- On booking: create calendar event via API
- On cancellation: delete calendar event
- Availability check: fetch busy times from Google Calendar API
- Use `freeBusy` query for conflict detection

## Telegram Bot Integration

### Bot API

- Send messages via HTTPS (no persistent connection needed)
- Webhook mode: Telegram sends updates to Workers endpoint
- Polling not feasible in Workers (no background process)

### Notification Flow

- Booking confirmation: immediate send
- Reminders: use Workers Cron Triggers
- Updates/cancellations: immediate send

## Authentication Strategy

### Customers (Telegram)

- Telegram Login Widget or Bot deep link
- Telegram user ID as primary identifier
- No separate account creation needed

### Providers (Firebase)

- Google Firebase Authentication
- Email/password or Google Sign-In
- Firebase Admin SDK validated on server side

**Decision**: Use Firebase Auth for providers, Telegram Bot for customers — no custom auth system needed.
