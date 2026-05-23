# Architecture & Dependency Audit — TAOLINK

**Auditor:** independent code review
**Date:** 2026-05-21
**Scope:** database choice, scale claim (10k employees), 3rd-party library choices
**Evidence base:** live code in `src/`, [`package.json`](../../package.json), [`AUDIT.md`](../../AUDIT.md), [`TAOLINK-HRIS-CLIENT-AUDIT.md`](../../TAOLINK-HRIS-CLIENT-AUDIT.md), 23 applied migrations, Lucia upstream docs verified via Context7.

---

## 1. Database choice: MySQL vs Postgres

**Verdict: Stay with MySQL. Switching now would be expensive and produce ~no business value.**

For this workload — Philippine HRIS / payroll, OLTP-heavy, ~10k employees, twice-monthly batch — MySQL 8 and Postgres are functionally interchangeable. The often-cited Postgres advantages don't materially apply here:

| Concern | Reality for TAOLINK |
|---|---|
| **Write throughput during payroll** | Bottleneck is computation + chunked 200-row transactions ([`service.ts:252-287`](../../src/modules/payroll/service.ts)), not the DB engine. MySQL InnoDB handles this trivially. |
| **Complex reporting** | Reports are aggregations over a single pay run (~10k rows). Both engines are fine. No window-function-heavy analytics, no recursive CTEs in use. |
| **JSON columns** | `bg_jobs.payload` is the only material JSON use; MySQL's JSON type is sufficient and indexed where needed. |
| **Encryption / AES-256-GCM at rest** | Done at app layer ([encryption module]); engine-agnostic. |
| **Backup story** | Standard `mysqldump` + binlog on the VPS works. Not a Postgres-only capability. |
| **Ops cost** | Postgres on a single VPS is no cheaper. Migration cost is non-trivial: 23 applied migrations, ~45 tables, Drizzle's `mysqlTable`/`mysqlEnum` everywhere — every schema file would need rewriting, plus all `tx.execute(sql\`...\`)` raw SQL like the `FOR UPDATE SKIP LOCKED` in [`workers/index.ts:60-84`](../../src/workers/index.ts) which is identical syntax in Postgres but still needs revalidation. |

What MySQL gives up that Postgres would do better here: nothing material at this scale. If this product grew into multi-tenant SaaS with heavy reporting and 100+ companies, Postgres's `tsvector`, partial indexes, and `LISTEN/NOTIFY` would start to matter. Not today.

**Honest counterpoint:** Postgres has better default behavior on a few edge cases (strict mode, transactional DDL, no silent truncation). The team should verify MySQL is running with `sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE'`. If it isn't, fix that — it's a 30-second config change worth more than any engine swap.

**MAMP separately:** Fine for solo local dev. The moment a second developer joins or you want CI, replace MAMP with `docker-compose up mysql` using the same MySQL major version as prod. MAMP is GUI-friendly but it's a per-machine pet — no committable config, no parity with the VPS, no CI reuse. A 20-line `docker-compose.yml` shipped in the repo would eliminate "works on my MAMP" drift.

---

## 2. Can it really handle 10,000 employees?

**Verdict: Plausibly yes for payroll math; conditionally yes for attendance & selfies; weakest link is filesystem-bound selfie storage.**

### Payroll run — solid

The batch design in [`src/modules/payroll/service.ts`](../../src/modules/payroll/service.ts) is genuinely well-built:

- **All compliance data + attendance + loans pre-fetched in 4 bulk queries before the loop** (lines 92–199). No N+1.
- **Pure computation phase first, then chunked writes** of 200 employees per transaction (line 74, 252–287). This isolates a corrupt row to its 200-row batch rather than aborting the whole run.
- **Per-employee try/catch** (lines 231–250) — a single bad record can't fail the run.
- **`SELECT FOR UPDATE SKIP LOCKED`** for job claiming ([`workers/index.ts:60-84`](../../src/workers/index.ts)) — multiple worker processes are safe.
- **Hard 10-minute timeout** in [`payroll-worker.ts`](../../src/workers/payroll-worker.ts).

Realistic wall-clock estimate for 10k: pre-fetches dominate the first ~10–30 seconds, then 50 transactions × ~1–3 sec each ≈ 1–3 minutes on a healthy MySQL on a real VPS. Background job, so HTTP timeout is irrelevant. **This part of the claim is real, not aspirational.**

### Attendance — solid in design, scary in storage

Chunked at 500 rows in [`attendance-worker.ts`](../../src/workers/attendance-worker.ts), with hireDate-eligibility filtering and `clearPendingAbsentForDate` to keep idempotency. Two punches/day × 10k = 20k raw log rows/day → 7.3M rows/year. Indexed on `(employee_id, log_timestamp)` ([`schema.ts:77`](../../src/modules/attendance/schema.ts)). Fine.

**The real risk is the selfies.** [`api/clock/route.ts:167`](../../src/app/api/clock/route.ts) writes selfies to local disk under `public/uploads/`. At 10k employees × 2 punches × ~200 KB avg JPEG ≈ **4 GB/day, ~120 GB/month, ~1.4 TB/year**. On a single VPS this becomes:
- A backup problem (rsync of growing TB is slow)
- A disk-fill outage waiting to happen
- A single point of failure (no replication)
- An i/o contention source against MySQL on the same disk

For 10k scale this **must** move to S3/B2/R2 before go-live with a real client. The client audit already flags this as known tech debt ([§5.6](../../TAOLINK-HRIS-CLIENT-AUDIT.md)).

### Background worker — custom is fine, but stripped-down

Custom DB-backed queue ([`lib/job-queue.ts`](../../src/lib/job-queue.ts) + [`workers/index.ts`](../../src/workers/index.ts)) has retry (3 attempts, `attempt_count`), stale-job recovery, and a graceful failure path. What it does **not** have:
- Dead letter queue (failed jobs sit in `bg_jobs` with `status='FAILED'` forever — fine but unaudited)
- Priorities or concurrency limits per job type
- Backpressure / queue depth metrics
- Idempotency keys (a duplicate enqueue of the same `payRunId` is guarded by app code, not the queue itself)

For HRIS workload (a handful of jobs/day) the custom queue is honestly correct — BullMQ + Redis would be over-engineering and add an ops dependency for marginal gain.

### Indexes — covers the hot paths

Verified in [migration 0010](../../src/db/migrations/0010_missing_indexes.sql), [0015](../../src/db/migrations/0015_audit_index_payrun_unique.sql), [0019](../../src/db/migrations/0019_missing_indexes.sql): `ledger_employee_idx`, `loan_emp_status_idx`, `auth_session_user_idx`, `rawlog_employee_idx`, compound `(employee_id, log_timestamp)`. Reasonable coverage for hot queries.

### PDF generation — viable but unoptimized

[`api/payslips/[id]/pdf/route.ts`](../../src/app/api/payslips/[id]/pdf/route.ts) generates payslips on-demand, in-memory, per HTTP request. No caching. **20k payslips/month at ~100ms each = 2000 sec/month of CPU** — fine if employees download spread over a week, painful if HR triggers a "bulk download all payslips" feature (which the gap list says is wanted). When bulk distribution lands, PDFs should be generated once in the background and cached to disk or object storage.

### Sessions / auth load — Lucia DB lookups

`auth_sessions` is indexed (`auth_session_user_idx`, [migration 0019](../../src/db/migrations/0019_missing_indexes.sql)) and PK on `id`. Every authenticated request does a single PK lookup on a varchar(128) — that's ~sub-millisecond at 10k scale. Sessions table will grow at ~10k rows × session count, but Lucia doesn't auto-purge expired rows. Add a daily cleanup cron deleting `expires_at < now()`. Otherwise this scales fine.

### Verdict on the 10k claim

**Realistic for payroll math and attendance math. Conditionally realistic for attendance media (selfies must move off local disk). Weakest point is observability — you won't *know* it's failing at 10k until users tell you, because there's no Sentry / APM / queue-depth metric in place.**

---

## 3. Third-party library audit

| Library | Verdict | Notes |
|---|---|---|
| `next@16.1.6` | ✅ Solid | Current major. App Router + Server Actions is the right modern Next pattern. |
| `react@19.2.3`, `react-dom@19.2.3` | ✅ Solid | Latest stable, matches Next 16. |
| `drizzle-orm@0.45.1` | ✅ Solid | Best-in-class TS ORM for this use case. Type-safe, no runtime overhead, raw SQL escape hatch used appropriately. |
| `drizzle-kit@0.31.9` | ✅ Solid | Migration tooling that actually works. 23 clean migrations is evidence. |
| `mysql2@3.19.1` | ✅ Solid | The standard. Promise-based, prepared statements. No reason to swap. |
| **`lucia@3.2.2`** | ❌ **Should reconsider** | **Lucia v3 is officially deprecated.** Upstream confirms: *"Lucia v3 has been deprecated. Lucia is now a learning resource for implementing sessions and more."* The maintainer (pilcrowOnPaper) sunset the library and published an "auth from scratch" guide using `arctic` + `oslo` directly. Still works today; receives no fixes. **This is the single largest architectural risk in the dependency tree.** See §5. |
| `@lucia-auth/adapter-drizzle@1.1.0`, `@lucia-auth/adapter-mysql@3.0.2` | ❌ Should reconsider | Same fate as Lucia — these adapters are end-of-life. After migration they get removed. |
| `arctic@3.7.0` | ✅ Solid | Same author as Lucia, **actively maintained**. The recommended path forward for OAuth. Not currently used in the codebase for OAuth flows (no Google/SSO yet), but pre-installed — good. |
| `oslo@1.2.1` | ✅ Solid | Same author, actively maintained. Provides crypto primitives (TOTP, password hashing, session token generation) that the "Lucia next" pattern is built on. Already a dependency — minimal extra surface to migrate. |
| `nodemailer@8.0.4` | ✅ Solid | Boring, works. Workflow triggers are still not wired ([client audit §5.1](../../TAOLINK-HRIS-CLIENT-AUDIT.md)) but the lib choice is fine. |
| `pdfkit@0.18.0` | ⚠️ Concern | Functional but low-level (you draw every line manually). Acceptable for fixed government forms (BIR 2316). For payslips, a template-based lib (`@react-pdf/renderer` or `puppeteer` + HTML) would be far easier to iterate on as designs change. Not urgent. |
| `recharts@3.8.1` | ✅ Solid | Standard charting for React. Major version current. |
| `date-fns@4.1.0` + `date-fns-tz@3.2.0` | ✅ Solid | The right choice for Asia/Manila handling — verified used consistently across payroll, attendance, leaves. Better than `moment` (deprecated) or `dayjs` (lighter but TZ support thinner). |
| `zod@4.3.6` | ✅ Solid | The standard. Used at every form boundary. |
| `uuid@13.0.0` | ✅ Solid | Boring, correct. |
| `lucide-react@0.577.0` | ✅ Solid | Tree-shakeable icon set; nothing to worry about. |
| `tailwindcss@4` + `@tailwindcss/postcss@4` | ✅ Solid | Tailwind v4 is the current stable major. Bold to be on v4 already (early adopter), but no migration risk now that it's GA. |
| `qrcode.react@4.2.0` | ✅ Solid | Used for the geofence/clock-in QR. Fine. |
| `vitest@4.1.0` | ✅ Solid | Right unit test runner for a Vite/Next/TS project. |
| `@playwright/test@1.58.2` | ✅ Solid | Right e2e tool. |
| `clsx@2.1.1`, `tailwind-merge@3.5.0` | ✅ Solid | The pair everyone uses with Tailwind. |
| `dotenv@17.3.1` | ⚠️ Minor | Next.js loads `.env.local` natively; `dotenv` is only needed for the standalone scripts (`drizzle.config.ts`, worker via `tsx --env-file`). It's already being phased out by `--env-file`. Not a problem, just an artifact. |
| `concurrently@9.2.1` | ✅ Solid | Used only by `dev:all` script — fine. |
| `tsx@4.21.0` | ✅ Solid | Used for the worker process in production via PM2. Reasonable, though running TypeScript via `tsx` in prod (vs. pre-compiling the worker to JS) is a minor performance and footgun cost — `tsx` swallows type errors at runtime. Not critical. |

**Notably absent (and probably should be present):**
- No `@sentry/nextjs` despite Sentry MCP being configured in the workspace — observability gap.
- No `pino` or structured-log shipper — `console.log` JSON is the entire logging story ([`logger.ts`](../../src/lib/logger.ts)).
- No `argon2` / `@node-rs/argon2` visible in `package.json` despite the [client audit](../../TAOLINK-HRIS-CLIENT-AUDIT.md#2-tech-foundation) claiming Argon2id PIN hashing. Worth verifying — `oslo` provides Argon2id, so it's probably wired through that, but the package.json doesn't make it obvious.

---

## 4. Other findings

- **No CI configuration.** No `.github/workflows/`, no `.gitlab-ci.yml`. `npm test` and `npm run lint` exist but nothing runs them automatically. Pre-launch must-have.
- **No Dockerfile / docker-compose.** Deploy is hand-rolled PM2 via [`ecosystem.config.js`](../../ecosystem.config.js) and a `deploy.sh`. Works, but rebuilding the VPS from scratch is a manual recipe. A Dockerfile + compose would be ~50 lines and dramatically reduce bus-factor risk.
- **No observability layer.** No Sentry, no metrics endpoint, no health check beyond "is PM2 running". For an HRIS handling real money, this is a noticeable gap. PM2 logs alone won't tell you the payroll job ran 4× slower last night.
- **`payroll_central_db` fossil.** The database name from the predecessor project is still embedded as the conventional DB name. Cosmetic but worth renaming on next deploy / next env (and it's a confusing surprise for any new engineer).
- **Test coverage.** Vitest + Playwright are wired but the volume of tests is unverified by this audit — given the absence of CI, even existing tests are not gating anything.
- **`logger.ts` is minimal** — just `console.log(JSON.stringify(...))`. Fine if shipped to a real log aggregator; useless if those logs only live on the VPS until PM2 rotates them out.
- **`bg_jobs` has no archival/cleanup.** Old COMPLETED and FAILED jobs accumulate indefinitely. Not a scale problem at HRIS volumes but housekeeping is missing.
- **Rate-limit cleanup is opportunistic** — [`rate-limit.ts:19-20`](../../src/lib/rate-limit.ts) only deletes expired rows when a new attempt comes in for any key. A daily cleanup cron is cleaner. Minor.
- **Marketing site is a sibling Next app** under `taolink-website/` with its own PM2 entry. Reasonable separation; worth confirming it doesn't share session cookies with the main app accidentally.

---

## 5. Honest prioritized recommendations

Top 5, in order. Specific and actionable:

### 1. Plan the Lucia v3 migration **now**, execute over the next 2–4 weeks.
Lucia v3 is deprecated upstream and will receive no fixes. The replacement is **not** another library — it's hand-rolled session management using `oslo` (already installed) for token generation/hashing and `arctic` (already installed) for OAuth when you add it. The session table schema doesn't change. Concretely:
- Replace `new Lucia(adapter, ...)` in [`src/lib/auth.ts`](../../src/lib/auth.ts) with ~80 lines of session create/validate/invalidate using `oslo/crypto` + direct Drizzle queries against `authSessions`.
- Replace `lucia.createSessionCookie` calls in [`src/modules/auth/actions.ts`](../../src/modules/auth/actions.ts) (5 call sites) with manual `cookies().set(...)`.
- Reference: lucia-auth.com's "session implementation" guide and the official migration note.
- **Effort:** 1–2 days for an engineer who's read the guide. Risk is low because the session table stays identical.
- Do this before you ship to a paying client. A deprecated auth library in a financial system is an audit-finding magnet.

### 2. Move selfies off local disk before 10k go-live.
Pick S3/B2/R2, sign upload URLs in the clock route, store the object key (not the path) in `att_raw_logs.selfie_path`. This unlocks: VPS backup sanity, multi-VPS scaling, CDN delivery of selfies in the admin viewer. Probably 2–3 days of work. Until this is done, the 10k claim has an asterisk.

### 3. Add Sentry + a queue-depth metric.
You have the Sentry MCP set up. Wire `@sentry/nextjs` into the web app and `@sentry/node` into the worker process. Add a single endpoint `/api/_internal/queue-depth` that returns `bg_jobs` PENDING + PROCESSING counts; poll it from an uptime monitor. This is the difference between "we think it scales to 10k" and "we know when it doesn't."

### 4. Add a minimal CI: lint + typecheck + vitest on every PR.
`.github/workflows/ci.yml` of ~30 lines. No tests is bad; tests that no one runs is worse. Add MySQL service container so DB-touching tests actually run.

### 5. Replace MAMP with docker-compose for local dev; leave MySQL in place for prod.
A 20-line `docker-compose.yml` (mysql:8.0 + a volume) gives every dev the same DB version as prod, makes CI trivial (point CI at the same compose file), and ends "works on my MAMP" drift. Keep MySQL — don't migrate to Postgres. The cost/benefit is wrong.

**Things I deliberately did not recommend:**
- Migrating MySQL → Postgres. The ROI is negative at this scale and stage.
- Replacing the custom worker with BullMQ/Redis. The current design is right-sized for the workload; adding Redis adds an ops failure mode for no measurable win.
- Replacing PDFKit. Annoying to author with, but it works and the forms it generates are stable.
- Adding TypeORM/Prisma. Drizzle is the better fit and it's already in.

---

*Audit grounded in code as of 2026-05-21. Lucia deprecation status verified against upstream lucia-auth/lucia repo via Context7 MCP on the same date. No code was modified.*
