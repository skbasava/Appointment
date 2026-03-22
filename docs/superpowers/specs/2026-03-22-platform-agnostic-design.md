# Platform-Agnostic Architecture Design

**Date:** 2026-03-22
**Status:** Approved
**Goal:** Make `appoint` portable across Cloudflare Workers, Docker/self-hosted, AWS, GCP — without losing Cloudflare support.

## Problem

The application is tightly coupled to Cloudflare components:

- **D1 Database**: All 9 query files use `D1Database` type with `.prepare().bind().run()/first()/all()` API
- **Workers entry point**: `export default { fetch, scheduled }` with `ExecutionContext` and `Env` types
- **Cron triggers**: Cloudflare `ScheduledEvent` for reminder jobs
- **Type imports**: `@cloudflare/workers-types` in `otp.ts`, `patient-auth.ts`
- **Raw queries in routes**: 3 files bypass the query layer with direct `c.env.DB.prepare()` calls

This makes it impossible to deploy anywhere except Cloudflare Workers.

## Solution: Platform Adapter Pattern

Use Drizzle ORM (supports D1, SQLite, Postgres natively) + platform-specific entry points + scheduler adapters. Shared business logic stays platform-agnostic.

## Architecture Overview

```
src/
  api/
    app.ts              ← Shared Hono app factory (all routes)
    index.ts            ← Node.js entry (@hono/node-server)
    worker.ts           ← Cloudflare Workers entry
    middleware/          ← Shared middleware (unchanged)
    routes/              ← Shared routes (use c.get('db'), not env.DB)
    cron/                ← Shared cron logic
  db/
    schema.ts            ← Drizzle schema (shared, all tables)
    client.ts            ← DB client factory
    drivers/
      d1.ts              ← Cloudflare D1 driver
      sqlite.ts          ← better-sqlite3 driver
      postgres.ts        ← pg driver
    queries/             ← Rewritten with Drizzle (shared)
  jobs/
    index.ts             ← Scheduler factory
    reminders.ts         ← Shared reminder logic
    cleanup.ts           ← Shared cleanup logic
    providers/
      cloudflare.ts      ← CF ScheduledEvent provider
      bullmq.ts          ← BullMQ + Redis provider
      node-cron.ts       ← node-cron provider
  config.ts              ← Unified config from env vars
  lib/                   ← Business logic (mostly unchanged)
```

## Section 1: Database Layer

### Schema

Convert `src/db/schema.sql` to Drizzle schema definitions in `src/db/schema.ts`.

Each table becomes a Drizzle `sqliteTable` or `pgTable` definition. Use Drizzle's `drizzle-kit` for migrations.

### Query Layer

Rewrite all 9 files in `src/db/queries/` to use Drizzle query builder.

**Before (D1):**
```ts
export async function getProviderById(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM providers WHERE id = ?').bind(id).first<Provider>();
}
```

**After (Drizzle):**
```ts
export async function getProviderById(db: Database, id: string) {
  return db.select().from(providers).where(eq(providers.id, id)).get();
}
```

`Database` type = `ReturnType<typeof drizzle>` — same API regardless of underlying driver.

### Driver Selection

`src/db/client.ts` exports a factory function:

```ts
export function createDb(driver: 'd1' | 'sqlite' | 'postgres', binding?: D1Database): Database
```

- `driver=d1` → `drizzle(binding)` with D1 driver
- `driver=sqlite` → `drizzle(betterSqlite3('./data/appoint.db'))`
- `driver=postgres` → `drizzle(pg(process.env.DATABASE_URL))`

### Files to Modify

| File | Change |
|------|--------|
| `src/db/schema.sql` | Convert to `src/db/schema.ts` (Drizzle definitions) |
| `src/db/types.ts` | Remove `D1Database` from `Env.DB`, keep data types |
| `src/db/queries/*.ts` (9 files) | Rewrite to Drizzle query builder |
| `src/db/queries/otp.ts` | Remove `import type { D1Database }` |
| `src/db/queries/patient-auth.ts` | Remove `import type { D1Database }` |
| `src/api/routes/appointments.ts` | Remove raw `c.env.DB.prepare()` calls (lines 88, 113, 137) |
| `src/api/cron/reminders.ts` | Remove raw `env.DB.prepare()` call (line 17) |

## Section 2: Entry Points

### Shared App Factory (`src/api/app.ts`)

```ts
export function createApp(db: Database) {
  const app = new Hono();
  app.use('*', injectDb(db));  // DB available via c.get('db')
  // ... register all routes ...
  return app;
}
```

Routes use `c.get('db')` instead of `c.env.DB`. No platform types in route code.

### Node.js Entry (`src/api/index.ts`)

```ts
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createDb } from '../db/client';

const db = createDb(process.env.DB_DRIVER as any);
const app = createApp(db);
serve({ fetch: app.fetch, port: parseInt(process.env.PORT || '3000') });
```

### Cloudflare Entry (`src/api/worker.ts`)

```ts
import { createApp } from './app';
import { createDb } from '../db/client';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const db = createDb('d1', env.DB);
    return createApp(db).fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = createDb('d1', env.DB);
    // delegate to Cloudflare scheduler provider
  }
};
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/api/app.ts` | New — shared app factory |
| `src/api/worker.ts` | New — Cloudflare entry point |
| `src/api/index.ts` | Rewrite — Node.js entry point |
| `src/config.ts` | New — unified config loader |

## Section 3: Scheduling

### Shared Job Logic

`src/jobs/reminders.ts` and `src/jobs/cleanup.ts` contain the actual job logic. They receive a `Database` instance and are platform-agnostic.

### Scheduler Providers

| Provider | Platform | Mechanism |
|----------|----------|-----------|
| `cloudflare.ts` | CF Workers | Uses `scheduled` export |
| `bullmq.ts` | Docker/AWS/GCP | BullMQ recurring jobs + Redis |
| `node-cron.ts` | Lightweight | In-process `node-cron` |

Selection via `SCHEDULER_PROVIDER` env var.

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/jobs/index.ts` | New — scheduler factory |
| `src/jobs/reminders.ts` | New — shared reminder logic (moved from `src/api/cron/`) |
| `src/jobs/cleanup.ts` | New — OTP cleanup logic |
| `src/jobs/providers/cloudflare.ts` | New — CF scheduler adapter |
| `src/jobs/providers/bullmq.ts` | New — BullMQ adapter |
| `src/jobs/providers/node-cron.ts` | New — node-cron adapter |
| `src/api/cron/reminders.ts` | Remove or delegate to `src/jobs/` |

## Section 4: Config & Env

### Unified Config (`src/config.ts`)

```ts
export interface Config {
  db: { driver: 'd1' | 'sqlite' | 'postgres'; url?: string };
  scheduler: 'cloudflare' | 'bullmq' | 'node-cron';
  telegram: { botToken: string };
  whatsapp: { accessToken: string; phoneNumberId: string; verifyToken: string; appSecret?: string };
  google: { clientId: string; clientSecret: string; redirectUri: string };
  otp: { smsProvider: string; whatsappProvider: string; emailProvider: string };
  twilio: { accountSid: string; authToken: string; phoneNumber: string; whatsappNumber: string };
  jwt: { secret: string; secretPrevious?: string; expiry: string };
  firebase: { apiKey: string; projectId: string };
  defaultCountryCode: string;
  enableWhatsappOnboarding: boolean;
  enableTelegramOnboarding: boolean;
  telegramWebhookSecret?: string;
  useTwilioOtp?: boolean;
}

export function loadConfig(): Config  // reads from process.env or CF env
```

Routes and services receive `Config` instead of `Env`. No `D1Database` in the config interface.

## Section 5: Dependencies

### Add

| Package | Purpose |
|---------|---------|
| `drizzle-orm` | Database ORM (shared) |
| `drizzle-kit` | Schema migrations |
| `better-sqlite3` | SQLite driver (Node.js) |
| `@hono/node-server` | Hono Node.js adapter |
| `bullmq` | Job queue (Node.js) |
| `ioredis` | Redis client for BullMQ |
| `dotenv` | Environment variable loading |
| `pg` (optional) | Postgres driver |

### Remove

| Package | Reason |
|---------|--------|
| `@cloudflare/workers-types` | No longer needed in shared code |
| `wrangler` (from devDeps) | Move to optional / CF-specific workspace |

### Keep

| Package | Reason |
|---------|--------|
| `hono` | Already platform-agnostic |
| `qrcode` | No platform dependency |

## Section 6: Deployment Targets

| Platform | DB Driver | Scheduler | Entry Point | Command |
|----------|-----------|-----------|-------------|---------|
| Cloudflare Workers | `d1` | `cloudflare` | `worker.ts` | `wrangler deploy` |
| Docker / self-hosted | `sqlite` or `postgres` | `bullmq` | `index.ts` | `docker compose up` |
| AWS ECS / Lambda | `postgres` | `bullmq` | `index.ts` | Container deploy |
| GCP Cloud Run | `postgres` | `bullmq` | `index.ts` | Container deploy |

### Docker Compose

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [redis]
  worker:
    build: .
    command: node dist/worker.js
    env_file: .env
    depends_on: [redis]
  redis:
    image: redis:7-alpine
    volumes: [redis-data:/data]
  postgres:
    image: postgres:16-alpine
    env_file: .env
    volumes: [pg-data:/var/lib/postgresql/data]
```

### Files to Create

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build |
| `docker-compose.yml` | Local / self-hosted deployment |
| `.dockerignore` | Exclude node_modules, .git, etc. |

## Section 7: Migration Execution Order

Each step is independently testable.

| Step | What | Files |
|------|------|-------|
| 1 | Add dependencies, remove `@cloudflare/workers-types` from shared deps | `package.json` |
| 2 | Create Drizzle schema from existing SQL | `src/db/schema.ts` |
| 3 | Create DB client factory with driver selection | `src/db/client.ts`, `src/db/drivers/*` |
| 4 | Rewrite query layer (9 files) to Drizzle | `src/db/queries/*` |
| 5 | Create unified config | `src/config.ts` |
| 6 | Create shared app factory, refactor routes to use `c.get('db')` | `src/api/app.ts`, all routes |
| 7 | Create platform entry points | `src/api/index.ts`, `src/api/worker.ts` |
| 8 | Create job system with scheduler adapters | `src/jobs/*` |
| 9 | Add Docker setup | `Dockerfile`, `docker-compose.yml` |
| 10 | Update scripts, clean up platform-specific artifacts from shared code | `package.json`, `.gitignore` |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Drizzle D1 driver has API differences from SQLite driver | Test both drivers against same schema; Drizzle abstracts most differences |
| BullMQ requires Redis — adds infrastructure cost | For simple deployments, `node-cron` provider is zero-dependency alternative |
| Query rewrite introduces regressions | Drizzle queries map 1:1 to existing SQL; run existing tests after each step |
| Raw SQL in routes (appointments.ts:88,113,137) needs extraction | Move raw queries into query layer before Drizzle conversion |
