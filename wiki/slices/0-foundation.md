# Slice 0 — Foundation

**Status:** IN PROGRESS (started 2026-05-24)
**Ships:** Auth + Audit + Approvals primitive + Event bus + DB + Docker Compose + CI/CD
**Demo at end:** _none — infrastructure only._ Slice 1 demos the first payslip.

This is the contract for Slice 0. Per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md) discipline rule #2, this README ships **before** the code does. If a thing is not listed here, it is not in Slice 0.

## What Slice 0 buys us

Slice 0 ships zero user-visible features. What it ships is the four primitives every later slice depends on:

1. **Identity** — we can identify *who* did *what*.
2. **Audit** — every state change is recorded immutably.
3. **Approvals** — any module can request a human decision and get a signed answer back.
4. **Events** — modules talk to each other without compile-time coupling.

Plus the boring-but-load-bearing scaffolding (Postgres, Docker Compose, Drizzle, CI) that holds it all together.

When Slice 0 is done, Slice 1's HR module imports `auth.requireUser()`, calls `audit.record()` on every employee mutation, raises `approvals.request()` for any sensitive change, and publishes `employee.hired` on the event bus — without writing any of that infrastructure itself.

## Components

### 1. Repo skeleton
- **Runtime:** Node 20 LTS (image: `node:20-alpine`).
- **Framework:** Next.js 15 (App Router) + TypeScript.
- **Package manager:** pnpm.
- **ORM:** Drizzle + `drizzle-kit` for migrations.
- **Test runner:** Vitest.
- **Lint/format:** ESLint + Prettier.
- **Folder layout (per [AGENTS.md](../../AGENTS.md)):**
  ```
  app/                Next.js routes (App Router)
  core/               loader, shared contracts/types
  modules/
    auth/             session auth (public API: requireUser, login, logout)
    audit/            append-only audit.record
    approvals/        generic approvals.request / approvals.decide
    events/           events.publish / events.subscribe
  directives/         SOPs (existing)
  drizzle/            migrations
  ```

### 2. Docker Compose
- Single `docker-compose.yml`.
- Services: `postgres` (`postgres:16-alpine`), `app` (Next.js).
- Caddy added later (prod profile) — not Slice 0.
- `docker compose up` boots the full local stack on Mac + Linux. Windows verified the first time we need it.
- Same compose file local + prod per [ADR 0008](../decisions/0008-dev-environment.md), differentiated by profile/env.

### 3. modules/auth — session auth
- **Public API** (`modules/auth/index.ts`):
  - `auth.login(email, password) → Session`
  - `auth.logout(sessionId) → void`
  - `auth.requireUser(req) → User` _(throws if unauthenticated)_
- **Password hashing:** argon2id (OWASP current recommendation).
- **Sessions:** opaque random tokens, stored in `sessions` table, set as `HttpOnly; Secure; SameSite=Lax` cookie. Revocable instantly by deleting the row.
- **Bootstrap:** on first migration, if `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` env vars are set, seed one super-admin. Idempotent.
- **Routes:** `POST /api/auth/login`, `POST /api/auth/logout`. No signup route in Slice 0.

### 4. modules/audit — immutable audit log
- **Public API** (`modules/audit/index.ts`):
  - `audit.record({ actor, action, target, payload }) → void`
- **Table:** `audit_log` — `id`, `actor_user_id`, `action` (string, e.g. `employee.update`), `target_kind`, `target_id`, `payload` (JSONB), `created_at`.
- **Immutability:** enforced by a DB trigger that rejects UPDATE and DELETE on the table. Append-only at the storage layer, not just the application layer.

### 5. modules/approvals — generic approvals primitive
- **Public API** (`modules/approvals/index.ts`):
  - `approvals.request({ kind, payload, approvers, rule }) → ApprovalRequest`
  - `approvals.decide(requestId, approverId, decision, reason) → ApprovalRequest`
  - `approvals.status(requestId) → ApprovalRequest`
- **Rules supported in Slice 0:** `single` (one approver decides). `all_of` and `any_of` have schema slots but rule-engine logic is deferred until a slice needs them.
- **Tables:** `approval_requests`, `approval_steps`, `approval_decisions`.
- **Every state change emits** `approvals.requested`, `approvals.decided` on the event bus and writes an `audit.record`.

### 6. modules/events — in-process pub/sub + persistence
- **Public API** (`modules/events/index.ts`):
  - `events.publish(topic, payload) → void`
  - `events.subscribe(topic, handler) → unsubscribe`
- **Implementation:** typed topic registry wrapping Node's `EventEmitter`. Every publish also inserts into `event_log` (id, topic, payload, published_at).
- **Why in-process for Slice 0:** simplest thing that works. Persistence is in place so we can upgrade to Postgres LISTEN/NOTIFY or an external broker later without changing the public API.

### 7. CI/CD
- **`.github/workflows/ci.yml`** runs on push to any branch and on PRs to `main`:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm typecheck`
  3. `pnpm lint`
  4. `pnpm test` (Vitest) — Postgres service container provided to the job for integration tests
  5. `pnpm build`
- No auto-deploy. Deployment is deferred until VPS is provisioned ([ADR 0015](../decisions/0015-vps-deployment.md)).

### 8. Cross-cutting
- **`.env.example`** updated to list every var Slice 0 actually consumes (no speculative vars).
- **`core/loader.ts`** validates that each module's declared dependencies (env vars + other modules) are present at boot. Fail fast and loud per [AGENTS.md](../../AGENTS.md) modular construction rule 2.
- **Per-module README** in every `modules/*/README.md`: Purpose / Public API / Dependencies / Known failure modes.
- **`directives/slice-0-bootstrap.md`** captures the SOP for standing up a fresh dev environment.

## Cross-module contracts

| Caller | Calls | Notes |
|---|---|---|
| any module | `audit.record(...)` | required for every state change |
| any module | `approvals.request(...)` | when an action needs human sign-off |
| any module | `events.publish(topic, payload)` | when other modules may want to react |
| `approvals` | `audit.record`, `events.publish` | approvals decisions are audited + broadcast |
| `auth` | `audit.record` | logins, logouts, failed attempts |
| Next.js routes | `auth.requireUser(req)` | guards every authed route |

No module imports another module's internals. Every import is from the module's `index.ts` (its public surface), per [AGENTS.md](../../AGENTS.md) modular construction rule 4.

## Done criteria

Slice 0 is done when **all** of the following are true:

1. `git clone` → `cp .env.example .env` → fill in `DATABASE_URL`, `SESSION_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` → `docker compose up` → app at `http://localhost:3000`.
2. Super-admin can log in at `/login` (or via `POST /api/auth/login`) and receives a session cookie.
3. Calling `audit.record({...})` from a test inserts a row in `audit_log`; subsequent UPDATE/DELETE against that row is rejected by the DB.
4. Calling `approvals.request({...})` then `approvals.decide(...)` round-trips: status transitions correctly, `audit_log` rows are written, `approvals.requested` and `approvals.decided` events appear in `event_log`.
5. A test subscriber to `events.subscribe('x.y', ...)` receives a payload published with `events.publish('x.y', ...)`, AND the publish lands in `event_log`.
6. `core/loader.ts` fails boot with a clear message if a required env var is missing.
7. Each module has a `README.md` (Purpose / Public API / Dependencies / Known failure modes) and at least one smoke test.
8. CI is green on `main`.
9. Verified on Mac and Linux. Windows deferred.

If any of the above is not true, Slice 0 is not done.

## Discipline rules baked in (per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md))

- Slice 1 cannot break Slice 0's primitives — Slice 1's test suite re-runs Slice 0's smoke tests as a regression gate.
- This README precedes the code. If implementation discovers a gap, this README is updated **before** the implementation diverges.
- Slice 0 ends when the done criteria pass end-to-end, not when the code "looks done."

## Out of scope (do not creep)

- No user signup UI.
- No password reset flow.
- No role/permission system (just "super-admin exists"). RBAC arrives when a slice needs it.
- No 2FA.
- No external email (Resend wired in Slice 1 when there's a real notification to send).
- No file uploads / R2.
- No Caddy / production reverse proxy.
- No deployment automation.
- No multi-approver rule engine (schema yes; engine no).
- No Postgres LISTEN/NOTIFY or external broker (in-process bus only).
- No Sentry yet (wire in Slice 1 alongside the first real user surface).
