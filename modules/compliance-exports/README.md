# modules/compliance-exports

## Purpose

Project Sentinel's payroll engine produces deterministic, audited per-period payslips. This module turns those payslips into the **government-required filing artifacts** every Philippine employer must submit. Slice 2 ships:

- **SSS R-3** (Contribution Collection List) — quarterly, per pay run for now.
- **BIR Form 2316** (Certificate of Compensation Payment / Tax Withheld) — annual, per employee, rendered as a PDF via `@react-pdf/renderer`.

The module owns the format mapping; the payroll engine owns the math. Format docs live alongside the code so the mapping rules are visible without leaving the module.

## Public API

```ts
import { complianceExports } from '@/modules/compliance-exports';
```

| Function | Signature | What it does |
| --- | --- | --- |
| `exportSSS_R3` | `(payRunId, opts?) => Promise<{ csv, rows, warnings }>` | Emits the SSS R-3 CSV for a single pay run. Combined SS = EE + ER (regular + WISP); EC = ₱30 if MSC ≥ ₱14,500 else ₱10. Values land in the calendar-month column (1st/2nd/3rd) within the quarter. |
| `exportBIR_2316` | `(employeeId, year, opts?) => Promise<{ pdf: Buffer; warnings: string[] }>` | Renders a BIR Form 2316 PDF for one employee × one calendar year. Aggregates YTD from LOCKED pay runs only. Warnings surface missing fields (RDO, DOB, address, TIN) and data gaps (no locked runs) — a PDF is always returned. |
| `computeYtd` | `(employeeId, year) => Promise<YtdAggregate>` | Single-query YTD aggregation across locked pay runs in a year (gross, SSS-EE, PhilHealth-EE, Pag-IBIG-EE, wtax, net, payRunCount). |

Format specs:
- [SSS_R3_FORMAT.md](./SSS_R3_FORMAT.md) — column order, derivation rules, partial-quarter handling.
- [BIR_2316_FORMAT.md](./BIR_2316_FORMAT.md) — field list, partial-year caveat, deferred items.

## Dependencies

- **Env:**
  - `DATABASE_URL` (transitively).
  - `EMPLOYER_TIN`, `EMPLOYER_NAME`, `EMPLOYER_ADDRESS`, `EMPLOYER_ZIP`, `EMPLOYER_RDO` — surfaced on the 2316 employer block. Sensible defaults are baked in for the CGoC demo; production should override.
- **Modules:**
  - `@/modules/payroll` — reads `pay_runs` + `payslips`.
  - `@/modules/hr` — reads `hr_employees` (including the statutory ID columns added in migration `0008_slice1_statutory_ids` and BIR fields in Phase 1.3).
  - `@/modules/compliance` — derives SSS ER share + EC contribution from version-pinned rate tables.
  - `@/modules/audit` — records every export with action `compliance.export.sss_r3` / `compliance.bir2316.exported`.
- **Tables read:** `pay_runs`, `payslips`, `hr_employees`, `comp_sss_brackets`.
- **npm:** `@react-pdf/renderer@^4` — pure JS, no Chromium required.

## Design notes

### Why ER/EC are derived, not stored
Payslips only persist the **employee** share of statutory contributions because that's what affects net pay. The **employer** SS share and the (employer-only) EC contribution are recomputed at export time using the same `comp_sss_brackets` row the payroll engine used for `sssEE`. The `effective_from` date pinning on the compliance corpus guarantees the derivation is reproducible.

### Why R-3 is per-pay-run in Slice 1
The R-3 filing is quarterly. Sentinel exports per pay run; the HR clerk combines three monthly CSVs externally for filing. A `exportSSS_R3_Quarter(year, quarter)` wrapper is deferred to a later slice.

### YTD aggregator uses LOCKED runs only
`computeYtd` and `exportBIR_2316` only aggregate payslips whose `pay_runs.status = 'locked'`. Draft and calculated runs are excluded. This mirrors BIR's requirement that only finalised payrolls count toward the annual certificate.

### Missing-data policy
Exports do not block on missing fields. For R-3, missing SSS numbers produce `MISSING` sentinels. For 2316, missing RDO / DOB / address / TIN produce blank PDF fields and surface in the returned `warnings` array. Callers (Phase-8 UI) display warnings so an HR clerk can fix and re-run before filing.

## Known failure modes

### `Pay run not found: <id>` (R-3)
**Trigger:** `exportSSS_R3` called with a `payRunId` that does not exist.
**Fix:** caller validates the id (typically by listing pay runs first in the UI).

### `Employee not found: <id>` (2316)
**Trigger:** `exportBIR_2316` called with an unknown employee id.
**Fix:** caller validates the id.

### PDF generation requires `@react-pdf/renderer` (pure JS, no Chromium)
**Trigger:** `@react-pdf/renderer` is missing or the wrong version is installed.
**Error:** `Cannot find module '@react-pdf/renderer'` or React 19 fiber crash.
**Fix:** ensure `@react-pdf/renderer@^4` is installed (`pnpm add @react-pdf/renderer@^4`). Version 3.x does not support React 19 — use 4.x.

### Year has no locked pay runs → PDF with zeros
**Symptom:** `pdf` is valid, `warnings` includes `"No locked pay runs for {year} — PDF generated with zero values"`.
**Why:** correct behavior — all fields are zero/blank. The PDF is still usable as a proof of zero withholding but is not a BIR-compliant year-end certificate.
**Fix:** lock at least one pay run for the year before exporting for filing.

### RDO / DOB / address missing → blank PDF field
**Symptom:** `pdf` renders but RDO/DOB/address boxes are empty; `warnings` includes the relevant message (e.g. `"RDO code missing"`).
**Fix:** edit the employee record to fill in the missing field, then re-export.

### Salary outside any SSS bracket (R-3)
**Symptom:** R-3 row shows `0.00` SS + EC, warning recorded.
**Trigger:** employee's `basic_salary` falls outside the brackets seeded for the period's `asOf` date.
**Fix:** verify the compliance seed includes a bracket covering the salary (the standard 2025-01-01 seed covers ₱4,250–unlimited via MSC ₱5,000–₱30,000+).

## Tests

- [sss-r3.test.ts](./sss-r3.test.ts) — 5 cases: happy path, missing SSS, empty run, audit/event, unknown run.
- [ytd.test.ts](./ytd.test.ts) — 4 cases: sums locked runs, excludes draft runs, zero aggregate, year boundary exclusion.
- [bir-2316.test.ts](./bir-2316.test.ts) — 6 cases: happy path (PDF + no field warnings), missing RDO, zero pay runs, unlocked run excluded, unknown employee throws, audit entry written.

Run: `env $(grep -v '^#' .env | xargs) pnpm test modules/compliance-exports`.

## Followups (Slice 2+)

1. `exportSSS_R3_Quarter(year, quarter)` — aggregate three pay runs into one filing-ready CSV.
2. BIR 2316 IVB line-item breakdown (basic, OT, holiday, 13th-month, COLA, de minimis) — requires payslip schema enrichment.
3. SSS RF-1 (PhilHealth) and HDMF M1-1 exports — same pattern, different formats.
4. Quarter-aware `partialYear` flag for 2316.
5. Phase-8 UI banner: show warnings returned by `exportBIR_2316` above the download button.
