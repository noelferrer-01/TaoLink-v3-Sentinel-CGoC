# Slice 1 — First Payslip

**Status:** CONTRACT LOCKED (2026-05-24). Implementation pending.
**Ships:** HR-starter + Clients/Detachments + Assignments + manual DTR + basic Payroll (4-deduction) + SSS R3 + BIR 2316 export
**Demo at end:** *Bulk-import 10 guards, assign them to a detachment, enter 15-day DTR, run payroll, view payslips, export SSS R3 and BIR 2316.*

This is the contract for Slice 1. Per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md) discipline rule #2, this README ships **before** the code does. If a thing is not listed here, it is not in Slice 1.

## What Slice 1 buys us

Slice 0 shipped four primitives nobody can see. Slice 1 is the first slice CGoC can demo. End of slice, someone at CGoC's payroll desk can walk through the demo and the numbers must reconcile (within ₱1) to what they'd compute by hand. That's the bar.

Five new modules are introduced — HR, Clients, Assignments, DTR, Payroll, and Compliance-exports. All of them sit on top of Slice 0's auth/audit/approvals/events primitives.

The payroll math depth is deliberately bounded: basic pay + simple OT + 4 statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR withholding). No holiday × rest-day rate stacks, no NSD breakdown, no 13th-month, no leave credits. The decision (option **(b)** of three offered during brainstorming) was: realistic-enough that CGoC payroll staff find the demo credible, but not so much that Slice 1 swallows scope that belongs to Slice 2+.

## Components

### 1. `modules/hr` — employee master + status state machine
- **Public API** (`modules/hr/index.ts`):
  - `hr.createEmployee(data) → Employee`
  - `hr.getEmployee(id) → Employee`
  - `hr.changeStatus(id, newStatus, reason) → Employee`
  - `hr.bulkImportEmployees(csv) → { imported, errors }`
- **Status state machine:** `applicant → hired → deployed | reliever | floating | on-leave | terminated`. Per [ADR 0009](../decisions/0009-hr-starter-and-recruitment-as-entry-point.md).
- **Salary fields (per v2 audited shape, [`ref/compliance/migrations/0000_short_loners.sql:33-34`](../../ref/compliance/migrations/0000_short_loners.sql)):**
  - `basicSalary` decimal(12,2) — monthly amount.
  - `payFrequency` enum(`MONTHLY`, `SEMI_MONTHLY`) default `SEMI_MONTHLY`. Drives which BIR withholding bracket table the payroll engine uses.
  - Daily rate is **derived** (`basicSalary ÷ workDaysPerMonth`), not stored.
- **Bulk import:** CSV with one row per guard. Pre-flight rejects duplicate emails (per v2 fix M-3); per-row errors surfaced to UI.
- **Out of scope for Slice 1:** leave management, performance reviews, salary history, benefits enrollment, 201-file document storage.
- **Emits:** `hr.employee.created`, `hr.employee.status_changed`.

### 2. `modules/clients` — Client + Detachment master
- **Public API** (`modules/clients/index.ts`):
  - `clients.createClient(data) → Client`
  - `clients.createDetachment(clientId, data) → Detachment`
  - `clients.getDetachment(id) → Detachment`
  - `clients.listDetachments(clientId) → Detachment[]`
- **Tables:** `clients`, `detachments`. Detachment belongs to one client.
- **Out of scope for Slice 1:** per-client rate tables (Slice 2), per-client OT rules, per-client equipment requirements, contract terms, billing templates.
- **Emits:** `clients.client.created`, `clients.detachment.created`.

### 3. `modules/assignments` — Assignment master
- **Public API** (`modules/assignments/index.ts`):
  - `assignments.assign(employeeId, detachmentId, startDate) → Assignment`
  - `assignments.endAssignment(id, endDate, reason) → Assignment`
  - `assignments.getActiveAssignment(employeeId, date) → Assignment | null`
- **Slice 1 caller:** super-admin writes directly via UI. **Slice 3 caller:** Recruitment owns these writes per [ADR 0001](../decisions/0001-recruitment-vs-operations-ownership.md) — same API, different upstream caller. The module README documents this handoff.
- **Why same module:** an assignment is a database object; *who has authority to write it* is policy, not data shape. Moving authority to Recruitment in Slice 3 is a policy change, not a schema change.
- **Emits:** `assignment.created`, `assignment.ended` — same topics Recruitment will publish in Slice 3.

### 4. `modules/dtr` — manual Daily Time Record entry
- **Public API** (`modules/dtr/index.ts`):
  - `dtr.recordDTR({ employeeId, date, timeIn, timeOut, status }) → DTREntry`
  - `dtr.getDTR(employeeId, periodStart, periodEnd) → DTREntry[]`
  - `dtr.closePeriod(periodStart, periodEnd) → void`
- **Per-row fields:** `employee_id`, `assignment_id` (resolved from `assignments.getActiveAssignment` at record time), `date`, `time_in`, `time_out`, `status`.
- **Status enum:** `worked | absent | leave | holiday-worked | restday-worked`. Last two are recorded but Slice 1 payroll treats them as regular days. Recording them now keeps the data forward-compatible with the rate-stack engine that arrives in a later slice.
- **Per-client splitting:** because every DTR row carries `assignment_id` (which carries `client_id`), a mid-period transfer naturally splits DTR per client. Required by [`memory/domains/workflows.md`](../../memory/domains/workflows.md) ("Commander Group critical: DTR must split per CLIENT").
- **Entry mode for Slice 1:** manual web form only. Biometric / QR / paper-OCR ingestion deferred to a later slice.
- **Emits:** `dtr.recorded` per entry, `dtr.period.closed` per period close.

### 5. `modules/payroll` — payroll run + payslip
- **Public API** (`modules/payroll/index.ts`):
  - `payroll.runPayroll(periodStart, periodEnd) → PayrollRun`
  - `payroll.getPayslip(employeeId, periodId) → Payslip`
  - `payroll.listPayslips(periodId) → Payslip[]`
- **Subscribes to:** `dtr.period.closed` — auto-runs payroll for the closed period (admin can also trigger manually).
- **Math (option (b), locked 2026-05-24):**
  - **Gross:** `(basicSalary / workDaysPerMonth) × daysWorked` + `(hourlyRate × otHours × 1.25)`
  - **Deductions:** SSS_EE, PhilHealth_EE, Pag-IBIG_EE, BIR withholding tax — each looked up against the rate tables seeded from v2's audited [`ref/compliance/seed-compliance.ts`](../../ref/compliance/seed-compliance.ts). BIR uses the bracket table that matches the employee's `payFrequency`.
  - **Net:** `gross − sum(deductions)`, floored at ₱0 (per v2 fix C-2 — heavily absent employees get ₱0, never negative).
- **Math NOT in Slice 1 (deferred to later slices):**
  - Holiday × rest-day rate stacks (BUG-A territory in v2 — comes back with the rate-stack engine)
  - NSD (Night Shift Differential) breakdown
  - 13th-month accrual
  - Leave credit deductions / monetization
  - Loan amortization deductions (Slice 6)
  - Manual adjustments without full re-generation
- **Rate tables:** seeded from v2's audited data **with regulator citations preserved**. We re-implement the lookup code clean (per [`memory/domains/compliance.md`](../../memory/domains/compliance.md) discipline: read v2, don't copy v2).
- **Pay run lifecycle:** `draft → calculated → locked`. Empty pay runs cannot be locked (per v2 fix ISSUE-C).
- **Emits:** `payroll.run.completed`, `payslip.generated` per employee.
- **Audit:** `audit.record` per employee processed, per run state change.

### 6. `modules/compliance-exports` — SSS R3 + BIR 2316
- **Public API** (`modules/compliance-exports/index.ts`):
  - `complianceExports.exportSSS_R3(periodId) → File`
  - `complianceExports.exportBIR_2316(employeeId, year) → File`
- **SSS R3:** generates the file in the shape SSS expects (current 2026 format — spec lookup is part of the implementation plan). Populated from Slice 1's payroll outputs.
- **BIR 2316:** per-employee annual tax certificate. Slice 1 demo will populate only the periods that exist in the current year (likely one or two). Module README documents that this is partial-year by design until more periods are run. Full year-end 2316 generation, alphalist, etc. arrive when CGoC actually closes a year.
- **Emits:** none. Read-only against payroll data.
- **Audit:** `audit.record` per export with actor, period/employee, export type.

### 7. Cross-cutting (Slice 1)
- **UX quality bar.** Every user-facing screen in Slice 1 is designed for non-technical CGoC staff — plain-language labels, plain-language errors, sensible defaults, progressive disclosure. No developer-shaped UI. Use the `frontend-design` skill when building each screen. Test: a payroll clerk completes the demo without coaching. (Project rule, not Slice-1-specific — applies to every slice going forward.)
- **No new roles.** Super-admin (seeded in Slice 0) does everything. Role split (hr-admin, payroll-admin, dtr-encoder) deferred to whichever slice first needs multi-user separation. Keeps the demo flow tight; resists feature creep.
- **No `tenant_id` columns** anywhere (per [ADR 0007](../decisions/0007-multi-tenancy.md)). `client_id` foreign keys where per-client configuration applies.
- **`.env.example`** updated to list any new env vars Slice 1 consumes (e.g. `WORK_DAYS_PER_MONTH` default).
- **Per-module README** in every new `modules/*/README.md`: Purpose / Public API / Dependencies / Known failure modes.
- **`directives/slice-1-bootstrap.md`** captures the SOP for the end-to-end demo (the same script in Done criteria below).

## Cross-module contracts

| Caller | Calls | Notes |
|---|---|---|
| `hr.bulkImportEmployees` | `audit.record`, `events.publish('hr.employee.created')` per row | one event per row imported |
| any | `assignments.assign` | emits `assignment.created` — same topic Recruitment publishes in Slice 3 |
| `dtr.closePeriod` | `events.publish('dtr.period.closed')` | payroll subscribes |
| `payroll.runPayroll` | `audit.record` per employee, `events.publish('payroll.run.completed')`, `events.publish('payslip.generated')` per employee | per v2 fix C-3, one employee failure does not abort the whole run |
| `compliance-exports.*` | reads payroll outputs, `audit.record` per export | exports are read-only against payroll data |
| every authed route | `auth.requireUser(req)` | Slice 0 primitive |

All cross-module calls go through `index.ts` per [AGENTS.md](../../AGENTS.md) modular construction rule 4. No module imports another module's internals.

## Done criteria

Slice 1 is done when **all** of the following are true:

1. Admin logs in (Slice 0 auth) and reaches a `/dashboard` route guarded by `auth.requireUser`.
2. Admin creates 1 Client + 1 Detachment via the UI.
3. Admin bulk-imports a 10-row CSV of guards. Pre-flight check rejects duplicate emails (per v2 fix M-3); per-row errors surface in the UI.
4. Admin assigns all 10 guards to the detachment with start dates.
5. Admin enters 15-day DTR for each guard via the web form.
6. Admin closes the DTR period → `dtr.period.closed` event fires → payroll auto-runs (or admin clicks "Run Payroll").
7. Admin views payslip for each guard — shows gross, the 4 deductions, and net. **Numbers match v2's payroll engine output for the same inputs, within ₱1 per line.** (V2 is already audited end-to-end against the regulator citations; matching v2 means we inherited that correctness without copying its code. ₱1 tolerance absorbs unavoidable rounding differences between two implementations — anything bigger is a real bug, not rounding.) A separate "golden-sample" check against CGoC's actual current payroll output is a pre-demo sign-off step, not a Done criterion.
8. Admin exports SSS R3 for the period — the file opens in the SSS R3 viewer (or Excel) without schema errors.
9. Admin exports BIR 2316 for one guard for the current year — the file matches the 2316 form layout.
10. Slice 0 smoke tests still pass (regression gate per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md) discipline rule #1).
11. Each new module has a `README.md` (Purpose / Public API / Dependencies / Known failure modes) and at least one smoke test.
12. CI is green on `main`.
13. Demo script in `directives/slice-1-bootstrap.md` walks end-to-end without opening the editor.
14. **UX bar:** a CGoC payroll clerk who has never seen the system before can complete the demo flow (steps 2–9 above) without coaching. Plain-language labels, plain-language errors, sensible defaults, no developer jargon visible to the end user. The `frontend-design` skill is used when building each screen.

If any of the above is not true, Slice 1 is not done.

## Discipline rules baked in (per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md))

- Slice 1 cannot break Slice 0's primitives — Slice 1's test suite re-runs Slice 0's smoke tests as a regression gate.
- This README precedes the code. If implementation discovers a gap (e.g. an SSS R3 field that needs DTR data we didn't model), this README is updated **before** the implementation diverges.
- Slice 1 ends when the demo passes end-to-end, not when the code "looks done."
- **V2-schema-first rule:** any new payroll/HR field must be checked against `ref/compliance/migrations/` and `ref/compliance/seed-compliance.ts` for the v2 shape **before** being introduced. V2 is already audited; diverging requires a documented reason. (Established 2026-05-24 after the `dailyRate` mis-recommendation during this slice's brainstorming.)

## Open questions resolved during brainstorming

- **Payroll math depth:** option **(b)** — realistic-enough (basic pay + simple OT + 4 statutory deductions), not full v2 parity (no rate stacks, no NSD, no 13th-month).
- **Rate basis:** `basicSalary` (monthly decimal) + `payFrequency` enum (`MONTHLY` | `SEMI_MONTHLY`), default `SEMI_MONTHLY`. Mirrors v2 (`ref/compliance/migrations/0000_short_loners.sql:33-34`). Daily rate is derived, not stored.
- **Period length:** demo uses one 15-day period. Payroll module does not hardcode period length — accepts any (start, end).
- **DTR status enum:** records `holiday-worked` / `restday-worked` but Slice 1 treats them as regular days. Forward-compatible with the rate-stack engine in a later slice.
- **BIR 2316 partial year:** export populates whatever periods exist in the year. Documented in module README.
- **Assignment authority:** Slice 1 super-admin writes directly. Slice 3 moves authority to Recruitment without changing the module API.
- **No roles in Slice 1.** Super-admin only.

## Out of scope (do not creep)

- Per-client rate tables → **Slice 2**
- Invoicing / billing → **Slice 2**
- Recruitment / ATS / blacklist → **Slice 3**
- Biometric / QR / paper-OCR DTR ingestion → later slice
- Holiday × rest-day rate stacks, NSD breakdown, 13th-month accrual → later slice (rate-stack engine)
- Leave management, leave credits, leave monetization → later slice
- Loans + loan-deduction integration with payroll → **Slice 6**
- PhilHealth + Pag-IBIG remittance file exports (Slice 1 ships SSS R3 only)
- Alphalist + BIR 1601-C → later slice
- Printable payslip PDF — HTML view only in Slice 1
- Bulk payslip email delivery
- Role/permission engine — super-admin only
- Salary history, benefits enrollment, performance reviews, 201-file documents
- Manual payroll adjustments without full re-generation
- Multi-period BIR 2316 reconciliation across prior years
