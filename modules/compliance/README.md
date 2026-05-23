# modules/compliance

## Purpose

Stores and exposes Philippine statutory rate tables (SSS, PhilHealth, Pag-IBIG, BIR WTAX) used by the payroll engine to compute mandatory deductions.

## Public API

Import from the module entry point only — never reach into `service.ts` directly.

```ts
import { compliance } from '@/modules/compliance';
// or named imports:
import { sssBracketForMonthly, philhealthEE, pagibigEE, wtaxMonthly } from '@/modules/compliance';
import type { WtaxFreq } from '@/modules/compliance';
```

All helpers are async and hit the database. The `asOf` parameter is an ISO date string (`'YYYY-MM-DD'`). Every lookup uses the most recent rate row whose `effectiveDate ≤ asOf`, so historical payroll runs stay stable as new rates are seeded.

| Export | Signature | Returns |
|---|---|---|
| `sssBracketForMonthly` | `(monthlySalary: number, asOf: string) => Promise<SssBracket \| null>` | The matching SSS bracket row (with MSC, EE/ER contributions, WISP columns), or `null` if no bracket contains `monthlySalary`. |
| `philhealthEE` | `(monthlySalary: number, asOf: string) => Promise<number>` | Employee PhilHealth share (50 % of `rate × clamped_basis`), rounded to 2 decimal places. Returns `0` if no config row found. |
| `pagibigEE` | `(monthlySalary: number, asOf: string) => Promise<number>` | Employee Pag-IBIG contribution (`eeRate × min(salary, salaryCap)`), rounded to 2 decimal places. Returns `0` if no config row found. |
| `wtaxMonthly` | `(taxableMonthly: number, freq: WtaxFreq, asOf: string) => Promise<number>` | Withholding tax computed from the applicable BIR bracket (`baseTax + percentageOver × excess`), rounded to 2 decimal places. Returns `0` if no bracket found. |
| `WtaxFreq` | `type WtaxFreq = 'MONTHLY' \| 'SEMI_MONTHLY'` | Discriminant for BIR table selection. |

The seeder (`seedComplianceRates`) is **not** exported from `index.ts`. It is CLI-only, invoked via `pnpm db:seed-compliance`. Do not import it at runtime.

Citations (statutory basis for rates, brackets, and effective dates) are in [`schema.ts`](./schema.ts) and [`seed.ts`](./seed.ts) — the seed file holds the actual statutory data.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** none.
- **Tables:** `comp_sss_brackets`, `comp_philhealth_config`, `comp_pagibig_config`, `comp_wtax_brackets`.

## Known failure modes

### NOT NULL violation on `ee_share_wisp` / `er_share_wisp`
**Error:** `null value in column "ee_share_wisp" violates not-null constraint`
**Fix:** Seed inserts must explicitly pass `'0.00'` for both WISP columns on all sub-₱20,000 (non-WISP) brackets.

### Unique constraint violation on re-seed
**Error:** `duplicate key value violates unique constraint "comp_philhealth_eff_uq"` (or `comp_pagibig_eff_uq` / `comp_sss_msc_eff_uq`)
**Fix:** Delete rows for the target `effective_date` before inserting — the idempotency pattern mandated by the seeding task.

### `wtax_frequency` enum already exists on migration retry
**Error:** `ERROR: type "wtax_frequency" already exists`
**Fix:** Ensure the migration's down-step (or any manual rollback) includes `DROP TYPE wtax_frequency` before re-applying the migration.

### Missing rate row at `asOf` — silent zero returned
**Error:** No explicit error. `philhealthEE`, `pagibigEE`, and `wtaxMonthly` return `0`; `sssBracketForMonthly` returns `null`, when `asOf` predates the earliest seeded `effective_date` or no bracket matches the given salary.
**Risk:** Payroll code that doesn't validate the result will compute deductions of `0`, producing a legally incorrect payslip with no exception raised.
**Fix:** Callers must check for `null` / `0` before using the result. Payroll service code should bail out with a descriptive error (e.g. `"No SSS bracket found for salary X as of Y — seed missing?"`) rather than proceeding with a zero deduction.
