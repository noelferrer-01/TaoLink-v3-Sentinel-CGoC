---
tags: [inventory, features, audit]
last_updated: 2026-05-21
sources: [TAOLINK-HRIS-CLIENT-AUDIT.md]
---

# Feature Inventory

> The canonical "what's built, what's not" page for TAOLINK. Sourced from the [client-facing audit](../../TAOLINK-HRIS-CLIENT-AUDIT.md) (2026-04-27), which verified every claim against the live `main` branch and 23 applied DB migrations.

## At a glance

| Area | Status |
|---|---|
| Payroll engine (math + statutory) | ✅ Production-ready, audited 4× |
| Attendance (clock in/out, GPS, selfie, ZKTeco import) | ✅ Production-ready |
| Employee 201 file management | ✅ Production-ready |
| Leave management | ✅ Production-ready |
| Loan management | ✅ Production-ready |
| Government remittances (SSS, PhilHealth, Pag-IBIG, BIR) | ✅ Computed; BIR 1601-C and 2316 reports generated |
| Employee Self-Service (ESS) portal | ✅ Production-ready |
| 2FA + audit trail + encryption | ✅ Built; 2FA enrollment is opt-in |
| Background job queue (10k-employee scale) | ✅ Built and running |
| Marketing site + lead capture | ✅ Built |
| Mobile app (native iOS/Android) | ❌ Not built — mobile clock works through web |
| Biometric device direct integration | ⚠️ ZKTeco CSV import only; no live device sync |
| Performance management (KPIs, reviews, 360°) | ❌ Not built |
| Recruitment / ATS | ❌ Not built |
| Training / LMS | ❌ Not built |

Source: [TAOLINK-HRIS-CLIENT-AUDIT.md §1](../../TAOLINK-HRIS-CLIENT-AUDIT.md).

---

## Production-ready features

Each of these is verifiable in code and migrations as of 2026-04-27.

- **Payroll engine** — Computes basic pay, absences, late/undertime, OT (regular, holiday, special non-working, rest day), night shift differential, SSS / PhilHealth / Pag-IBIG, withholding tax (TRAIN 2023 brackets), and 13th month. Zero N+1 queries; chunked inserts; runs 10k-employee pay runs in a background job. ([§3.5](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Attendance** — Manual entry, ZKTeco biometric CSV import, generic CSV import, mobile clock with GPS, QR-based geofencing, selfie capture on every punch, shifts with grace period, daily attendance review with missing-punch filter. ([§3.2](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Employee 201 file management** — Full personal / address / employment / statutory / bank record, bulk CSV import with FK validation, salary history (FK RESTRICT — never silently deleted), deactivation / termination workflow, shift assignment per employee. ([§3.1](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Leave management** — Application + approval workflow, auto-calc of paid/unpaid into payroll, annual credit auto-allocation, configurable leave types, FK-protected history. ([§3.3](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Loan management** — SSS, Pag-IBIG, and Cash Advance loans; per-period FIFO amortization; ₱0 net pay floor; void/reverse safely reverses loan deductions. ([§3.4](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Government remittances (computed)** — SSS, PhilHealth, Pag-IBIG, BIR all computed per law; BIR 1601-C (monthly withholding) and BIR 2316 (annual employee certificate) PDF reports generated. ([§3.6](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Employee Self-Service portal** — Routes `/ess`, `/ess/payslips/[id]`, `/ess/leave/apply`, `/ess/profile`. Employees view/download payslips, apply for leave, edit profile (audited). Gov't IDs masked to last 4. Separate PIN-based login. ([§3.7](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **2FA + audit trail + encryption** — Lucia session auth, Argon2id PIN hashing, TOTP 2FA with backup codes, AES-256-GCM field-level encryption on SSS / TIN / PhilHealth / Pag-IBIG / bank account. Audit log viewer at `/audit-logs` with filters and color-coding. Failed-auth tracking and rate limiting in place. ([§3.8](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Background job queue** — `bg_jobs` table with PENDING / PROCESSING / COMPLETED / FAILED states, `SELECT FOR UPDATE SKIP LOCKED` worker, 10-min timeout, stale-job recovery, partial-write cleanup, live polled progress bar. Built for the 10k-employee target. ([§3.10](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Marketing site + lead capture** — `taolink-website/` at `taolink.sistemahub.com` with home / features / compliance / demo / support pages and a book-a-demo form (replaced the prior pricing page). ([§3.11](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Dashboard** — Payroll trend chart, cost breakdown, attendance ring, filing deadlines widget per agency, KPI strip. ([§3.9](../../TAOLINK-HRIS-CLIENT-AUDIT.md))

See also [payroll-engine](./payroll-engine.md) for the math breakdown.

---

## Partial features

- **Biometric device integration** ⚠️ — ZKTeco CSV import is wired, but there is **no live device polling**. Brand-specific live sync is a separate project. ([§1, §3.2](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Email notifications** ⚠️ — Nodemailer is wired (`src/lib/email.ts`), but workflow triggers (leave approved, payslip released, loan approved) are not connected end-to-end. ([§5.1](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Government form generation** ⚠️ — Data is computed correctly for all agencies, but only **BIR 1601-C** and **BIR 2316** have output files. Alphalist (1604-C / 1604-CF), SSS R-3 / R-5, PhilHealth RF-1, and Pag-IBIG MCRF / M1-1 are not generated. ([§5.2](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Reporting depth** ⚠️ — Salary history, NSD / OT detail, and consolidated leave balance data exist but lack dedicated report views. ([§5.1](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Monitoring** ⚠️ — PM2 logs only. Sentry MCP is set up but not integrated. ([§5.6](../../TAOLINK-HRIS-CLIENT-AUDIT.md))

---

## Not built

- **Native mobile app** ❌ — The mobile clock is a responsive web page. No native iOS/Android binary. Trade-off: no push notifications, no offline punch buffering, depends on browser GPS permissions. ([§5.3](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Performance management** ❌ — No goals, reviews, 360°, or calibration. ([§5.5](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Recruitment / ATS** ❌ — No job postings, applicant tracking, or interview scheduling. ([§5.5](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Training / LMS** ❌ — No course assignment, completion tracking, or certifications. ([§5.5](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Compensation planning** ❌ — No merit cycles, pay band analysis, or equity tooling. ([§5.5](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Org chart visualizer** ❌ — Position / manager FK data exists; no graphical view. ([§5.5](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Employee offboarding workflow** ❌ — Final pay, unused VL monetization, separation pay calculator are manual today. ([§5.1](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Bulk payslip email distribution** ❌ — HR downloads and sends manually. ([§5.1](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Manual one-time adjustments** ❌ — One-off bonus / deduction / reimbursement on a single payslip without editing the employee record. ([§5.1](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Manager dashboard** ❌ — Distinct from the HR-admin dashboard, with manager-scoped employee visibility. ([§5.4](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **In-app task / approval inbox** ❌ — Approvals happen on each module's page; no unified inbox. ([§5.4](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Anomaly alerting** ❌ — No "this employee has 3 lates this week" or "this pay run is 30% above last cycle" alerts. ([§5.4](../../TAOLINK-HRIS-CLIENT-AUDIT.md))
- **Multi-company / multi-branch** ❌ — Schema does not currently model multiple legal entities. ([§6](../../TAOLINK-HRIS-CLIENT-AUDIT.md))

---

## Tech foundation

| Layer | Choice | Why it matters |
|---|---|---|
| Framework | Next.js 15 (App Router, Server Actions) | Modern, well-supported, SEO-ready |
| Database | MySQL via Drizzle ORM | Industry-standard; portable; type-safe queries |
| Auth | Lucia (session-based) + Argon2id PIN hashing | Bank-grade hashing; no JWT footguns |
| 2FA | TOTP (Google Authenticator compatible) + backup codes | Compliant with modern auth standards |
| Encryption | AES-256-GCM (field-level on SSS, TIN, PhilHealth, Pag-IBIG, bank account) | Government IDs never readable in DB dumps |
| Validation | Zod v4 | Every form input validated before reaching DB |
| Background workers | DB-backed queue + PM2 worker process | Payroll for 10,000 employees without HTTP timeouts |
| Timezone | `Asia/Manila` enforced at PM2 + DB layer | No off-by-8-hours bugs |
| Process manager | PM2 (3 processes: web, marketing, worker) | Auto-restart, log rotation, memory caps |
| File storage | Local disk under `public/uploads/` | Selfies + punches; planned migration path noted in memory |

Source: [TAOLINK-HRIS-CLIENT-AUDIT.md §2](../../TAOLINK-HRIS-CLIENT-AUDIT.md). (Note: the audit lists Next.js 15; the v2 workspace tracks Next.js 16 — see [taolink-overview](./taolink-overview.md).)

---

## Gaps to address in TAOLINK v2

Candidate priorities derived from the audit gaps. Not commitments — these are the shortlist to weigh against actual client pain points before scope is fixed.

- **Native mobile app** — Push notifications, offline punch buffering, app-store presence. Audit estimates this as a 2–3 month effort.
- **Live biometric device sync** — Direct ZKTeco (and possibly other brands) device polling rather than CSV import.
- **Government form output expansion** — BIR Alphalist (1604-C / 1604-CF), SSS R-3 / R-5, PhilHealth RF-1, Pag-IBIG MCRF / M1-1. Build only the ones the client actually files.
- **Performance management module** — Goals, reviews, 360°, calibration. Greenfield module.
- **Recruitment / ATS** — Job postings, applicant tracking, interview scheduling.
- **Training / LMS** — Course assignment, completion tracking, certifications.
- **Workflow email notifications** — Wire the existing Nodemailer setup to leave / payslip / loan workflow events.
- **Employee offboarding workflow** — Final pay, unused VL monetization, separation pay calculator.
- **Bulk payslip distribution** — Automate the manual download-and-send loop.
- **One-time payroll adjustments** — Bonus / deduction / reimbursement entries that don't require editing the employee's salary record.
- **Manager dashboard + approval inbox** — Manager-scoped views and a unified in-app inbox for cross-module approvals.
- **Anomaly alerting** — Lates / absences / pay-run-delta alerts at the dashboard level.
- **Multi-company / multi-branch schema** — If the client roadmap touches multi-entity payroll.
- **Object storage migration** — Move selfies and uploads off single-VPS local disk (S3/B2 or equivalent).
- **APM integration** — Finish the Sentry MCP wiring; add error/performance monitoring beyond PM2 logs.
- **Automated DB backups** — Confirm with client IT or own it inside the deploy scripts.

---

## See also

- [TAOLINK-HRIS-CLIENT-AUDIT.md](../../TAOLINK-HRIS-CLIENT-AUDIT.md) — the source of every claim on this page
- [taolink-overview](./taolink-overview.md) — high-level product orientation
- [payroll-engine](./payroll-engine.md) — payroll math deep-dive *(to be written)*
- [sources/README](../sources/README.md) — index of raw source documents
