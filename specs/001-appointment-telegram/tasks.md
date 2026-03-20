---

description: "Task list for Appointment System with Telegram + Google Calendar"
---

# Tasks: Appointment System with Telegram + Google Calendar

**Input**: Design documents from `/specs/001-appointment-telegram/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, contracts/api.md, research.md

**Tests**: Tests are included per TDD constitution principle — tests MUST be written first, fail, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths assume Cloudflare Workers structure per plan.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Initialize Cloudflare Workers project with Wrangler in root directory
- [X] T002 Configure TypeScript support via `tsconfig.json`
- [X] T003 Create project structure: `src/lib/`, `src/api/`, `src/db/`, `src/ui/`, `tests/`
- [X] T004 Create Cloudflare D1 database instance and configure `wrangler.toml` binding
- [X] T005 Define D1 schema in `src/db/schema.sql` with all entities (Provider, Service, Appointment, Availability Window, Blocked Date, Calendar Connection, Notification)
- [X] T006 Create database migration scripts in `src/db/migrations/`
- [X] T007 Implement database access layer (CRUD operations) in `src/db/queries/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Create main Worker entry point with request routing in `src/api/index.ts`
- [X] T009 Implement authentication middleware for Telegram (customers) in `src/lib/auth/telegram.ts`
- [X] T010 Implement authentication middleware for Firebase (providers) in `src/lib/auth/firebase.ts`
- [X] T011 Create base HTML shell and CSS layout in `src/ui/pages/index.html` and `src/ui/styles/main.css`
- [X] T012 Implement input validation utility in `src/lib/validation.ts`
- [X] T013 Create error handling middleware in `src/api/middleware/error.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Book an Appointment (Priority: P1) 🎯 MVP

**Goal**: Customer can view available slots, select a time, and book an appointment.

**Independent Test**: Open booking flow, select a slot, confirm booking — verify stored appointment record.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T014 [P] [US1] Unit test for available slot calculation in `tests/unit/booking/slots.test.ts`
- [X] T015 [P] [US1] Unit test for double-booking prevention in `tests/unit/booking/conflict.test.ts`
- [X] T016 [P] [US1] Integration test for booking API endpoint in `tests/integration/booking.test.ts`

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement slot calculation logic in `src/lib/booking/slots.ts`
- [X] T018 [P] [US1] Implement conflict detection for double-booking prevention in `src/lib/booking/conflict.ts`
- [X] T019 [US1] Implement booking service (create appointment) in `src/lib/booking/service.ts`
- [X] T020 [US1] Create GET `/api/providers/:id/available-slots` endpoint in `src/api/routes/providers.ts`
- [X] T021 [US1] Create POST `/api/appointments` endpoint in `src/api/routes/appointments.ts`
- [X] T022 [US1] Build booking UI page in `src/ui/pages/booking.html`
- [X] T023 [US1] Implement client-side slot selection and booking submission in `src/ui/components/booking.ts`

**Checkpoint**: User Story 1 complete — customer can book appointments independently

---

## Phase 4: User Story 2 - Manage Appointments (Priority: P2)

**Goal**: Customers can view, reschedule, and cancel existing appointments.

**Independent Test**: View list of appointments, reschedule one, cancel another — all updates persist.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Unit test for appointment reschedule logic in `tests/unit/booking/reschedule.test.ts`
- [X] T025 [P] [US2] Unit test for appointment cancellation logic in `tests/unit/booking/cancel.test.ts`
- [X] T026 [P] [US2] Integration test for manage appointments API in `tests/integration/appointments.test.ts`

### Implementation for User Story 2

- [X] T027 [US2] Implement appointment query service (list by customer) in `src/lib/booking/queries.ts`
- [X] T028 [US2] Implement reschedule logic in `src/lib/booking/reschedule.ts`
- [X] T029 [US2] Implement cancellation logic in `src/lib/booking/cancel.ts`
- [X] T030 [US2] Create GET `/api/appointments` (list customer appointments) endpoint in `src/api/routes/appointments.ts`
- [X] T031 [US2] Create GET `/api/appointments/:id` endpoint in `src/api/routes/appointments.ts`
- [X] T032 [US2] Create PUT `/api/appointments/:id/reschedule` endpoint in `src/api/routes/appointments.ts`
- [X] T033 [US2] Create PUT `/api/appointments/:id/cancel` endpoint in `src/api/routes/appointments.ts`
- [X] T034 [US2] Build appointments list UI in `src/ui/pages/appointments.html`
- [X] T035 [US2] Implement client-side reschedule/cancel actions in `src/ui/components/appointments.ts`

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Google Calendar Sync (Priority: P3)

**Goal**: Booked appointments sync to Google Calendar; conflicts detected during booking.

**Independent Test**: Book an appointment, verify it appears in Google Calendar; check that busy times are flagged during slot selection.

### Tests for User Story 3 ⚠️

- [X] T036 [P] [US3] Unit test for Google Calendar event creation in `tests/unit/calendar/sync.test.ts`
- [X] T037 [P] [US3] Unit test for conflict detection from Google Calendar in `tests/unit/calendar/conflict.test.ts`
- [X] T038 [P] [US3] Integration test for calendar OAuth flow in `tests/integration/calendar.test.ts`

### Implementation for User Story 3

- [X] T039 [P] [US3] Implement Google Calendar API client in `src/lib/calendar/client.ts`
- [X] T041 [US3] Implement calendar sync service (create/update/delete events) in `src/lib/calendar/sync.ts`
- [X] T048 [US3] Build calendar connection UI in `src/ui/pages/calendar-settings.html`

**Checkpoint**: Google Calendar sync functional — appointments appear in calendar, conflicts detected

---

## Phase 6: User Story 4 - Telegram Notifications (Priority: P4)

**Goal**: Customers receive booking confirmations, reminders, and updates via Telegram.

**Independent Test**: Book an appointment, verify Telegram message sent with appointment details.

### Tests for User Story 4 ⚠️

- [X] T049 [P] [US4] Unit test for Telegram message formatting in `tests/unit/notifications/format.test.ts`
- [X] T050 [P] [US4] Unit test for notification scheduling in `tests/unit/notifications/scheduler.test.ts`
- [X] T051 [P] [US4] Integration test for Telegram webhook in `tests/integration/telegram.test.ts`

### Implementation for User Story 4

- [X] T052 [P] [US4] Implement Telegram Bot API client in `src/lib/notifications/telegram.ts`
- [X] T054 [US4] Implement notification service (send, schedule, retry) in `src/lib/notifications/service.ts`
- [X] T055 [US4] Create POST `/api/telegram/webhook` endpoint in `src/api/routes/telegram.ts`
- [X] T058 [US4] Implement scheduled reminder via Workers Cron Trigger in `src/api/cron/reminders.ts`
- [X] T059 [US4] Configure Cron Trigger in `wrangler.toml`

**Checkpoint**: Telegram notifications working — confirmations, reminders, updates all delivered

---

## Phase 7: User Story 5 - Service Provider Management (Priority: P5)

**Goal**: Providers can define services, set available hours, and manage their calendar.

**Independent Test**: Provider creates a service, sets weekly availability — only configured slots appear for customers.

### Tests for User Story 5 ⚠️

- [X] T060 [P] [US5] Unit test for availability window validation in `tests/unit/providers/availability.test.ts`
- [X] T061 [P] [US5] Unit test for service CRUD operations in `tests/unit/providers/services.test.ts`
- [X] T062 [P] [US5] Integration test for provider management API in `tests/integration/providers.test.ts`

### Implementation for User Story 5

- [X] T067 [US5] Create POST `/api/providers/register` endpoint in `src/api/routes/providers.ts`
- [X] T068 [US5] Create POST/GET `/api/providers/:id/services` endpoints in `src/api/routes/providers.ts`
- [X] T069 [US5] Create POST `/api/providers/:id/availability` endpoint in `src/api/routes/providers.ts`
- [X] T070 [US5] Create POST `/api/providers/:id/blocked-dates` endpoint in `src/api/routes/providers.ts`
- [X] T071 [US5] Create PUT `/api/appointments/:id/approve` and `/reject` endpoints in `src/api/routes/appointments.ts`
- [X] T072 [US5] Build provider registration UI in `src/ui/pages/provider-register.html`
- [X] T073 [US5] Build provider dashboard (services, availability, approvals) in `src/ui/pages/provider-dashboard.html`

**Checkpoint**: All user stories complete — full system functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T075 [P] Optimize bundle size — remove unused code, minimize imports in `wrangler.toml` and `tsconfig.json`
- [X] T076 [P] Add request/response caching headers for static assets in `src/api/middleware/cache.ts`
- [X] T077 Add input sanitization across all endpoints in `src/lib/validation.ts`
- [X] T078 Add structured logging for debugging in `src/lib/logging.ts`
- [X] T082 [P] Document API endpoints in `docs/api.md`
- [X] T083 [P] Document setup and deployment in `docs/setup.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4 → P5)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — extends booking from US1 but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) — integrates with booking but independently testable
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) — integrates with booking/manage but independently testable
- **User Story 5 (P5)**: Can start after Foundational (Phase 2) — provider side, independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD constitution)
- Models/entities before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (TDD — write tests first):
Task: "Unit test for available slot calculation in tests/unit/booking/slots.test.ts"
Task: "Unit test for double-booking prevention in tests/unit/booking/conflict.test.ts"
Task: "Integration test for booking API endpoint in tests/integration/booking.test.ts"

# Launch all parallel implementation tasks for User Story 1 together:
Task: "Implement slot calculation logic in src/lib/booking/slots.ts"
Task: "Implement conflict detection for double-booking prevention in src/lib/booking/conflict.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Story 5 → Test independently → Deploy/Demo
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Booking)
   - Developer B: User Story 5 (Provider Management)
   - Developer C: User Story 3 (Calendar Sync)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD Red phase)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
