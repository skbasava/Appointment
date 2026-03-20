# Quickstart: Appointment System with Telegram + Google Calendar

**Feature**: 001-appointment-telegram  
**Date**: 2026-03-20

## Prerequisites

- Cloudflare account with Workers and D1 access
- Google Cloud project with Calendar API enabled
- Telegram Bot token (from @BotFather)
- Node.js 18+ (for local development)

## Setup Steps

### 1. Initialize Cloudflare Workers Project

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create appoint-db
```

### 2. Configure Environment

Create `wrangler.toml`:

```toml
name = "appoint"
main = "src/api/index.ts"
compatibility_date = "2026-03-20"

[[d1_databases]]
binding = "DB"
database_name = "appoint-db"
database_id = "<your-database-id>"

[vars]
TELEGRAM_BOT_TOKEN = "<your-bot-token>"
GOOGLE_CLIENT_ID = "<your-google-client-id>"
GOOGLE_CLIENT_SECRET = "<your-google-client-secret>"
```

### 3. Initialize Database Schema

```bash
wrangler d1 execute appoint-db --file=src/db/schema.sql
```

### 4. Run Locally

```bash
wrangler dev
```

### 5. Deploy

```bash
wrangler deploy
```

## First Test: Provider Registration

1. Navigate to `https://your-app.workers.dev/provider/register`
2. Fill in provider details
3. Verify account creation in D1 database

## First Test: Book an Appointment

1. Provider creates a service and sets availability
2. Customer opens booking page
3. Selects available time slot
4. Confirms booking
5. Verify appointment in database and Google Calendar

## Verification Checklist

- [ ] Provider can register and verify account
- [ ] Provider can connect Google Calendar
- [ ] Provider can set availability windows
- [ ] Customer can view available slots
- [ ] Customer can book an appointment
- [ ] Appointment appears in Google Calendar
- [ ] Telegram confirmation is sent
- [ ] Customer can cancel an appointment
- [ ] Cancellation removes Google Calendar event
