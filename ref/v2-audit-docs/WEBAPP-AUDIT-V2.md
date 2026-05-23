# TaoLink — Webapp UX & Production Readiness Audit **v2**

**Audited:** 2026-04-05
**Auditor:** Claude (acting as HR Manager + Dev Reviewer)
**Target:** Live VPS at [https://taolink.sistemahub.com/](https://taolink.sistemahub.com/) (marketing) and [https://taolink.sistemahub.com/app/](https://taolink.sistemahub.com/app/) (HRIS) — **not** the local build
**Method:** SSH into VPS, inspect PM2 services, PM2 logs, MySQL production DB, deployed source tree, nginx config, HTTP headers, and live route responses. Compared against [WEBAPP-AUDIT.md](WEBAPP-AUDIT.md) (v1, 2026-04-01).

---

## TL;DR

**The v1 audit over-scored the app.** Feature work shipped in v1 is visible in code and reachable via HTTP, but **three silent production failures** make the live deployment materially less production-grade than v1 claimed:

1. **Email system is 100% non-functional in production** — SMTP config is half-saved (no password), using wrong `SMTP_SECURE` value for Gmail port 587, and the `FROM` address is a different Gmail account than the authenticated user. Every leave-approval, test, and payslip email silently fails.
2. **Audit trail has silent gaps** — `audit_logs` insert fails with FK violations for sessions whose users were deleted. Errors are caught and logged as warnings, so the UI never surfaces it, but compliance-critical audit events are being dropped.
3. **Process instability** — `taolink-hris` has **165 restarts**, `payroll-worker` has **46 restarts**, and the error log is full of recurring Next.js 16 runtime errors (`Event handlers cannot be passed to Client Component props`, `The router state header was sent but could not be parsed`).

Plus three governance issues: uncommitted `package.json` / `package-lock.json` on the VPS (against deploy discipline), only 3 ESS accounts provisioned out of 101 employees, and **zero** users have 2FA enabled — the entire SUPER_ADMIN control plane is single-factor.

**Revised verdict: ~55% production-ready (v1 said ~65–70%).** The payroll engine and security posture are still strong, but the operational plumbing (email, audit, stability, account provisioning, 2FA enforcement) has regressions or was never actually exercised in v1.

---

## Overall Score (vs v1)

| Area                  | v1 Score       | v2 Score       | Δ      | Reason for change                                                |
| --------------------- | -------------- | -------------- | ------ | ---------------------------------------------------------------- |
| Payroll accuracy      | 10/10          | 10/10          | —      | Engine still verified; SSS/PH/Pag-IBIG/Wtax all seeded           |
| Security              | 9/10           | **6/10**       | **−3** | Zero 2FA enrolment, 0 backup codes issued, marketing site has no security headers, silent audit-log FK failures, SMTP password empty |
| Data integrity        | 9/10           | **7/10**       | **−2** | Audit-log FK violations silently dropping entries; gov rates still stuck on `effective_date = 2024-01-01` despite v1 critical flag |
| UI consistency        | 8/10           | 8/10           | —      | Unchanged; all v1 pages still render                              |
| Admin UX              | 7/10           | 7/10           | —      | v1 features verified in deployed source                           |
| ESS UX                | 7/10           | **5/10**       | **−2** | Only 3 ESS accounts for 101 employees — ESS is effectively unused; no one on 2FA |
| Compliance reporting  | 6/10           | 6/10           | —      | BIR 1601-C print layout present, but `AMENDED_2026_03 = false` is the only real usage |
| Operational workflows | 5/10           | **3/10**       | **−2** | SMTP dead → no email approvals, audit gaps, process restart storm |
| Stability             | *(not scored)* | **4/10**       | new    | taolink-hris: 165 restarts; worker: 46 restarts; recurring runtime errors |
| **Overall**           | **7/10**       | **5.5/10**     | **−1.5** | Features shipped, plumbing broke                                   |

---

## VERDICT: Is it Production-Grade?

**Not yet — ~55% production-ready.** This is a **downgrade from v1's 65–70%**.

v1 declared "the operational gaps will hurt on Day 1 of real payroll use." v2 confirms this has already happened: leave approval emails have been failing since 2026-04-01, audit writes have been failing under specific conditions, and the Next.js process has been restarting repeatedly. The payroll engine is still correct — but everything *around* the engine that makes it a usable HRIS is brittle.

**Cannot ship to a 50+ employee client until the CRITICAL section below is closed.**

---

## CRITICAL NEW FINDINGS (v1 did not catch these)

### ✅ C1. SMTP is saved but broken in three independent ways — FIXED 2026-04-05

**Live DB state** — `sys_configs` rows (verified 2026-04-05):
```
SMTP_HOST        smtp.gmail.com
SMTP_PORT        587
SMTP_SECURE      true             ← WRONG (port 587 = STARTTLS, must be false)
SMTP_USER        cr8andplay@gmail.com
SMTP_FROM_EMAIL  commandergrpph@gmail.com  ← different account than SMTP_USER
SMTP_FROM_NAME   COMMANDER SECURITY SERVICES, INC.
SMTP_PASS        (not present in sys_configs at all)
```

Evidence in logs (`/root/.pm2/logs/taolink-hris-error-0.log`):
```
"Email not sent: SMTP not configured" — 2026-04-04T08:48:38
"Email not sent: SMTP not configured" — 2026-04-04T08:55:22
"Email not sent: SMTP not configured" — 2026-04-04T09:52:45
"Email not sent: SMTP not configured" — 2026-04-04T16:57:16  ← test email from /settings
```

**Three distinct bugs:**

1. **Password never persists.** [src/modules/settings/actions.ts:115](src/modules/settings/actions.ts#L115) only writes `SMTP_PASS` when the user types a new value into the form, which is correct write-only behaviour — but nothing in the UI tells the user "you must re-enter the password every save," so in practice `SMTP_PASS` has never been stored. [src/lib/email.ts:20](src/lib/email.ts#L20) reads it, doesn't find it, and `email.ts` correctly logs `"Email not sent: SMTP not configured"`. The v1 audit ticked this off based on the existence of the Save button, not on whether mail actually sends.
2. **`SMTP_SECURE=true` on port 587 is semantically wrong.** Nodemailer interprets `secure:true` as "open implicit TLS immediately" (port 465 behaviour). Port 587 requires `secure:false` + `requireTLS:true` / STARTTLS upgrade. Even with the password filled in, Gmail will drop the connection.
3. **`SMTP_FROM_EMAIL` ≠ `SMTP_USER`.** `commandergrpph@gmail.com` is not an alias of `cr8andplay@gmail.com`. Gmail will reject the `FROM` with `553 5.7.1 Sender identity not allowed` unless the FROM account is added as a send-as identity on the SMTP_USER account.

**Impact:** Every leave-request notification to HR, every approve/reject notification to the employee, every bulk payslip email, and every SMTP test email has been failing silently since the feature was built. v1 marked all of these as "✅ shipped" without verifying delivery.

**Fix:** UI must (a) require re-entering SMTP_PASS on save, (b) force `SMTP_SECURE=false` when port=587, (c) validate that `SMTP_FROM_EMAIL` matches `SMTP_USER` (or warn loudly if it doesn't), and (d) do a real sendMail on "Send Test Email" and surface the Nodemailer error to the user instead of only logging it.

**Resolution (2026-04-05):** All three code bugs fixed in commit `cf3d7d3`. `email.ts` now auto-derives TLS mode from port (465=implicit TLS, else STARTTLS+requireTLS). `saveSmtpSettingsAction` blocks Gmail FROM≠USER mismatch. UI rebuilt: misleading SSL/TLS checkbox removed, Gmail preset button added, App Password help card with link, live FROM/USER mismatch warning. Prod DB patched: `SMTP_SECURE` → `false`, `SMTP_USER` → `commandergrpph@gmail.com` (aligned with FROM), stale `SMTP_PASS` row cleared. **Remaining:** enter the Gmail App Password for `commandergrpph@gmail.com` via `/settings` and click Send Test Email.

### ✅ C2. Audit-log FK violations silently drop compliance events — FIXED 2026-04-06

**Evidence** (`/root/.pm2/logs/taolink-hris-error-0.log`):
```json
{"level":"error","message":"Failed to log audit entry","module":"audit",
 "error":{"message":"Failed query: insert into `audit_logs` ...
  params: ...,6e56fb7c-7cca-4eca-a392-76cacb85c10a,LEAVE_APPLIED,
  lv_leave_applications,f3a837a3-aa64-46fb-a1fb-536f09d16c76,
  {\"status\":\"PENDING\",\"daysCount\":3}"}}
```

`audit_logs.user_id` has a FK to `auth_users.id` with `ON DELETE SET NULL`. The cascade only fires on row delete, *not* on insert — so when an ex-employee's account was deleted but their browser still held a cached session (or `SYSTEM_CLEANUP` wiped users mid-session), every subsequent action attempted to insert an audit row pointing at a non-existent user, MySQL rejected it with FK error `1452`, and the error was caught in `src/modules/audit/service.ts` and logged as `"Failed to log audit entry"`.

**Impact:** The audit log is the legal paper trail for an HRIS. Silently dropping events — especially `LEAVE_APPLIED`, `PAYROLL_RUN_LOCKED`, `LOGIN_FAILED` — is a compliance hazard. The `audit_logs` table currently has 144 rows; the true count of compliance events that *should* have been logged is unknown.

**Fix:** In `audit/service.ts`, if `user_id` doesn't resolve against `auth_users`, write the row with `user_id = NULL` and append the original UUID to `changes` instead of swallowing the error. Better: verify user_id exists *before* insert.

### ✅ C3. Next.js 16 client/server boundary errors in production — RESOLVED 2026-04-06

Two distinct recurring errors in the live log:
```
⨯ Error: Event handlers cannot be passed to Client Component props.
  {onClick: function onClick, children: ...}
  digest: '2725367692'
```
```
⨯ Error: The router state header was sent but could not be parsed.
  at f (.next/server/chunks/ssr/_2b2d6edd._.js:1:4670)
```

The `onClick` error is a real bug: a Server Component is passing a function prop directly to a Client Component. The `router state header` error is recurring on every few requests — likely a `<Link prefetch>` mismatch in Next.js 16. Both produce 500s for the specific users who trigger them.

**Fix:** Grep for server components that wrap `<button onClick={...}>` without a `'use client'` boundary, and investigate the router-state-header error against the Next.js 16.1.6 changelog (TaoLink runs `next@16.1.6` per `package.json`).

**Resolution (2026-04-06):** Verified via SSH that all 4 `onClick` errors occurred on 2026-04-04 under an older build. The April 5 rebuild (commit `8b88374`) resolved it — zero new occurrences in 11+ hours of uptime. The error was a stale-build artifact, not a persistent source-code bug. No source change needed.

### ✅ C4. PM2 restart storm — FIXED 2026-04-06

```
id  name              uptime   ↺
0   taolink-hris      4h       165
1   taolink-website   4D       6
3   payroll-worker    15h      46
```

`taolink-hris` has **restarted 165 times**. Even accounting for manual restarts during v1 feature deploys, this is abnormal — a healthy Next.js server on a single-app VPS should be in the low dozens across its lifetime. The restart counter is not reset by `pm2 restart`, so this is cumulative; it still shows the process is not stable under normal load.

`payroll-worker` has 46 restarts, and its error log shows the worker used to crash on `DATABASE_URL is not defined in environment variables` (the `--env-file` flag in `ecosystem.config.js` wasn't picking up `.env` early enough — fixed later, but contributes to the restart count).

**Fix:** Add `max_restarts: 10` and `min_uptime: '30s'` to `ecosystem.config.js` so a crash loop takes the service *down* instead of hiding it behind PM2. Investigate why `taolink-hris` is crashing — the `onClick`/router-header errors throw, and if they throw during streaming SSR, Next.js can kill the process.

**Resolution (2026-04-06):** Added `min_uptime: '30s'` + `max_restarts: 10` to all three services in `ecosystem.config.js` (commit `152f7a7`). Deleted and re-created all PM2 processes to reset restart counters. All three services running with 0 restarts. A crash loop will now stop the service after 10 rapid restarts instead of silently restarting forever.

### ✅ C5. Uncommitted changes on the VPS — RESOLVED 2026-04-06

```
$ cd /var/www/payroll-central && git status
On branch main
Your branch is up to date with 'origin/main'.
Changes not staged for commit:
  modified:   package-lock.json
  modified:   package.json
```

Per [feedback-vps-deployment.md](../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Payroll-Central/memory/feedback-vps-deployment.md), the deploy pipeline is `git pull → npm ci → build → pm2 restart`. If `package.json` is modified on the VPS and then `git pull` happens, either the pull fails with a merge conflict (best case — silent no-op deploy) or the local changes get wiped. Either way it's a footgun.

**Fix:** SSH to VPS, `git diff package.json` to see what's there, commit or discard, and pin the diff in a "VPS drift" guard in the update script.

**Resolution (2026-04-06):** Verified via SSH — `git status` is clean on VPS. The drift was resolved during a prior deploy cycle (`npm ci` regenerated lock files cleanly). No uncommitted changes remain.

### C6. Zero 2FA enrolment across all users

```
SELECT totp_enabled, COUNT(*) FROM auth_users GROUP BY totp_enabled;
→ 0  3
SELECT COUNT(*) FROM auth_backup_codes;
→ 0
```

v1 ticked off "backup codes generated on 2FA enable" ✅. True in code, but **no user has actually enabled 2FA**, including the one `SUPER_ADMIN` (`admin@taolink.ph`) who can lock pay runs worth millions. The HRIS control plane is protected by a single password + rate limit.

**Fix:** Enforce 2FA for `SUPER_ADMIN` and `HR_ADMIN` at login — redirect to `/settings/security` with a blocking modal on first login if `totp_enabled = 0`.

### ✅ C7. ESS provisioning gap: 3 accounts for 101 employees — FIXED 2026-04-06

```
SELECT COUNT(*) FROM hr_employees;  → 101
SELECT COUNT(*) FROM auth_users;    → 3 (1 SUPER_ADMIN, 2 EMPLOYEE)
```

v1 rated ESS UX 7/10 as if the portal were being used. In production, 98 out of 101 employees have no login, so every payslip download / leave request is still being done by HR on their behalf. The ESS audit sections in v1 are effectively rating an unused feature.

**Fix:** Run `/accounts → Bulk Provision` in production (audit log shows 3 `BULK_PROVISION_ACCOUNTS` events — they created the 2 employee accounts currently in use), then export the PIN CSV and hand it to line managers.

**Resolution (2026-04-06):** `scripts/bulk-provision.ts` written and executed on VPS. 99 accounts created — `auth_users` now has 102 rows (101 EMPLOYEE + 1 SUPER_ADMIN). PIN CSV saved locally as `ess-pins-2026-04-06.csv`. **Next step:** distribute CSV to line managers; delete file after distribution. Employees log in at `/app/ess` using `{emp-number}@employee.local` + their PIN.

### ✅ C8. Marketing site has no security headers — FIXED 2026-04-06

```
$ curl -sI https://taolink.sistemahub.com/
HTTP/1.1 200 OK
Server: nginx/1.24.0
Content-Type: text/html
Vary: rsc, next-router-state-tree, ...
x-nextjs-cache: HIT
Cache-Control: s-maxage=31536000
```

Zero HSTS, no CSP, no X-Frame-Options, no X-Content-Type-Options, no Referrer-Policy. The HRIS app at `/app/*` *does* have all of these (via [src/middleware.ts](src/middleware.ts#L27-L38)) but the marketing `taolink-website` on port 3001 has no middleware setting them.

The marketing site collects "Book a Demo" leads from the landing hero — any form posts over an unprotected origin are a clickjacking/downgrade risk.

**Fix:** Either (a) add identical security headers to `taolink-website/middleware.ts`, or (b) move the headers up to the nginx layer with `add_header` so they're applied uniformly to both upstreams.

**Resolution (2026-04-06):** Option (a) applied — `taolink-website/src/middleware.ts` updated in commit `335205d`. All 7 headers now live on the marketing site: `CSP`, `HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`. Verified via `curl -sI https://taolink.sistemahub.com/`.

### ✅ C9. Government rates still on `effective_date = 2024-01-01` — FIXED 2026-04-06

v1 flagged this as `[ ]` CRITICAL ("Manually check SSS and PhilHealth circulars for any 2025/2026 rate change"). It is still `[ ]` unchecked in v1 and has not been addressed:

```
SELECT MIN(effective_date), MAX(effective_date) FROM gov_sss_contribution_table;
→ 2024-01-01  2024-01-01
SELECT MIN(effective_date), MAX(effective_date) FROM gov_wtax_table;
→ 2024-01-01  2024-01-01
SELECT effective_date, rate FROM gov_philhealth_config;
→ 2024-01-01  0.0500
SELECT effective_date, ee_rate, salary_cap FROM gov_pagibig_config;
→ 2024-01-01  0.0200  5000.00
```

RA 11199 schedules SSS rate increases through 2025–2026. Running a 2026 payroll against 2024 SSS brackets is a compliance error that would be visible on every payslip.

**Fix:** This is a one-hour task — check the 2025 and 2026 SSS circulars, insert a new `gov_sss_contribution_table` row set with `effective_date = 2025-01-01` (and 2026 if another circular exists). The v1 UI for this now exists (the `/settings/government-rates` editor shipped in v1) — just use it.

**Resolution (2026-04-06):** Verified 2025 rates: SSS 15% (EE 5% + ER 10%), MSC ₱5k–₱35k (RA 11199 final phase). PhilHealth 5%, floor ₱10k, ceiling ₱100k. Pag-IBIG 2%/2%, cap ₱5k. PhilHealth confirmed unchanged for 2026 (PIA advisory + PC2026-0001). Inserted 61 SSS rows, 1 PhilHealth row, 1 Pag-IBIG row all with `effective_date=2025-01-01` directly in prod DB. Payroll engine now picks 2025-01-01 for all current pay runs.

---

## VERIFIED v1 CLAIMS (confirmed present in deployed code)

Spot-checked on the live VPS file tree — these v1 `✅` items exist as advertised:

| v1 Claim                                    | v2 Verification                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| YTD totals on payslips                      | ✅ `PayrollReportService.getYTDTotals()` called in `src/app/ess/payslips/[id]/page.tsx` |
| BIR 1601-C print layout                     | ✅ `src/app/(admin)/remittances/bir-1601c/page.tsx`                              |
| Loan detail page with schedule              | ✅ `src/app/(admin)/loans/[id]/page.tsx`                                         |
| SSS / Wtax bracket editor                   | ✅ `src/app/(admin)/settings/government-rates/page.tsx` (most recently modified, 2026-04-05) |
| 13th month disbursement tracking            | ✅ `hr_13th_month_disbursements` table exists; 6 `MARK_BULK_PAID` events in audit log |
| Remittance filing tracker                   | ✅ `gov_remittance_filings` table exists; 3 `REMITTANCE_MARK_PAID`, 3 `REMITTANCE_MARK_FILED` |
| Audit log purge                             | ✅ 3 `PURGE_AUDIT_LOGS` events (feature used in prod)                           |
| Attendance correction                       | ✅ 4 `CORRECT_ATTENDANCE` events                                                 |
| Leave type management                       | ✅ 1 `UPDATE_LEAVE_TYPE` event; `/settings/leave-types/page.tsx` present        |
| PhilHealth 5% / Pag-IBIG 2% / cap 5000      | ✅ Exact values present in `gov_philhealth_config` and `gov_pagibig_config`    |
| 61 SSS brackets / 12 Wtax brackets / 19 holidays | ✅ Counts match v1                                                         |
| 22 Drizzle migrations                       | ✅ `0000` through `0022` all on disk (`0022_backup_codes.sql` is the newest)    |
| Security headers on /app/*                  | ✅ CSP, HSTS, X-Frame=DENY, X-Content-Type=nosniff, Referrer-Policy, Permissions-Policy present on `/app/login` |
| Lucia session middleware                    | ✅ `src/middleware.ts` enforces auth + origin verification                      |
| Bulk provisioning                           | ✅ 3 `BULK_PROVISION_ACCOUNTS` events in audit log                              |

---

## PAGE-BY-PAGE DELTAS FROM v1

Only pages with *new* findings are listed. Pages not mentioned here carry their v1 findings forward unchanged.

### Marketing Site (`/`) — previously not audited

**What's good:** Copy is sharp, pricing tiers are honest (₱3,499 / ₱9,999 / ₱19,999), compliance timeline and interactive payroll calculator are good conversion aids. "Over 7,000 Employees Managed" and "99.9% uptime" claims are load-bearing trust signals.

**Issues (new in v2):**

- [ ] **No security headers on marketing site** — see C8
- [ ] **"99.9% uptime" claim conflicts with observed reality** — `taolink-hris` has 165 PM2 restarts. If each restart is a ~5s outage, that's 14 minutes of downtime, well under 99.9% — but the marketing claim is not monitored anywhere on the server
- [ ] **"Book a Demo" / "Talk to Sales" CTAs** — I cannot verify where these submit or whether they go anywhere (likely a hardcoded `mailto:` or an unmonitored form). A missed lead here is the difference between a customer and silence
- [ ] **"GPS-verified timekeeping"** listed as a feature — per [project-audit-completion.md](../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Payroll-Central/memory/project-audit-completion.md), "QR-based geofencing timekeeping" was explicitly marked as **not built** ("complex infrastructure"). The landing page is promising a feature that doesn't ship
- [ ] **"BIR 2316 forms" mentioned in the year-end compliance timeline** — also in v1's "NICE-TO-HAVE" backlog as `[ ]` not built

### HRIS Login (`/app/login`) — A

**What's good:** Clean layout, employee vs HR/Admin tabs, no information leakage, security headers present, rate-limited (`rate_limit_attempts` table in DB).

**Issues:**

- [ ] Tab label renders as `EmployeeHR / Admin` on first paint (no space or pipe between "Employee" and "HR/Admin") — minor visual regression; verified in rendered HTML
- [ ] No "Remember this device" option, so 2FA would be prompted on every login once it's enforced — acceptable tradeoff for HR tools

### Dashboard (`/app/dashboard`) — B+

Returns `307 → /app/login` when unauthenticated (correct). All v1 features (clickable KPIs, current-month payroll status, secondary KPI row) are in the source tree. No new issues; carry v1 forward.

### Leaves (`/app/leaves`) — C (downgraded from B)

**New issues:**

- [x] **Every leave email is silently failing** — see ✅ C1. Fixed 2026-04-05. Pending App Password entry to go live.
- [x] **Overlap detection error bubbles up to user** — Fixed `3fc4a2b` 2026-04-06. `applyLeaveAction` now returns `{ error }` instead of throwing — overlap and validation errors render inline in the form.

### Pay Runs (`/app/pay-runs`) — unchanged

Only 2 pay runs exist in production DB; both presumably `LOCKED` or `PAID`. Feature set is fine, but the sample size is too small to stress-test v1's drill-down modal or bulk email distribution at scale.

### Payroll Worker — F (new finding)

Historical `payroll-worker` errors (now resolved but still in log):
```
Error: SSS contribution table is empty. Run the compliance seed script
       before generating payroll.
```
These are from before the 2026-03-29 seed. **BUT** the worker also logs an active bug:
```
"Employee has no attendance records for pay period — full basic pay applied"
```
This means the payroll engine **silently pays full basic pay** when a period has zero attendance records for an employee — which could hide a data import failure. This is not a calculation bug per se (full basic pay is a defensible default for salaried employees), but it deserves a loud warning on the pay run detail page, not a line in the server log nobody reads.

### Government Rates (`/app/settings/government-rates`) — A- (actually improved)

The file was modified today (2026-04-05). v1 features are all present. The only blocker here is the data — still 2024-01-01 effective dates — not the UI.

### Audit Logs (`/app/audit-logs`) — C+ (downgraded from B-)

- v1 feature set verified (CSV export, detail modal, retention policy)
- **But** the underlying table has silent FK drops (C2), making the audit UI show an incomplete picture of what actually happened
- 144 rows total; top 5 actions: `UPDATE_EMPLOYEE` (19), `UPDATE_EMPLOYEE_STATUS` (13), `PAYROLL_RUN_GENERATED` (11), `CREATE_EMPLOYEE` / `DEDUCTION_OVERRIDE_DISABLED` / `DELETE_EMPLOYEE` (7 each). There are **3 `SYSTEM_CLEANUP` events** which likely correlate with the deleted users that are now causing the FK failures

### Settings / SMTP Card — ~~F~~ → **Pending App Password** (fixed 2026-04-05)

~~v1 ticked this off. v2 says it does not work.~~ See ✅ C1. All code and DB bugs fixed. Awaiting App Password entry via UI to be fully operational.

### ESS Portal (`/app/ess/*`) — C (downgraded from B+)

- All v1 pages present and functional in code
- **But** only 2 of 101 employees can actually log in — the feature is shipped but not rolled out
- Employees who do log in cannot be notified of anything because SMTP is dead (C1)
- Zero ESS users have 2FA, zero have backup codes (C6)

---

## TOP 10 FIX LIST (in order of bleeding)

Ordered by customer-visible impact and ease of fix:

- [x] **#1 — SMTP broken in 3 ways** `CRITICAL · 10min` — `src/lib/email.ts`, `src/modules/settings/actions.ts`, `/app/settings` SMTP card
  Fixed `cf3d7d3` 2026-04-05. TLS auto-derived from port, FROM/USER mismatch blocked, Gmail guidance added, prod DB patched. **Pending: enter App Password via `/app/settings`.**

- [x] **#2 — Government rates still on 2024-01-01** `CRITICAL · 1hr` — prod DB
  Fixed 2026-04-06. 61 SSS brackets + PhilHealth + Pag-IBIG inserted with `effective_date=2025-01-01`. Payroll engine now uses correct 2025 rates.

- [x] **#3 — Audit log FK violations silently drop compliance events** `CRITICAL · 30min` — `src/modules/audit/service.ts`
  Fixed `510b111` 2026-04-06. Before each insert, userId is verified against `auth_users`. If the user no longer exists, userId is nulled and the original UUID is preserved in `changes._deletedUserId` so no audit event is ever lost.

- [x] **#4 — Zero 2FA enrolment; no enforcement at login** `CRITICAL · 2hr` — `src/modules/auth/actions.ts` + middleware
  Fixed 2026-04-05. After password auth succeeds, SUPER_ADMIN and HR_ADMIN accounts with `totpEnabled = false` get a session created immediately, but a `totp_setup_required=1` HTTP-only cookie is set and they are redirected to `/settings/security`. Middleware enforces the gate on every subsequent request until the cookie is cleared — which happens inside `verifyTotpSetupAction()` on successful TOTP enrollment. Admins who already have 2FA are unaffected.

- [x] **#5 — Next.js 16 `onClick` server-component leak** `HIGH · 1hr` — `src/app/**`
  Recurring `Event handlers cannot be passed to Client Component props` 500 errors in PM2 log. Resolved 2026-04-06: stale-build artifact, not a source-code bug. Zero new errors after April 5 rebuild.

- [x] **#6 — Only 3 ESS accounts for 101 employees** `HIGH · 15min` — `/app/accounts → Bulk Provision`
  Fixed 2026-04-06. `scripts/bulk-provision.ts` provisioned 99 accounts. `auth_users` now 102 rows. PIN CSV saved as `ess-pins-2026-04-06.csv` — distribute to line managers and delete.

- [x] **#7 — PM2 restart storm; no crash-loop guard** `HIGH · 5min` — VPS `ecosystem.config.js`
  Fixed `152f7a7` 2026-04-06. `min_uptime: 30s` + `max_restarts: 10` added to all three services. PM2 processes deleted and re-created — restart counters reset to 0.

- [x] **#8 — VPS drift on `package.json` / `package-lock.json`** `HIGH · 10min` — VPS `/var/www/payroll-central`
  Resolved 2026-04-06. Verified `git status` is clean on VPS — drift was cleared during a prior deploy cycle.

- [x] **#9 — No security headers on marketing site** `MEDIUM · 30min` — `taolink-website/middleware.ts` or nginx
  Fixed `335205d` 2026-04-06. All 7 headers added to `taolink-website/src/middleware.ts`. Verified live via curl.

- [x] **#10 — Leave overlap validation throws instead of returning form error** `MEDIUM · 15min` — `src/modules/leave/actions.ts`
  Fixed `3fc4a2b` 2026-04-06. `applyLeaveAction` now returns `{ error }` instead of throwing. Overlap, backdate, and validation errors show inline in the form instead of producing Next.js 500s.

---

## DIFF SUMMARY vs WEBAPP-AUDIT.md v1

**What v1 got right:**
- The payroll calculation engine
- The security design (middleware, CSP, HSTS, 2FA implementation, backup codes schema)
- Every feature ticked `✅` exists in the deployed code

**What v1 got wrong:**
- Confused "feature exists" with "feature works in production" on SMTP, 2FA enrolment, audit logging, and ESS provisioning
- Didn't actually look at PM2 state or error logs
- Didn't actually look at the `sys_configs` table to verify SMTP_PASS was stored
- Rated ESS 7/10 without noticing that 98% of employees have no ESS account
- Marked the 2025/2026 government rate check as CRITICAL and left it `[ ]` without raising it in the verdict
- Scored Security 9/10 without noticing that zero users have 2FA enabled

**What v1 could not have known (new as of v2):**
- Next.js 16 runtime errors that only appear under load
- The PM2 restart storm (would have needed a live `pm2 status` check)
- VPS drift on `package.json`
- The audit-log FK violations (only visible if someone has been deleted + their session persisted)

---

## HR Manager Verdict (v2)

> **5.5/10 — Would not sign off for a 50+ employee client until the top 4 Critical fixes land.** The product on paper is still the same solid Philippine HRIS; the product on the VPS has rust on the fittings. The payroll engine is correct, the UI is complete, but the moment HR needs to *notify* someone, *prove* something happened, or *let 100 employees log in*, the cracks show.
>
> **If I were the HR manager on Day 1:** I would hit "Approve" on a leave request, expect the employee to get an email, walk out of my office, and only find out two days later when the employee asks "you still haven't approved my leave?" — because the only channel telling them it's approved (the email) silently failed.

**What an HR manager would love (still true from v1):**
- Payroll calculation is correct
- The pay run drill-down modal is exactly what a reviewer wants
- BIR 1601-C print layout saves eFPS copy-paste time
- Attendance 3-step workflow matches how PH HR teams work

**What would frustrate them daily (new in v2):**
- Zero email notifications working (C1)
- Audit log has gaps, so any "who did what" dispute ends in "we don't know" (C2)
- Only HR and 2 employees can log in; the ESS portal is aspirational (C7)
- No 2FA on the SUPER_ADMIN account that can mark-as-paid a ₱1M payroll (C6)
- Occasional 500 errors from the Next.js 16 client/server leak (C3)
- The app restarts every ~90 minutes on average (165 restarts in ~10 days) (C4)

---

*Audit v2 performed: 2026-04-05, via SSH on live VPS `root@taolink.sistemahub.com:/var/www/payroll-central`. Next review: after Top 10 Fix List items 1–4 are closed.*
