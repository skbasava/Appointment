# Implementation Plan: Appointment System with Telegram + Google Calendar

**Branch**: `001-appointment-telegram` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-appointment-telegram/spec.md`

## Summary

Build an appointment booking system where customers can book time slots with doctors/hospitals, with Google Calendar sync and Telegram notifications. The system prioritizes minimalism, performance, and cost efficiency by leveraging Cloudflare-native services.

## Technical Context

**Language/Version**: TypeScript 5.x  
**Primary Dependencies**: None (vanilla implementation — no frameworks)  
**Storage**: Cloudflare D1 (SQLite)  
**Testing**: Vitest (unit/integration) + Playwright (E2E)  
**Target Platform**: Cloudflare Workers (edge runtime)  
**Project Type**: web-service  
**Performance Goals**: <100ms p95 response time, support 1000 concurrent bookings  
**Constraints**: Edge-execution only, no persistent connections, no external storage services  
**Scale/Scope**: 500 providers, 10,000 customers, 5 user stories  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Library-First ✅

- Each feature (booking, calendar sync, notifications, provider management) will be implemented as a standalone module
- Modules will be self-contained with clear interfaces
- Each module will have independent test coverage

### II. Test-First (NON-NEGOTIABLE) ✅

- Tests MUST be written before implementation for every module
- Tests MUST fail (Red) before implementation begins
- Red-Green-Refactor cycle enforced for all development

### Additional Constraints ✅

- Technology choices justified: Cloudflare Workers chosen for edge performance and cost efficiency
- No external dependencies beyond Cloudflare-native services (D1, Workers KV for caching if needed)

**No violations.**

## Project Structure

### Documentation (this feature)

```text
specs/001-appointment-telegram/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── booking/         # Appointment booking logic
│   ├── calendar/        # Google Calendar integration
│   ├── notifications/   # Telegram notification service
│   ├── providers/       # Provider management
│   └── auth/            # Authentication (Telegram + Firebase)
├── api/                 # Request handlers (Cloudflare Workers)
│   ├── routes/
│   └── middleware/
├── db/                  # D1 database queries and schema
│   ├── schema.sql
│   └── queries/
└── ui/                  # Vanilla HTML/CSS/TS frontend
    ├── pages/
    ├── components/
    └── styles/

tests/
├── unit/
├── integration/
└── e2e/
```

**Structure Decision**: Single project with modular `src/lib/` libraries for each domain. The `src/api/` layer handles HTTP routing, `src/db/` manages persistence, and `src/ui/` delivers the frontend. Each library in `src/lib/` is independently testable per Library-First principle.

## Complexity Tracking

> **No violations — section empty.**
