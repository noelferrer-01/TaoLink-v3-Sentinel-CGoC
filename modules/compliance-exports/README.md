# modules/compliance-exports

## Purpose

Project Sentinel's payroll engine produces deterministic, audited per-period payslips. This module turns those payslips into the **government-required filing artifacts** every Philippine employer must submit. Slice 1 ships two of them:

- **SSS R-3** (Contribution Collection List) — quarterly, per pay run for now.
- **BIR Form 2316** (Certificate of Compensation Payment / Tax Withheld) — annual, per employee.

The module owns the format mapping; the payroll engine owns the math. Format docs live alongside the code so the mapping rules are visible without leaving the module.

## Public API

```ts
import { complianceExports } from '@/modules/compliance-exports';
```

| Function | Signature | What it does |
| --- | --- | --- |
| `exportSSS_R3` | `(payRunId, opts?) => Promise<{ csv, rows, warnings }>` | Emits the SSS R-3 CSV for a single pay run. Combined SS = EE + ER (regular + WISP); EC = ₱30 if MSC ≥ ₱14,500 else ₱10. Values land in the calendar-month column (1st/2nd/3rd) within the quarter. |
| `exportBIR_2316` | `(employeeId, year, opts?) => Promise<BIR2316Export>` | Returns the structured annual 2316 Part IVA summary for one employee × one calendar year. Annual tax due via monthly-bracket equivalence. |

Format specs:
- [SSS_R3_FORMAT.md](./SSS_R3_FORMAT.md) — column order, derivation rules, partial-quarter handling.
- [BIR_2316_FORMAT.md](./BIR_2316_FORMAT.md) — field list, partial-year caveat, deferred items.

## Dependencies

- **Env:**
  - `DATABASE_URL` (transitively).
  - `EMPLOYER_TIN`, `EMPLOYER_NAME`, `EMPLOYER_ADDRESS` — surfaced on the 2316 employer block. Sensible defaults are baked in for the CGoC demo; production should override.
- **Modules:**
  - `@/modules/payroll` — reads `pay_runs` + `payslips`.
  - `@/modules/hr` — reads `hr_employees` (including the statutory ID columns added in migration `0008_slice1_statutory_ids`).
  - `@/modules/compliance` — derives SSS ER share + EC contribution + annualised BIR tax from the version-pinned rate tables.
  - `@/modules/audit` — records every export with action `compliance.export.{sss_r3,bir_2316}`.
  - `@/modules/events` — publishes the same topics.
- **Tables read:** `pay_runs`, `payslips`, `hr_employees`, `comp_sss_brackets`, `comp_wtax_brackets`.

## Design notes

### Why ER/EC are derived, not stored
Payslips only persist the **employee** share of statutory contributions because that's what affects net pay. The **employer** SS share and the (employer-only) EC contribution are recomputed at export time using the same `comp_sss_brackets` row the payroll engine used for `sssEE`. The `effective_from` date pinning on the compliance corpus guarantees the derivation is reproducible.

### Why R-3 is per-pay-run in Slice 1
The R-3 filing is quarterly. Sentinel exports per pay run; the HR clerk combines three monthly CSVs externally for filing. A `exportSSS_R3_Quarter(year, quarter)` wrapper is deferred to a later slice.

### Why annual BIR tax uses the monthly brackets
The TRAIN-law monthly brackets in `comp_wtax_brackets` have boundaries at `annual_boundary / 12`. So `wtaxMonthly(annualTaxable / 12) × 12` equals the annual tax that an explicit annual bracket would produce. Adding an `ANNUAL` value to `wtax_frequency` + seeding annual rows would work too, but is unnecessary duplication for the same numbers.

### Missing-data policy
Exports do not block on missing IDs (`sss_number`, `tin_number`). The row is emitted with a sentinel (`MISSING` for R-3, `null` for 2316) and the issue surfaces in the returned `warnings` array. Callers (Phase-8 UI) display warnings so an HR clerk can fix and re-run before filing.

## Known failure modes

### `Pay run not found: <id>` (R-3)
**Trigger:** `exportSSS_R3` called with a `payRunId` that does not exist.
**Fix:** caller validates the id (typically by listing pay runs first in the UI).

### `Employee not found: <id>` (2316)
**Trigger:** `exportBIR_2316` called with an unknown employee id.
**Fix:** caller validates the id.

### Partial-year 2316 always surfaces a warning
**Symptom:** every 2316 generated mid-year carries a `partial-year coverage` warning.
**Why:** this is correct behavior — BIR filing requires a full-year 2316. The export is usable as an in-year preview / proof of withholding, but the warning must be honored before filing.

### Salary outside any SSS bracket
**Symptom:** R-3 row shows `0.00` SS + EC, warning recorded.
**Trigger:** employee's `basic_salary` falls outside the brackets seeded for the period's `asOf` date.
**Fix:** verify the compliance seed includes a bracket covering the salary (the standard 2025-01-01 seed covers ₱4,250–unlimited via MSC ₱5,000–₱30,000+).

## Tests

- [sss-r3.test.ts](./sss-r3.test.ts) — 5 cases: happy path, missing SSS, empty run, audit/event, unknown run.
- [bir-2316.test.ts](./bir-2316.test.ts) — 5 cases: multi-period aggregation + tax-due correctness for the zero bracket, missing TIN, empty year, unknown employee, audit/event.

Run: `env $(grep -v '^#' .env | xargs) pnpm test modules/compliance-exports`.

## Followups (Slice 2+)

1. `exportSSS_R3_Quarter(year, quarter)` — aggregate three pay runs into one filing-ready CSV.
2. BIR 2316 IVB line-item breakdown (basic, OT, holiday, 13th-month, COLA, de minimis) — requires payslip schema enrichment.
3. BIR 2316 RDO code, date of birth, registered address, contact number on the employee record.
4. PDF rendering of 2316 once the IVB fields land.
5. SSS RF-1 (PhilHealth) and HDMF M1-1 exports — same pattern, different formats.
6. Quarter-aware `partialYear` flag for 2316 — current heuristic is "< 24 semi-monthly slips"; a calendar-aware aggregator would catch gaps in the middle of the year.
