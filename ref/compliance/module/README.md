# Compliance

## Purpose
Owns the Philippine statutory **rate tables and holiday calendar** that drive payroll deductions and government reports (SSS, PhilHealth, Pag-IBIG, BIR withholding tax, holidays).

## Public API
Server actions (`src/modules/compliance/actions.ts`) — SUPER_ADMIN only, all log to audit:
- `updatePhilhealthAction` — inserts a new PhilHealth config row (rate, floor, ceiling, effectiveDate).
- `updatePagibigAction` — inserts a new Pag-IBIG config row (eeRate, erRate, salaryCap, effectiveDate).
- `cloneSssScheduleAction(effectiveDate)` / `addSssBracketAction` / `updateSssBracketAction` / `deleteSssBracketAction` — manages the SSS contribution table brackets.
- `cloneWtaxScheduleAction` / `addWtaxBracketAction` / `updateWtaxBracketAction` / `deleteWtaxBracketAction` — manages the BIR withholding-tax brackets (MONTHLY + SEMI_MONTHLY).

Holiday actions (`src/modules/compliance/holiday-actions.ts`) — SUPER_ADMIN + HR_ADMIN:
- `addHolidayAction` / `deleteHolidayAction` — manage the holiday calendar. Multipliers are hard-coded from the Labor Code (`REGULAR` 2.00/1.00, `SPECIAL_NON_WORKING` 1.30/0.00, `SPECIAL_WORKING` 1.30/0.00) — see `holiday-actions.ts:14-18`.

`ComplianceService` (`src/modules/compliance/service.ts`) — read-only consumers (payroll calls these):
- `getSssTable(effectiveDate?)`, `getSssEffectiveDates()`
- `getPhilhealthConfig()`, `getPhilhealthHistory()`
- `getPagibigConfig()`, `getPagibigHistory()`
- `getWtaxTable(frequency, effectiveDate?)`, `getWtaxEffectiveDates()`
- `getDeMinimisCeilings()`
- `calculateSssContribution(taxableIncome)` — bracket lookup helper used by payroll.

## Dependencies
- **Other modules:** `@/modules/audit/service` (logs every rate change for BIR audit trail).
- **Libraries:** `drizzle-orm`, `uuid`, `@/lib/auth-utils` (`requireRole`), `@/lib/safe-error`.
- **Env vars:** none.
- **DB tables owned:** `gov_sss_contribution_table`, `gov_philhealth_config`, `gov_pagibig_config`, `gov_wtax_table`, `gov_de_minimis_ceilings`, `gov_holidays`.

### Government reports — *generated elsewhere*
This module owns the **input rates**. The actual report-generation pages live under `src/app/(admin)/remittances/`:
- **BIR 1601-C** (monthly withholding-tax remittance) — `src/app/(admin)/remittances/bir-1601c/page.tsx`. Inputs: paid pay-runs for the month, employer profile (`COMPANY_NAME`, `COMPANY_TIN`, `COMPANY_BIR_RDO` from settings), `BIR_1601C_AMENDED_<YYYY>_<MM>` flag.
- **BIR 2316** (annual employee certificate of compensation) — `src/app/(admin)/remittances/bir-2316/` + `src/app/api/bir-2316/`. Input: per-employee YTD earnings and withholding for a tax year.
- **SSS / PhilHealth / Pag-IBIG monthly remittance** — `src/app/(admin)/remittances/page.tsx` + `remittance-actions.ts`. Inputs: paid pay-runs for the month, the active bracket schedule effective on the run date.
- Required pre-launch seed: `src/db/seed-compliance.ts` (see AUDIT.md "PRE-LAUNCH DATA REQUIREMENTS").

## Known failure modes
- **H-4: Duplicate `effectiveDate` caused non-deterministic rate selection** when two rows shared the same effective date — the "latest" tiebreaker fell back to `createdAt` and same-second inserts were ambiguous. Guard rail: all four `update*Action` / `clone*Action` / `add*Action` paths pre-check for an existing row at that date and reject (`actions.ts:39-45`, `92-98`, `134-138`, `292-296`). Cite AUDIT.md §M/H "✅ H-4".
- **M-8: Rate changes were not audit-logged** — required for BIR audit trail. Guard rail: every action calls `AuditService.log({ action: 'UPDATE_COMPLIANCE_RATE', ... })` or its specific equivalent; calls are wrapped in `.catch(() => {})` so an audit-log failure does not block the rate change (`actions.ts:57-63`, `109-116`, `159-165`, ...). Cite AUDIT.md §M-8.
- **M-1 (design decision, not a bug):** Holiday multipliers are hard-coded in `holiday-actions.ts:14-18` — they have not changed in decades and each row also stores its own `workedMultiplier` in the DB. See AUDIT.md "NOT FIXED (Design Decision) | M-1".
- **Rate validation rejects sentinel values** — `rate <= 0 || rate >= 1` is rejected, so you cannot enter `1.0` for a 100% rate or `0` for "no contribution". If a future statutory change requires either, the validation needs loosening (`actions.ts:27-28`, `84-85`).
- **`calculateSssContribution` returns zeros if the table is empty** — silent fallback. If payroll suddenly shows zero SSS deductions, suspect a missing/unseeded `gov_sss_contribution_table`.

_When you fix a new compliance bug, add a one-line entry here with the symptom and the file/line of the fix._
