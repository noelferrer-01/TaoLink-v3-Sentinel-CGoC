# modules/payroll

## Purpose

Computes payslips for a payroll period using each guard's daily time records (DTR) and the latest Philippine statutory rates, then saves the results as an immutable pay run record.

## Public API

Import from the module entry point only — never reach into `service.ts` or `compute.ts` directly.

```ts
import { payroll, type PayRun, type Payslip } from '@/modules/payroll';
// or named imports:
import { runPayroll, lockPayRun, getPayslip, listPayslips, initPayrollSubscriptions } from '@/modules/payroll';
```

| Function | Signature | What it does |
|---|---|---|
| `runPayroll` | `(periodStart, periodEnd, opts?) => Promise<PayRun>` | Runs a full payroll for every active employee in the given period. Inserts or upserts the `pay_runs` row, deletes any prior payslips for that period, then computes and persists one payslip per active employee. Audits `payroll.run.completed`; publishes `payroll.run.completed`. |
| `lockPayRun` | `(payRunId, opts?) => Promise<PayRun>` | Marks a pay run as locked. Locked runs are immutable — no further changes are allowed via the API. Throws if there are no payslips yet (run first) or if the run is already locked. Audits `payroll.run.locked`; publishes `payroll.run.locked`. |
| `getPayslip` | `(id) => Promise<Payslip \| null>` | Fetch a single payslip by its primary key. Returns `null` if not found — never throws on a missing row. |
| `listPayslips` | `({ payRunId?, employeeId? }) => Promise<Payslip[]>` | List payslips matching the filter. At least one filter key is required; calling with `{}` throws. When filtering by `employeeId` only, results are returned newest first. |
| `initPayrollSubscriptions` | `() => void` | Idempotent. Subscribes to the `dtr.period.closed` event so that closing a DTR period automatically triggers `runPayroll`. Calling more than once is safe — the second call is a no-op. Call this once at app start. |
| `_resetPayrollSubscriptionsForTests` | `() => void` | Test helper. Undoes `initPayrollSubscriptions` so test suites can call init again with a clean slate. Do not use in production code. |
| `computePayrollLine` | `(input: PayrollComputeInput) => Promise<PayrollComputeResult>` | Pure async math function — no database access. Takes salary, days worked, OT hours, pay frequency, and rate closures; returns gross pay, each statutory deduction, net pay, and a detailed breakdown object. Used internally by `runPayroll` but exported so unit tests can verify the math without a database. |

Types re-exported from the entry point: `PayRun`, `NewPayRun`, `Payslip`, `NewPayslip`, `PayrollComputeInput`, `PayrollComputeResult`, `PayrollRates`, `PayrollFrequency`.

## Dependencies

- **Other modules:**
  - `@/modules/compliance` — statutory rate lookups (SSS, PhilHealth, Pag-IBIG, BIR WTAX).
  - `@/modules/hr` — employee master (basic salary, pay frequency, status).
  - `@/modules/dtr` — daily time record entries (days worked per period).
  - `@/modules/audit` — records every mutation and every per-employee failure to `audit_log`.
  - `@/modules/events` — publishes `payslip.generated`, `payroll.run.completed`, and `payroll.run.locked`; subscribes to `dtr.period.closed`.
  - `@/modules/clients` and `@/modules/assignments` are **indirect** dependencies — DTR rows reference them but payroll does not read those tables directly.

- **Env vars:**
  - `DATABASE_URL` (required) — Postgres connection string.
  - `WORK_DAYS_PER_MONTH` (optional, default `26`) — number of working days per month used to compute the daily rate. See the Conventions section below.

- **External services:** none.

- **Tables owned:** `pay_runs`, `payslips`. Enum: `pay_run_status` (`draft` → `calculated` → `locked`).

## Conventions

These are decisions baked into the engine that are not obvious from reading the code. Payroll clerks: the first two are the most important to understand.

### 1. Semi-monthly deduction timing

Philippine law states SSS, PhilHealth, and Pag-IBIG contributions as **monthly** amounts. When a guard is paid twice a month (15th and 30th cuts), Sentinel applies the **full monthly deduction only on the final cut** (the 30th or 31st). The 15th cut has zero statutory deductions.

This means a guard's 15th-cut payslip shows higher take-home pay — the deductions are held back until the end-of-month cut. This is intentional and matches v2 behaviour.

The engine auto-detects which cut it is: if `periodEnd` falls on day 28 or later, it is treated as the final cut. You can override this by passing `opts.isFinalCutOfMonth` explicitly.

### 2. Work days per month default = 26

The daily rate formula is `basicSalary ÷ workDaysPerMonth`. The default of **26 days** reflects the Commander Group of Companies standard for security guards (6-day work week × approximately 4.33 weeks). This can be adjusted via the `WORK_DAYS_PER_MONTH` environment variable.

Important: once a pay run is created, its `work_days_per_month` value is locked to what was set at the time. Re-running the same period keeps the **original** value so old payslips remain reproducible.

### 3. Zero days worked = zero net pay

If a guard has no DTR entries in the period, their gross pay computes to zero. Even if statutory deductions are calculated (e.g. for reporting purposes), the engine clamps `netPay` to `max(0, gross - deductions)` — so a payslip can never show a negative amount. This was a fix from v2 (C-2), after a payslip showing "₱-1,550" confused payroll clerks.

### 4. One employee's failure does not stop the whole run

Each employee's payslip computation is wrapped in its own error handler. If an individual employee fails (e.g. missing salary data, DB error), the failure is recorded in `audit_log` with action `payroll.line.failed` and the error message, and the run continues with the remaining employees. The final `pay_run` row will still show `calculated` status.

To inspect failed lines after a run, query `audit_log` for `action = 'payroll.line.failed'` and `target` matching the `pay_run` period.

### 5. Re-running a period wipes prior payslips

Calling `runPayroll('2026-05-16', '2026-05-31')` a second time reuses the same `pay_run` record (same `id`) but **deletes all payslips for that run and recomputes them from scratch**. This lets a payroll clerk correct a DTR error and re-run without leaving orphaned rows in the database.

**Follow-up note:** The lock guard in `lockPayRun` prevents re-locking a run, but `runPayroll` itself does not check whether the existing pay run is locked before deleting payslips. A re-run on a locked period would silently wipe and recompute payslips, then reset the status to `calculated`. This is a known gap in Slice 1 — a lock-check guard on `runPayroll` should be added before any locked pay run goes to production.

### 6. Statutory rates use the period end date

When looking up SSS, PhilHealth, Pag-IBIG, and BIR rates, the engine passes `periodEnd` as the `asOf` date to the compliance service. The compliance service returns the most recent rate row effective on or before that date.

For example, a run covering May 16–31, 2026 looks up rates effective on or before May 31, 2026. If a rate change takes effect mid-period, the engine uses the rate that was active at the end of the period.

### 7. Employee status filter

Only employees whose status is **not** `applicant` or `terminated` receive a payslip. All other statuses (e.g. `hired`, `active`, `on_leave`) are included. The exact filter is `NOT IN ('applicant', 'terminated')` applied to the `employees` table at the start of each run.

## Known failure modes

### "This pay run has no payslips. Run the calculation first before locking."
`lockPayRun` was called before `runPayroll`. Call `runPayroll` first, then lock.

### "This pay run is already locked (locked at ...)."
Locking is one-way. Once a pay run is locked, it cannot be unlocked via the API. Manual DB intervention would be required. Do not call `lockPayRun` twice on the same run.

### "Pay run not found: \<id\>"
The `payRunId` passed to `lockPayRun` does not exist. Check for a typo in the id. Note that `pay_runs` has no soft-delete in Slice 1 — a missing id means either a typo or the row was hard-deleted.

### "listPayslips requires at least one of payRunId or employeeId"
`listPayslips({})` was called with an empty filter. Always pass at least one of `payRunId` or `employeeId`.

### Statutory rates missing for the period — silent zero deductions
If the compliance tables have no row effective on or before `periodEnd`, the rate functions return `0` or `null`. Symptom: all payslips in the run show zero SSS, PhilHealth, Pag-IBIG, and BIR WTAX deductions. The engine does not raise an error — it proceeds with zeros.

Fix: run `pnpm db:seed-compliance` and confirm the seed covers the relevant effective dates. Then re-run the payroll period.

### `audit_log` rows cannot be deleted in tests
A database-level immutability trigger blocks `DELETE` on `audit_log`. Test suites capture a `testStart` timestamp before each test and filter audit assertions by `createdAt >= testStart` instead of wiping the table.

### `String(undefined)` returns the truthy string `"undefined"`
Caught in `subscriptions.ts` during input validation. Using `if (!x)` after `String(x)` will not catch an `undefined` input because `String(undefined)` produces the non-empty string `"undefined"`. Always validate with `typeof x !== 'string'` before trusting string inputs from event payloads. The current code uses `typeof rawStart !== 'string'` correctly — do not regress this.

## Reconciliation gate

`wiki/slices/1-first-payslip-reconciliation.md` contains three hand-computed reference cases (₱14k, ₱18k, ₱28k monthly basic, SEMI_MONTHLY final cut, 13 days worked) that the engine reproduces at **zero deviation**. This is Done criterion #7 of the Slice 1 contract.

Re-run after any change to payroll math:

```bash
env $(grep -v '^#' .env | xargs) pnpm test modules/payroll/reconciliation.test.ts
```
