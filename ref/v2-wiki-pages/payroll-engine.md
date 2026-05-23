---
tags: [payroll, engine, calculations, audit, compliance]
last_updated: 2026-05-21
sources: [AUDIT.md]
---

# Payroll Engine

The payroll engine is the computational core of TAOLINK — it ingests employee records, attendance data, loans, and government rate tables, and produces a sealed pay ledger with the correct Philippine statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR withholding tax) plus 13th-month pay, holiday/rest-day premiums, NSD, OT, and loan amortizations. It runs as a chunked background job (200 employees per transaction) and is designed for scale up to ~10,000 employees. Per [AUDIT.md](../../AUDIT.md), as of 2026-03-29 the engine is **production-ready** — every known calculation bug has been resolved.

## Production verdict

Per [AUDIT.md → CURRENT VERDICT](../../AUDIT.md):

- All **10** original critical bugs (Phases 1–7) — fixed.
- All **5** post-audit issues (2026-03-28) — fixed.
- All **14** re-audit issues (2026-03-29) — fixed.
- Of 18 re-audit items raised, 4 turned out to be false positives (already correct in code): BIR 1601-C DRAFT filter, ESS payslip ownership scoping, workDays JSON range validation, and `Asia/Manila` timezone usage.
- 2 items were explicitly **not fixed by design** (holiday multipliers in code — DB row already carries `workedMultiplier`; silent encryption failures — already logged via `logger.error`).

No open calculation errors remain. The verified calculations cover basic pay, mid-period proration, absence deduction, all OT/holiday/rest-day rate stacks, NSD, every statutory contribution, withholding tax, 13th month, and loan deductions — see [AUDIT.md → VERIFIED CORRECT CALCULATIONS](../../AUDIT.md) for the full rate table.

## Resolved bugs

### Zero-salary and negative-pay protection
- **C-1 — Zero-salary silently processed.** `src/modules/payroll/service.ts`: `calculateEmployeePayrollData` now throws early when `basicSalary <= 0`; the outer try-catch catches, skips, logs, and records the skip in the audit trail.
- **C-2 — Negative net pay from prorated absence + statutory deductions.** `src/modules/payroll/service.ts`: `grossPay`, `netPay`, and `finalNetPay` are floored at `Math.max(0, ...)`. A heavily absent employee gets ₱0, not a negative ledger row.
- **C-3 — Per-employee null guard in generation loop.** `src/modules/payroll/service.ts`: each employee is wrapped in try-catch; one failure no longer aborts the whole 10k run.

### CSV export and reporting
- **H-2 — CSV export not cross-validated.** `src/app/api/pay-runs/[id]/export-csv/route.ts`: a TOTAL row is appended so HR can verify column sums against stored Gross Pay / Total Deductions / Net Pay.
- **L-1 — Trend chart renders incorrectly under 2 runs.** `src/app/(admin)/payroll-summary/page.tsx`: chart renders only when `trends.length >= 2`; placeholder text otherwise; `maxVal > 0` guard prevents division-by-zero.

### Concurrent loans and loan integrity
- **H-3 — Unlimited concurrent loans with no warning.** `src/modules/loans/actions.ts`: `createLoanAction` warns (soft, not hard-blocked) when combined active amortizations exceed 50% of monthly salary.
- **M-7 — Payroll void deletes loan payment history.** `src/modules/loans/schema.ts`, `src/modules/loans/service.ts`, `src/db/migrations/0013_loan_payment_reversed.sql`: introduced a `reversedAt` column; voids now UPDATE rather than DELETE; idempotency guard skips already-reversed payments.
- **ISSUE-B — Future-start loans deducted in current run.** `src/modules/payroll/service.ts`: batch loan fetch now includes `lte(hrLoans.startDate, run.endDate)`.

### Compliance rate management
- **H-4 — Duplicate `effectiveDate` on compliance rates.** `src/modules/compliance/actions.ts`: both `updatePhilhealthAction` and `updatePagibigAction` pre-check for a row with the same `effectiveDate` and reject duplicates.
- **M-8 — No audit log for compliance rate changes.** `src/modules/compliance/actions.ts`: `AuditService.log(UPDATE_COMPLIANCE_RATE)` now fires on PhilHealth and Pag-IBIG updates with acting user, entity ID, and rate values.

### Pay run lifecycle
- **ISSUE-C — Empty pay run lockable.** `src/modules/payroll/actions.ts`: `lockPayRunAction` counts ledger entries first; refuses if zero.
- **BUG-A — Holiday on Rest Day, 260% rule.** `src/modules/payroll/service.ts`: changed `else if` to a three-way branch so Regular Holiday on rest day stacks to 2.60×, Special NW on rest day to 1.69×; both rate multiplier and `holidayPay` premium use the stacked value.
- **ISSUE-E — Pay Runs list in-memory pagination.** `src/modules/payroll/report-service.ts`, `src/app/(admin)/pay-runs/page.tsx`: added `PayrollReportService.getPayRunsPaginated()` for DB-side filter/sort/pagination.

### Bulk-import and ESS-side data hygiene
- **M-3 — Bulk import email uniqueness not checked.** `src/modules/employees/bulk-import-action.ts`: pre-fetches all existing employee emails and checks both DB and in-batch duplicates with per-row errors.
- **M-4 — Backdated leave via direct POST.** `src/modules/leave/actions.ts`: `applyLeaveAction` (ESS) rejects any `startDate` before today; admin path unaffected.
- **ISSUE-D — Cannot cancel an approved leave.** `src/modules/leave/service.ts`, `src/modules/leave/actions.ts`, `src/app/(admin)/leaves/leave-action-buttons.tsx`, `src/app/(admin)/leaves/page.tsx`: added transactional `LeaveService.cancelLeave()` (restores `usedCredits` for paid leave, sets `CANCELLED`), exposed via Cancel button in Leave History.

### Worker / job queue
- **M-5 — Stale jobs loop forever on crash.** `src/db/schema/bg-jobs-schema.ts`, `src/workers/index.ts`, `src/db/migrations/0012_bg_jobs_attempts.sql`: added `attemptCount`; worker increments on each start; recovery marks FAILED after `MAX_JOB_ATTEMPTS` (3).

For the full list of legacy fixes (the original 10 critical bugs — wrong SSS/PhilHealth/Pag-IBIG halving for MONTHLY employees, double-paid unworked regular holidays, etc.), see [AUDIT.md → PREVIOUSLY FIXED BUGS (Phases 1–7)](../../AUDIT.md).

## What this means for TAOLINK v2

Payroll math is already audited and clean — the engine itself does not need further work in v2. The verified calculation set covers the Labor Code, RA 11223 (PhilHealth), RA 9679 (Pag-IBIG), TRAIN Law withholding, and PD 851 (13th month). Scale handling (chunking, `SELECT FOR UPDATE SKIP LOCKED`, index coverage, 10-minute worker guard) is in place per [AUDIT.md → SCALE VERIFICATION](../../AUDIT.md).

V2 effort should therefore focus on areas **outside** the payroll engine:

- **Pre-launch data ops** — running `src/db/seed-compliance.ts` against production, seeding the `gov_holidays` table for the active year, verifying any 2026 SSS/PhilHealth rate circulars (per [AUDIT.md → PRE-LAUNCH DATA REQUIREMENTS](../../AUDIT.md)).
- **Operational visibility** — Phase 1 items: dashboard KPIs (employees without shifts, loans nearing default, upcoming pay run), NSD breakdown report, leave balance export.
- **Compliance & offboarding** — Phase 2 items: employee offboarding flow (final payslip, VL monetization, separation pay), BIR 2316 / Alphalist generation, salary history report.
- **Operational efficiency** — Phase 3 items: manual payroll adjustments without full regeneration, bulk payslip email distribution, leave credit auto-allocation cron, NSD report.
- **Non-payroll product gaps** — performance management, recruitment/ATS, training/LMS, native mobile, live biometric sync (see [taolink-overview](./taolink-overview.md) "What's NOT built").

## See also

- [AUDIT.md](../../AUDIT.md) — primary source for this page.
- [taolink-overview](./taolink-overview.md) — top-level product page.
- [wiki/sources/README.md](../sources/README.md) — index of raw source documents.
- [memory/domains/product.md](../../memory/domains/product.md) — product-domain memory and decisions.
