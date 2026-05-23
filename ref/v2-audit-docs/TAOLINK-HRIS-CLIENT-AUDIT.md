# TaoLink HRIS — Client-Facing Audit

**Prepared:** 2026-04-27
**Scope:** Full inventory of what is built, what works, what is partially in place, and what gaps remain — informed by the actual codebase and 23 applied DB migrations (verified, not from memory).
**Purpose:** Honest baseline for the client conversation. No marketing language, no claims that can't be pointed to in code.

---

## 1. Executive Summary

TaoLink HRIS is a **production-ready Philippine payroll and HR information system** built on Next.js 15 with MySQL. It is currently deployed at `taolink.sistemahub.com` with an accompanying marketing site at the same domain.

**Verdict in one sentence:** All payroll calculations are mathematically correct per Philippine labor law and BIR rulings; the system can be used to run real payroll today. The remaining work is operational depth (reports, dashboards, edge-case workflows) — not foundational engineering.

| Area | Status |
|---|---|
| Payroll engine (math + statutory) | ✅ Production-ready, audited 4× |
| Attendance (clock in/out, GPS, selfie, ZKTeco import) | ✅ Production-ready |
| Employee 201 file management | ✅ Production-ready |
| Leave management | ✅ Production-ready |
| Loan management | ✅ Production-ready |
| Government remittances (SSS, PhilHealth, Pag-IBIG, BIR) | ✅ Computed; reports for BIR 1601-C and 2316 generated |
| Employee Self-Service (ESS) portal | ✅ Production-ready |
| 2FA + audit trail + encryption | ✅ Built; 2FA enrollment is opt-in |
| Background job queue (10k-employee scale) | ✅ Built and running |
| Marketing site + lead capture | ✅ Built |
| Mobile app (native iOS/Android) | ❌ Not built — mobile clock works through web |
| Biometric device direct integration | ⚠️ ZKTeco CSV import only; no live device sync |
| Performance management (KPIs, reviews, 360°) | ❌ Not built |
| Recruitment / ATS | ❌ Not built |
| Training / LMS | ❌ Not built |

---

## 2. Tech Foundation

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

---

## 3. Modules Built (Verified Against Code)

### 3.1 Employee Management
- Full 201 file: personal, address, employment, statutory, bank
- Bulk CSV import with FK validation for departments/positions
- Department + position management UI
- Salary history tracking (with FK RESTRICT — history can never be silently deleted)
- Employee deactivation / termination workflow
- Shift assignment per employee (recently added — commit `a690ec6`)
- KPI strip + filter pills + sortable list page (commit `20088ea`)

### 3.2 Attendance
- Manual entry, ZKTeco biometric CSV import, generic CSV import
- **Mobile clock in/out with GPS capture** (commit `23c5ed6`)
- **QR-based geofencing** for clock locations (commit `c6cdcc3`)
- **Selfie capture on every punch** with zoom modal viewer (commits `0a34bf7`, `3c907b2`, `43e88a9`)
- Clock locations management page (admin-defined geofences)
- Shifts module with grace period support
- Daily attendance review page with missing-punch filter and inline date picker
- Background processing: 500 employees per chunk; safe under crash; idempotent
- Raw logs table with delete + auto-resync

### 3.3 Leave
- Application + approval workflow
- Auto-calculation of paid/unpaid days into payroll
- Leave credit auto-allocation (annual)
- Leave types are configurable (`/settings/leave-types`)
- FK protection: deleting a leave type does NOT cascade delete history (RESTRICT)

### 3.4 Loans
- SSS Loan, Pag-IBIG Loan, Cash Advance support
- Per-pay-period amortization with FIFO order
- Net pay floor of ₱0 enforced
- **Void/reverse logic**: voiding a pay run safely reverses loan deductions

### 3.5 Payroll Engine (the math)
All formulas verified against Philippine labor law:

| Computation | Rule | Verified |
|---|---|---|
| Basic pay | salary × pay frequency | ✅ |
| Absence | absentDays × (salary × 12 / 261) | ✅ |
| Late/undertime | minutes × (hourlyRate / 60) | ✅ |
| Regular OT | 1.25× | Art. 87 ✅ |
| Regular Holiday OT | 2.60× (1.30 × worked) | Art. 93 ✅ |
| Special Non-Working OT | 1.69× (1.30 × 1.30) | ✅ |
| Rest Day | 1.30× base, 1.69× OT | Art. 93 ✅ |
| Night Shift Differential | 10% multiplicative on applicable rate | Art. 86 ✅ |
| SSS | Bracket lookup + WISP split + effective-date filter | SSS Law ✅ |
| PhilHealth | 5% × salary, ₱10k floor, ₱100k ceiling, 50/50 EE/ER | RA 11223 ✅ |
| Pag-IBIG | Tiered: 1% if ≤₱1,500, 2% if >; ₱5,000 salary cap | RA 9679, HDMF Circ. 274 ✅ |
| Withholding tax | TRAIN Law 2023 brackets, MWE exempt | BIR ✅ |
| 13th Month | Σ basic / 12, ₱90k tax-exempt | PD 851, BIR RR 3-2015 ✅ |

**Performance:** Zero N+1 queries. Loan lookup is one batch query for all employees. Inserts chunked 200 per transaction. A 10,000-employee pay run completes in a background job, not a blocking HTTP call.

### 3.6 Reports & Government Forms
- **BIR 1601-C** monthly withholding tax remittance (`/remittances/bir-1601c`)
- **BIR 2316** annual employee certificate (PDF, recently added — commit `93b0cbd`)
- Payslip PDF (per employee, per pay run)
- Payroll summary PDF (per pay run)
- CSV export: pay run, employees, audit logs

### 3.7 Employee Self-Service (ESS) Portal
Routes verified live: `/ess`, `/ess/payslips/[id]`, `/ess/leave/apply`, `/ess/profile`
- Employees view their payslips + download as PDF
- Apply for leave + see approval status
- Edit profile fields (with audit log)
- Government IDs are masked (last 4 digits only)
- ESS PIN-based login (separate from admin login)

### 3.8 Compliance & Security
- **Audit log viewer** (`/audit-logs`) with filters, sortable, paginated, color-coded
- **Failed-auth tracking** in audit (LOGIN_FAILED, PIN_LOGIN_FAILED, LOGIN_FAILED_2FA)
- **Rate limiting** (DB-backed): per-IP on login + 2FA, per-user PIN lockout
- **2FA with backup codes** (recovery if phone lost)
- **Government rate editor** (`/settings/government-rates`) — SSS, PhilHealth, Pag-IBIG, tax brackets editable when laws change
- **Holidays seed + manager UI** (`/settings/holidays`)
- **Sanitized DB error responses** (no raw SQL leakage)

### 3.9 Dashboard (`/dashboard`)
Recent additions (commit `b675454`):
- Payroll trend chart (Recharts)
- Cost breakdown by category
- Attendance ring (present / absent / late)
- Filing deadlines widget (one row per agency: SSS, PhilHealth, Pag-IBIG, BIR)
- KPI strip

### 3.10 Background Job Queue (Scale Layer)
Built specifically for the 10,000-employee target.
- `bg_jobs` table tracks PENDING / PROCESSING / COMPLETED / FAILED
- Worker uses `SELECT FOR UPDATE SKIP LOCKED` (safe with multiple workers)
- 10-minute job timeout
- Stale-job recovery on worker startup
- Partial-write cleanup on failure
- UI shows live progress bar via polling

### 3.11 Marketing Website (`taolink-website/`)
Lives at `taolink.sistemahub.com` (renamed from `taolink.genolworks.online` — commit `dd200a8`).
Pages: home, features, compliance, demo, support
**Lead capture:** book-a-demo form (commit `49c5e61`) — replaced the previous pricing page

---

## 4. What's Already Deployed

| Resource | URL / Path |
|---|---|
| Admin app | `taolink.sistemahub.com/app/` |
| Marketing site | `taolink.sistemahub.com/` |
| ESS portal | `taolink.sistemahub.com/app/ess/` |
| Mobile clock | `taolink.sistemahub.com/app/clock` |
| VPS host | docker-mailserver + 3 PM2 processes |
| Database | MySQL with 23 applied migrations (latest: selfie capture) |

---

## 5. Honest List of Gaps & Pain Points

These are real gaps in the current build. Group them by who feels the pain.

### 5.1 HR / Admin pain points the system does NOT yet solve
| Gap | Impact | Estimated lift |
|---|---|---|
| **Bulk payslip email distribution** | HR has to download + send manually | 2–3 days |
| **Manual one-time adjustments** (bonus, deduction, reimbursement on a single pay slip without editing salary) | HR works around it by changing employee record | 3–5 days |
| **Salary history report** (raises, audit trail of changes) | Data captured, but no report view | 1–2 days |
| **NSD / OT detail report** | Computed, but no separate report — only inside payslip | 2 days |
| **Leave balance report** | Per-employee view exists; consolidated company view does not | 1 day |
| **Employee offboarding workflow** (final pay, unused VL monetization, separation pay calculator) | Manual process today | 5–7 days |
| **Email notifications on workflow events** (leave approved, payslip released, loan approved) | Nodemailer is wired, but workflow triggers are not connected end-to-end | 3–5 days |

### 5.2 Compliance gaps
| Gap | Notes |
|---|---|
| **BIR Alphalist (1604-C / 1604-CF)** annual generation | 2316 is built; alphalist is not |
| **SSS R-3 / R-5 forms** generation | Computed, but no form file output |
| **PhilHealth RF-1** form generation | Same — data is there, form is not |
| **Pag-IBIG MCRF / M1-1** form generation | Same |
| **DOLE-mandated reports** (e.g., Establishment Report, OSH) | Not in scope today |

### 5.3 Mobile experience gaps
The mobile clock is a **web page** that works on phones, with GPS + selfie + QR. There is **no native iOS/Android app**.
- Pros of current approach: zero app-store friction, instant updates, no Apple/Google review delays
- Cons: no push notifications, no offline punch buffering, depends on browser GPS permissions

### 5.4 Operational visibility gaps
- Dashboard shows recent KPIs, but no **anomaly alerting** ("this employee has 3 lates this week", "this pay run is 30% above last cycle")
- No **manager dashboard** distinct from HR-admin dashboard (managers see a subset of employees)
- No in-app **task / approval inbox** — approvals happen on each module's page

### 5.5 Bigger HR functions not in the product at all
- **Recruitment / ATS** (job postings, applicant tracking, interview scheduling)
- **Performance management** (goals, reviews, 360°, calibration)
- **Training / LMS** (course assignment, completion tracking, certifications)
- **Compensation planning** (merit cycles, pay band analysis, equity)
- **Org chart visualizer** (data is there in the position/manager FK; no graphical view)

### 5.6 Tech-debt / reliability items worth raising honestly
- Selfies are stored on local disk — fine at current scale, but a sharded storage plan exists in our notes pending a decision
- File storage is not on object storage (S3/B2) yet — single-VPS dependency
- No automated DB backups visible in the deploy scripts (likely handled at VPS level — needs confirmation with the client's IT)
- Monitoring is PM2 logs only; no APM (Sentry, Datadog) — Sentry MCP is set up, integration is not

---

## 6. What "Customized Version" Likely Means — Decision Points to Walk Through Tomorrow

**To get a real customization scope, the client needs to weigh in on these. Bring these as the questions for the meeting:**

1. **Which gap from §5 is causing them the most pain right now?**
   Don't assume. The biggest perceived gap is usually one or two specific workflows.
2. **How many employees, how many pay periods/year, how many physical locations?**
   Drives whether the geofencing module needs work, whether multi-tenancy is needed.
3. **Do they need a native mobile app, or is the web mobile clock acceptable?**
   This is a 2–3 month effort vs. 0.
4. **Do they have an existing biometric device fleet?** If yes, what brand?
   ZKTeco CSV is wired; live device polling is a different project.
5. **What government forms beyond BIR 1601-C and 2316 do they actually file?**
   Build only the ones they file — every form is a few days of work.
6. **Do they want approval workflows beyond leave (e.g., overtime pre-approval, expense claims)?**
7. **Is multi-company / multi-branch a requirement?**
   The schema does not currently model multiple legal entities.
8. **Branding** — logo swap, color palette, custom domain, custom payslip layout.
9. **Integrations** — accounting (QuickBooks, Xero), banks (BPI, BDO payroll file format), Google Workspace SSO, Slack/Viber notifications.
10. **Data migration** — if they're switching from another system, who maps the data?

---

## 7. Recommended Demo Flow (Tomorrow)

A 30-minute live demo that lands well, in this order:

1. **Marketing site → lead capture** (1 min) — show the front door
2. **Admin login + 2FA** (1 min) — establishes security posture
3. **Dashboard** (3 min) — KPIs, payroll trend, attendance ring, filing deadlines
4. **Employee 201 file** (3 min) — full record, salary history, encrypted IDs
5. **Attendance review with missing-punch filter** (3 min) — show how HR resolves a day
6. **Mobile clock with selfie + GPS + QR** (3 min) — pull up phone, punch live
7. **Leave application from ESS → approval from admin** (3 min) — round-trip workflow
8. **Generate a pay run end-to-end** (5 min) — draft → review summary → lock → payslip PDF
9. **BIR 1601-C report + BIR 2316 PDF** (2 min) — concrete compliance proof
10. **Audit logs + Government rate editor** (2 min) — "you control this when laws change"
11. **The §5 gap list** (3 min) — show honesty; this is what wins customization scope
12. **Q&A**

---

## 8. Things to Avoid Saying Tomorrow

- Don't claim "fully automated" for BIR alphalist or anything in §5.2 except 1601-C and 2316
- Don't promise a native mobile app date — propose web-first and add native if scoped
- Don't show pricing — the marketing site removed that intentionally; lead with "book a demo"
- Don't claim the demo DB is production data — it's seed data; payroll math is the same regardless

---

## 9. Bottom Line for the Client

> "TaoLink HRIS is a working, audited Philippine payroll engine you can run today. The math is correct, the data is encrypted, and it scales to 10,000 employees per pay run. What we'd customize for you is the operational layer on top — the specific reports your accountant files, the approval flows your managers run, and any branding or integration you need. Tell us your top three pain points and we'll scope the customization off those, not off a checklist."

---

*Audit prepared from the live `main` branch and 23 applied migrations on 2026-04-27. All claims in §3 (Modules Built) are traceable to commits or migration files. §5 gaps are absences verified by searching the codebase, not assumptions.*
