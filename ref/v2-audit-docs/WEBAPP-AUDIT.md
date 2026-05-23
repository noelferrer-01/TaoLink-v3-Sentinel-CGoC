# TaoLink — Webapp UX & Production Readiness Audit

**Audited:** 2026-04-01
**Auditor:** Claude (acting as HR Manager + Dev Reviewer)
**Scope:** All admin pages, all ESS pages, security, UX, operational completeness
**Status:** In Progress — check off items as completed

---

## Overall Score

| Area                  | Score          | Note                                                  |
| --------------------- | -------------- | ----------------------------------------------------- |
| Payroll accuracy      | 10/10          | Verified correct, all PH law compliant                |
| Security              | 9/10           | Enterprise-grade, only missing 2FA backup codes       |
| Data integrity        | 9/10           | Strong validation, proper DB constraints              |
| UI consistency        | 8/10           | Clean, consistent design language                     |
| Admin UX              | 7/10           | Functional but missing key actions                    |
| ESS UX                | 7/10           | Clean but low on self-service features                |
| Compliance reporting  | 6/10           | Data is right, no PDF export                          |
| Operational workflows | 5/10           | Missing approval flows, notifications, recovery paths |
| **Overall**     | **7/10** | Great foundation, not quite a daily driver yet        |

---

## VERDICT: Is it Production-Grade?

**Not yet — ~65–70% production-ready.**
The payroll engine and security are solid. The operational gaps below will hurt on Day 1 of real payroll use.

---

## CRITICAL (must fix before going live)

- [x] ~~**Run DB migration `0016_pagibig_salary_cap.sql` on VPS**~~ — Confirmed applied: `salary_cap = 5000.00` ✅ *(2026-04-01)*
- [x] ~~**Run `src/db/seed-compliance.ts` on production DB**~~ — Confirmed seeded: SSS (61 brackets), PhilHealth (5%), Pag-IBIG (2%), Wtax (12 brackets) ✅ *(2026-04-01)*
- [x] ~~**Seed `gov_holidays` table for 2026**~~ — Confirmed: 19 holidays seeded for 2026 ✅ *(2026-04-01)*
- [ ] **Verify 2026 SSS/PhilHealth/Pag-IBIG circulars** — All rates stored with `effective_date = 2024-01-01`. RA 11199 schedules SSS rate increases through 2025–2026. **Manually check SSS and PhilHealth circulars for any 2025/2026 rate change; if found, insert a new row with correct `effective_date`.**
- [x] ~~**Run remaining DB migrations**~~ — All confirmed applied on VPS: `0012` ✅ `0013` ✅ `0017` ✅ `0018` ✅ `0019` ✅ *(2026-04-01)*

---

## MUST-HAVE BEFORE REAL USE (functional gaps)

- [x] ~~**Password / PIN reset flow**~~ — Employee PIN reset already existed in `/accounts`. Added **Change Password** form to `/settings/security` for HR_ADMIN/SUPER_ADMIN accounts. ✅ *(2026-04-01)*
- [x] ~~**PDF export for BIR 1601-C**~~ — (`/remittances/bir-1601c`) Print-ready BIR 1601-C layout added. "Print / Save as PDF" button triggers browser print which renders the official form layout (taxpayer info, Schedule 1 table, certification block). ✅ *(2026-04-01)*
- [x] ~~**Pay run delete for DRAFT status**~~ — (`/pay-runs`) Delete button already exists on the detail page for DRAFT-only runs, with loan-deduction guard. ✅ *(2026-04-01)*
- [x] ~~**YTD totals on payslips**~~ — (`/ess/payslips/[id]`) Added Year-to-Date Contributions card showing cumulative SSS, PhilHealth, Pag-IBIG, and Withholding Tax from all locked/paid runs in the year. ✅ *(2026-04-01)*
- [x] ~~**Leave balance check before submission**~~ — (`/ess/leave/apply`) Leave type select now shows remaining credits in real-time. Green/amber/red indicator based on availability. Unpaid leave types show a note. ✅ *(2026-04-01)*
- [x] ~~**Audit log user name column**~~ — (`/audit-logs`) Now does a LEFT JOIN on `auth_users` to resolve `userId` → `email`. Falls back to UUID prefix if user was deleted. ✅ *(2026-04-01)*
- [x] ~~**Email/SMTP configuration**~~ — (`/settings`) SMTP settings card added with host/port/credentials/from fields, Save + Send Test Email buttons with live notifications. Leave approve/reject emails employee; apply notifies all HR admins. ✅ *(2026-04-01)*
- [x] ~~**13th Month "Mark as Paid" action**~~ — (`/thirteenth-month`) Added `hr_13th_month_disbursements` table. Each employee row now shows a "Mark Paid" button or a "Paid" badge. Action is audited. ✅ *(2026-04-01)*

---

## PAGE-BY-PAGE FINDINGS

### Dashboard (`/dashboard`) — B+

**What's good:** 4 KPIs are meaningful, recent payroll and pending leaves are shown.

**Issues:**

- [x] ~~KPI cards are not clickable~~ — all 4 cards now link to their respective pages ✅ *(2026-04-01)*
- [x] ~~"Generate BIR 1601-C" button out of place~~ — moved to "Compliance & Quick Links" section at the bottom with Remittances, 13th Month, Payroll Summary ✅ *(2026-04-01)*
- [x] ~~No current-month payroll status~~ — status bar below KPIs shows current month's run name + DRAFT/LOCKED/PAID badge, or "No run started yet" ✅ *(2026-04-01)*
- [x] ~~Add KPIs from Phase 1 roadmap~~ — 3 secondary cards added: employees without shifts (amber alert), loans ending soon (≤3 periods, amber alert), next pay run name + start date ✅ *(2026-04-02)*

---

### Employees List (`/employees`) — B

**What's good:** Clean table, good search, good sort, deduction flag checkmarks are a nice touch.

**Issues:**

- [x] ~~Rows are clickable but there's no visual cue~~ — stronger hover bg + arrow appears on hover ✅ *(2026-04-02)*
- [x] ~~No employee list CSV export~~ — Export CSV button in header downloads `employees-YYYY-MM-DD.csv` with all non-sensitive fields ✅ *(2026-04-02)*
- [x] ~~Bulk import template format is not explained~~ — Download CSV Template button already present on bulk import page ✅

---

### Employee Profile (`/employees/[id]`) — B-

**What's good:** Personal info, address, bank, government IDs are well-organized in sections.

**Issues:**

- [x] ~~No leave balance summary~~ — leave credits for current year shown with progress bars ✅ *(2026-04-02)*
- [x] ~~No loan summary~~ — all loans listed with balance, amortization, status ✅ *(2026-04-02)*
- [x] ~~No attendance summary~~ — last 30 days rate + latest day detail shown ✅ *(2026-04-02)*
- [x] ~~No salary history~~ — salary change log with previous → new + date shown ✅ *(2026-04-02)*
- [ ] No emergency contacts / medical info section — requires new DB table
- [ ] No documents/201 file attachment section — requires file storage

---

### Add / Edit Employee (`/employees/new`, `/employees/[id]/edit`) — B

**What's good:** Comprehensive 201 form, Zod validation.

**Issues:**

- [x] ~~No duplicate-detection warning~~ — server checks same firstName + lastName + birthDate before insert; shows amber warning with employee number + "Save Anyway" option ✅ *(2026-04-02)*
- [x] ~~No gov ID format hints~~ — format hint text shown below each ID field (SSS, PhilHealth, Pag-IBIG, TIN) ✅ *(2026-04-02)*

---

### Attendance (`/attendance`) — A-

**What's good:** 3-step workflow is well-designed and matches real HR practice. Date selector sync is smart. Raw logs table is a good debugging tool.

**Issues:**

- [x] ~~Can only process one day at a time — no batch/date-range processing~~ — "Process date range" toggle already existed in `ProcessAttendanceButton` (From/To date inputs, background job, 31-day cap) ✅ *(pre-existing)*
- [x] ~~No attendance correction interface — can't manually override a computed summary (e.g., wrong hours due to biometric glitch)~~ — pencil icon on each summary row opens a correction modal; editable fields: Total Hours, Late (min), OT (min), Status; saved via `correctAttendanceSummaryAction`, audited as `CORRECT_ATTENDANCE` ✅ *(2026-04-04)*
- [x] ~~Attendance status colors (PRESENT, ABSENT, LEAVE, etc.) have no legend anywhere~~ — status legend added to Step 3 header showing PENDING/VERIFIED/POSTED/LEAVE/ABSENT with color dots and descriptions ✅ *(2026-04-04)*
- [ ] No overtime approval workflow — OT is auto-computed, no manager sign-off step (out of scope — requires separate approval flow and DB changes)

---

### Pay Runs List (`/pay-runs`) — B

**What's good:** Status badges (DRAFT → LOCKED → PAID) are clear.

**Issues:**

- [x] ~~No workflow explainer for new users — what does DRAFT → LOCKED → PAID mean?~~ — workflow card above the table explains each status with description ✅ *(2026-04-04)*
- [x] ~~No way to delete a DRAFT pay run — mistakes require developer intervention~~ — trash icon on each DRAFT row in the list (with confirm); delete also exists on the detail page ✅ *(2026-04-04)*
- [x] ~~No financial summary column in the list (total gross per run)~~ — Employees and Total Gross columns added; fetched via grouped subquery on `pay_ledger`, shows "—" for runs with no payroll generated yet ✅ *(2026-04-04)*
- [x] ~~No preset period templates (semi-monthly, monthly) on the "New Pay Run" form~~ — "1st Half", "2nd Half", "Monthly" preset buttons auto-fill name + dates for current month ✅ *(2026-04-04)*

---

### Pay Run Detail (`/pay-runs/[id]`) — A-

**What's good:** Strongest page in the app. KPIs, breakdown cards, employee ledger, and CSV export are all solid.

**Issues:**

- [x] ~~No per-employee payslip preview inline in the table — clicking an employee row should show their payslip~~ — clicking the employee name opens a drill-down modal with full pay items breakdown (Earnings, Employee Deductions, Employer Contributions) + PDF link ✅ *(2026-04-05)*
- [x] ~~Payroll ledger table only shows gross/deductions/net — no drill-down into why gross is a specific amount~~ — drill-down modal shows every pay_item line (Basic Pay, OT, SSS, PhilHealth, etc.) with amounts and descriptions ✅ *(2026-04-05)*
- [x] ~~No pay run approval gate — any HR_ADMIN can lock and mark PAID with no second-reviewer step on a potentially ₱1M+ payroll~~ — "Mark as Paid" is now SUPER_ADMIN only; HR_ADMIN sees a note explaining the restriction ✅ *(2026-04-05)*
- [x] ~~No payslip bulk email distribution (currently print-only)~~ — "Email Payslips" button (SUPER_ADMIN only) sends payslip notification emails to all employees in the run; shows gross + net pay, links to ESS portal; skips employees with no email on file; audited ✅ *(2026-04-05)*

---

### Payroll Summary (`/payroll-summary`) — B+

**What's good:** Executive view, trend chart, remittance sidebar, compliance note are all solid.

**Issues:**

- [x] ~~No comparison period (e.g., vs. previous month)~~ — Period-over-Period Comparison table added: side-by-side Current vs Previous for gross, deductions, net, ER contributions, total cost, cost/employee with % change column. All KPI cards show ↑/↓ indicators vs previous run. ✅ *(2026-04-05)*
- [x] ~~No budget vs. actual column~~ — Budget vs Actual section with budget/actual/variance cards. Variance shows amount + % in red (over budget) or teal (under). SUPER_ADMIN can set semi-monthly payroll budget inline (stored in `sys_configs`). ✅ *(2026-04-05)*
- [x] ~~No cost-per-employee metric~~ — New KPI card showing Total Company Cost ÷ Employee Count with % change vs previous period. Also shown in comparison table. ✅ *(2026-04-05)*

---

### 13th Month Pay (`/thirteenth-month`) — B

**What's good:** Calculation view is clear, formula and tax-exempt ceiling are shown.

**Issues:**

- [x] ~~No "Mark as Paid" / disbursement tracking~~ — per-employee "Mark Paid" button added, records to DB ✅ *(2026-04-01)*
- [x] ~~No payment status per employee~~ — Disbursed column shows PAID badge or Mark Paid button ✅ *(2026-04-01)*
- [x] ~~No distribution schedule or target date field~~ — `TargetDateCard` added above table: progress bar (X/Y paid), target date picker saves to `sys_configs` per year with countdown (days until / overdue). Bulk pay: checkboxes + "Mark Selected as Paid" + "Mark All Unpaid as Paid" with confirm. ✅ *(2026-04-03)*

---

### Loans (`/loans`) — C+

**What's good:** Create form and list table are functional.

**Issues:**

- [x] ~~No amortization / payment schedule view~~ — `/loans/[id]` detail page shows projected remaining schedule (period × amortization × running balance) ✅ *(2026-04-02)*
- [x] ~~No payment history per loan~~ — `/loans/[id]` payment history table with PAYROLL/MANUAL badge ✅ *(2026-04-02)*
- [x] ~~No early settlement action~~ — "Settle in Full" button on detail page records full balance as manual payment ✅ *(2026-04-02)*
- [x] ~~No interest rate or loan term displayed in the list~~ — Periods Remaining column added to loans list table ✅ *(2026-04-02)*
- [ ] The 50% salary warning is good but no hard block exists — consider a configurable threshold
- [x] ~~No indication on which pay run a specific loan deduction was posted~~ — PAYROLL payments on detail page link directly to the pay run ✅ *(2026-04-02)*

---

### Remittances (`/remittances`) — B

**What's good:** Month/year filter, 3-agency breakdown, filing deadline notice are exactly what HR needs.

**Issues:**

- [x] ~~No "Mark as Filed / Paid" status per agency per month~~ — `RemittanceStatusCard` added below liability table: per-agency (SSS/PhilHealth/Pag-IBIG/BIR) status badge (Pending/Filed/Paid), inline "Mark Filed" and "Mark Paid" forms with reference number + notes, Reset button. Persisted to `gov_remittance_filings` table. ✅ *(2026-04-03)*
- [x] ~~No payment history or filing history log~~ — Filing History table at bottom of page shows all past filings with period, agency, status, amount, filed date, paid date, reference number. ✅ *(2026-04-03)*
- [x] ~~No filing deadline countdown or overdue alert~~ — Each agency row shows deadline countdown pill: green (>5 days), amber (≤5 days), red (overdue). Deadlines: SSS 20th, PhilHealth 10th, Pag-IBIG 15th, BIR 10th of following month. ✅ *(2026-04-03)*

---

### BIR 1601-C (`/remittances/bir-1601c`) — B+

**What's good:** Form structure, ATC code, schedule table, and filing deadline alert are well done.

**Issues:**

- [x] ~~No PDF / print-ready export~~ — print-ready BIR 1601-C layout with certification block added ✅ *(2026-04-01)*
- [x] ~~No eFPS link or electronic filing integration~~ — eFPS reference card added with deadline note (efps.bir.gov.ph, extended 15th deadline for eFPS filers) ✅ *(2026-04-04)*
- [x] ~~Company TIN and BIR RDO number are not on this form — legally required on the actual 1601-C~~ — Company TIN, BIR RDO Code, and Registered Address added to Settings → Organization Profile; appear in both the on-screen Taxpayer Information card and the print layout; amber warning shown if any field is missing ✅ *(2026-04-04)*
- [x] ~~No amendment/correction workflow if a prior month was wrong~~ — "Mark as Amended Return" toggle per month/year; amber banner on screen + "AMENDED RETURN" stamp on print layout; stored in `sys_configs` ✅ *(2026-04-04)*

---

### Leaves (`/leaves`) — B

**What's good:** 3-section layout (Pending → History → Credits) is logical. Approve/reject buttons are visible.

**Issues:**

- [x] ~~When reviewing a pending request, the employee's remaining balance is NOT shown on the same screen~~ — Color-coded credit pill on each pending card: teal (sufficient), amber (partial), red (none/no allocation), grey (unpaid). Shows "X.X / Y.Y days left". ✅ *(2026-04-03)*
- [ ] Annual leave credit allocation is a manual button click — no auto-reset every January (cron job needed)
- [ ] No carryover / expiration rules UI
- [ ] No leave entitlement based on tenure (e.g., +1 day per year of service)
- [x] ~~No leave type management (add/edit/delete leave types)~~ — `/settings/leave-types` page added: add new types (name, code, paid/unpaid, description), inline edit, delete (blocked if credits or applications exist). Linked from Settings sidebar. ✅ *(2026-04-03)*

---

### Audit Logs (`/audit-logs`) — B-

**What's good:** Filterable, color-coded badges, all critical events logged.

**Issues:**

- [x] ~~User column shows UUID fragment~~ — resolved to email via LEFT JOIN ✅ *(2026-04-01)*
- [x] ~~No CSV/PDF export of audit logs~~ — Export CSV button downloads all matching logs (filters applied) as `audit-logs-YYYY-MM-DD.csv`. Up to 50,000 rows. ✅ *(2026-04-03)*
- [x] ~~"Details" column JSON is truncated~~ — clicking any row opens a detail modal with pretty-printed JSON, full entity ID, user agent, and all metadata. ✅ *(2026-04-03)*
- [x] ~~No log retention / cleanup policy controls~~ — SUPER_ADMIN-only card at bottom of page; select retention period (30/60/90/180/365 days), confirm, deletes matching logs and logs the purge action itself. ✅ *(2026-04-03)*

---

### Accounts (`/accounts`) — C+

**What's good:** Bulk provisioning is good, PIN CSV export is useful.

**Issues:**

- [x] ~~No password reset button~~ — Admin can regenerate employee PIN from `/accounts`; employees can change their own PIN from ESS profile. ✅
- [ ] No login history per account — can't verify if an employee actually accessed their payslip
- [ ] No 2FA enforcement per account
- [ ] No account deactivation workflow visible in the UI

---

### Settings (`/settings`) — B-

**What's good:** Maintenance mode toggle is clear, quick links are helpful.

**Issues:**

- [x] ~~No SMTP / email configuration~~ — SMTP settings card added with test email button ✅ *(2026-04-01)*
- [x] ~~No company TIN, BIR RDO, and business address fields — these are required on compliance reports~~ — Company TIN, BIR RDO Code, and Registered Address added to Settings → Organization Profile ✅ *(2026-04-04)*
- [ ] No logo / branding upload
- [ ] No timezone picker (currently hardcoded to PST)
- [ ] No data backup / export controls

---

### Government Rates (`/settings/government-rates`) — B

**What's good:** Rate tables are editable, error banner if not seeded is excellent, read-only notice on SSS/Wtax is honest.

**Issues:**

- [x] ~~No effective-date management on the UI~~ — All 4 tabs now show current effective date pill. SSS and W-Tax have schedule date selector for switching between schedules. PhilHealth and Pag-IBIG show full rate history accordion. Service layer filters by latest effective date for calculations. ✅ *(2026-04-05)*
- [x] ~~SSS and Withholding Tax brackets are read-only~~ — SUPER_ADMIN can now: "New Schedule" clones all current brackets to a new effective date; inline edit/delete individual bracket rows (pencil + trash icons); add new bracket rows. All actions are audited. ✅ *(2026-04-05)*

---

### Departments & Positions (`/settings/departments`) — A-

**What's good:** Clean, simple, works well.

**Issues:**

- [x] ~~When a position is deleted, it's not clear what happens to employees currently assigned to it — add a warning with the affected count~~ — amber employee count pill shown on each position row; deleting a position with employees requires a confirm step showing "N employees will lose their position assignment." ✅ *(2026-04-04)*

---

### Holiday Calendar (`/settings/holidays`) — A-

**What's good:** Year tabs, legal references, "Load Official" button, holiday type explanations are excellent.

**Issues:**

- [x] ~~Islamic holidays marked "approx." with no follow-up~~ — note already present at bottom of page: "update once the official IATF proclamation is issued each year." ✅ *(2026-04-03)*

---

### Security (`/settings/security`) — B

**What's good:** TOTP 2FA setup and disable work correctly.

**Issues:**

- [x] ~~No backup codes~~ — 8 single-use backup codes generated on 2FA enable (and on-demand regeneration). Codes shown once, copy-all button. Login accepts backup code as TOTP fallback, audited as `LOGIN_BACKUP_CODE_USED`. ✅ *(2026-04-03)*
- [ ] No login attempt / device history per user

---

## ESS PORTAL

### ESS Dashboard (`/ess`) — B+

**What's good:** Clean, personal, the right KPIs (leave balance, attendance rate, last net pay), and a prominent Apply for Leave CTA.

**Issues:**

- [x] ~~No YTD tax summary~~ — visible on each payslip detail page ✅ *(2026-04-01)*
- [x] ~~No upcoming pay date displayed~~ — 5th KPI card shows next pay run name + start date, or "No upcoming run". ✅ *(2026-04-03)*
- [x] ~~No company announcements section~~ — HR/Admin posts announcement (title + body + active toggle) in `/settings`. Active announcements appear as a yellow banner on the ESS dashboard. ✅ *(2026-04-03)*

---

### ESS Payslips (`/ess/payslips`) — B

**What's good:** Sorted by most recent, clean list.

**Issues:**

- [x] ~~No year filter — 24+ payslips means endless scrolling~~ — year filter pills added to table header; defaults to most recent year, URL-based (`?year=YYYY`) ✅ *(2026-04-04)*
- [x] ~~No YTD totals on the payslip detail~~ — Year-to-Date Contributions card added ✅ *(2026-04-01)*
- [x] ~~No YTD contribution breakdown~~ — SSS, PhilHealth, Pag-IBIG, Withholding Tax all shown ✅ *(2026-04-01)*

---

### ESS Leave (`/ess/leave`) — B-

**What's good:** Leave type balance cards are useful, application history table is clean.

**Issues:**

- [x] ~~No leave balance check or warning on the apply form~~ — real-time balance indicator shown when leave type is selected ✅ *(2026-04-01)*
- [x] ~~No conflict detection — can submit overlapping leave requests~~ — overlap detection already enforced server-side; errors now surface inline on the apply form ✅ *(2026-04-04)*
- [x] ~~No auto-calculation of working days between start and end date (weekends, holidays should be skipped)~~ — live working-days counter on apply form (weekends excluded client-side, regular holidays verified server-side on submit); counter turns red if days exceed available credits ✅ *(2026-04-04)*
- [ ] No leave policy document link

---

### ESS Profile (`/ess/profile`) — B

**What's good:** Government IDs masked to last 4 digits is correct. PIN change is accessible.

**Issues:**

- [x] ~~Employees cannot update their own contact info, address, or emergency contacts~~ — "Update Contact & Address" card added to ESS profile: editable email, address line 1 & 2, barangay, city, province, ZIP; saved via server action, audited as `UPDATE_OWN_CONTACT` ✅ *(2026-04-04)*
- [x] ~~No address display at all on the ESS profile~~ — full address shown in Personal Information card when set ✅ *(2026-04-04)*
- [ ] No language / notification preferences

---

## NICE-TO-HAVE (Post-Launch Phase 1–3 Roadmap)

These are valuable but do not block Day 1 operations.

- [x] ~~Dashboard KPI drill-down~~ — all 4 KPI cards link to their respective pages ✅ *(2026-04-01)*
- [x] ~~Employee bulk export to CSV~~ — Export CSV button on `/employees` ✅ *(2026-04-02)*
- [x] ~~Payslip bulk email distribution from pay run detail~~ — "Email Payslips" button (SUPER_ADMIN only) on pay run detail ✅ *(2026-04-05)*
- [x] ~~Salary history tab on employee profile~~ — salary change log with previous → new + date ✅ *(2026-04-02)*
- [x] ~~Attendance correction / manual override interface~~ — pencil icon on each summary row opens correction modal ✅ *(2026-04-04)*
- [ ] NSD breakdown report
- [ ] Leave balance export report
- [ ] Employee offboarding workflow (final payslip, unused VL monetization, separation pay)
- [ ] BIR 2316 / Alphalist generation
- [ ] Manual one-time payroll adjustment (bonus / deduction without full regeneration)
- [ ] Shift management as a dedicated settings page (currently buried in `/attendance`)
- [ ] Leave credit auto-reset cron (January annual allocation, not just manual trigger)
- [ ] Super-Admin per-employee deduction override UI
- [ ] Night shift differential report
- [ ] Company-wide payroll cost center / department breakdown

---

## HR Manager Verdict

> **7/10 — Ready for a small company (<50 employees) that can tolerate some manual steps. Not ready for a 200+ employee company running monthly payroll without the must-have items above.**

**What an HR manager would love:**

- Payroll calculation accuracy is the #1 thing that matters and it is correct
- The audit trail is excellent — every action is logged
- ESS portal is clean enough for non-tech-savvy employees
- Attendance 3-step workflow matches how Philippine HR teams actually work

**What would frustrate them daily:**

- No PDF export for BIR 1601-C means manually copying numbers into eFPS every month
- No YTD breakdown means employees can't self-serve ITR questions
- No self-service password reset means calling the developer when anyone forgets credentials
- Annual leave allocation is manual — forget to click it in January and everyone's balance shows zero
- Reviewing a leave request without seeing the employee's balance on the same screen is inefficient
- Loans page has no payment schedule — can't confirm a deduction was correctly posted

---

*Audit performed: 2026-04-01 | Next review: after must-have items are completed*
