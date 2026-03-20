# Setup and Deployment Guide

## Prerequisites

- Node.js 18+
- Cloudflare account with Workers and D1 access
- Google Cloud project with Calendar API enabled
- Telegram Bot token (from @BotFather)

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 3. Login to Cloudflare

```bash
wrangler login
```

### 4. Create D1 Database

```bash
wrangler d1 create appoint-db
```

Copy the database ID from the output.

### 5. Configure Environment

Update `wrangler.toml`:

```toml
name = "appoint"
main = "src/api/index.ts"
compatibility_date = "2026-03-20"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "appoint-db"
database_id = "YOUR_DATABASE_ID"

[vars]
TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"
FIREBASE_API_KEY = "YOUR_FIREBASE_WEB_API_KEY"
FIREBASE_PROJECT_ID = "YOUR_FIREBASE_PROJECT_ID"
GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET = "YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_REDIRECT_URI = "https://your-app.workers.dev/api/providers/callback"
```

### 6. Initialize Database Schema

```bash
wrangler d1 execute appoint-db --file=src/db/schema.sql
```

### 7. Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:8787`.

## Testing

### Run Unit Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run E2E Tests

```bash
npm run test:e2e
```

## Deployment

### 1. Build and Deploy

```bash
npm run deploy
```

### 2. Set Telegram Webhook

After deployment, set your Telegram bot webhook:

```bash
curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.workers.dev/api/telegram/webhook"}'
```

### 3. Verify Deployment

Check that the service is running:

```bash
curl https://your-app.workers.dev/
```

## Configuration

### Telegram Bot Setup

1. Create a bot with @BotFather
2. Get your bot token
3. Set the webhook URL to your deployed Worker

### Google Calendar Setup

1. Create a Google Cloud project
2. Enable Calendar API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URIs
5. Copy Client ID and Client Secret

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token | Yes |
| `FIREBASE_API_KEY` | Firebase Web API Key (from Firebase Console > Project Settings) | Yes |
| `FIREBASE_PROJECT_ID` | Firebase Project ID | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Yes |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | Yes |

## Database Migrations

### Apply Schema

```bash
wrangler d1 execute appoint-db --file=src/db/schema.sql
```

### Run Migrations

```bash
wrangler d1 execute appoint-db --file=src/db/migrations/001_initial.sql
```

## Troubleshooting

### Common Issues

1. **Database not found**: Ensure D1 database is created and ID is correct in `wrangler.toml`
2. **Authentication errors**: Verify Telegram and Firebase tokens
3. **Calendar sync fails**: Check OAuth tokens and refresh tokens
4. **Cron not running**: Verify cron trigger configuration in `wrangler.toml`

### Logs

View Worker logs:

```bash
wrangler tail
```

### Debug Mode

Set `NODE_ENV=development` in `wrangler.toml` for verbose logging.

## Production Checklist

- [ ] All tests passing
- [ ] Database schema applied
- [ ] Environment variables configured
- [ ] Telegram webhook set
- [ ] Google Calendar OAuth configured
- [ ] Cron triggers enabled
- [ ] Error monitoring configured
- [ ] Performance monitoring enabled

## Security Considerations

1. Never commit secrets to version control
2. Use environment variables for sensitive data
3. Implement rate limiting for production
4. Validate all user inputs
5. Sanitize HTML content
6. Use HTTPS only
7. Implement proper CORS policies

## Performance Optimization

1. Use D1 for all database operations
2. Cache static assets
3. Minimize bundle size
4. Use edge computing for low latency
5. Implement request/response caching

## Monitoring

### Health Checks

```bash
curl https://your-app.workers.dev/
```

### Database Queries

Monitor D1 query performance in Cloudflare dashboard.

### Error Tracking

Set up error tracking with services like Sentry or Logflare.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Cloudflare Workers documentation
3. Check Telegram Bot API documentation
4. Review Google Calendar API documentation
