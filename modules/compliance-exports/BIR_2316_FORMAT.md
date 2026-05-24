# BIR Form 2316 — Certificate of Compensation Payment / Tax Withheld — Field Spec

**Source:** BIR Form 2316, Bureau of Internal Revenue, Republic of the Philippines (September 2021 ENCS).
**Authoritative URL:** <https://bir-cdn.bir.gov.ph/local/pdf/2316%20Sep%202021%20ENCS_Final_corrected.pdf>
**Last verified:** 2026-05-24

---

## What this form is

The 2316 is the **annual certificate** every employer issues to every employee, summarising compensation paid and tax withheld for the calendar year. It is given to the employee by **January 31 of the following year** and serves as proof of income/tax for ITR filing (or, for substituted-filing-qualified employees, in lieu of an ITR).

The form covers **one employee × one calendar year**. Sentinel's Slice 1 export produces 2316 data per `(employeeId, year)`.

## Partial-year coverage (Slice 1 caveat)

Slice 1 ships **partial-year** 2316 generation — the function sums whatever payslips exist for the employee in the year, even if the year is incomplete. Per the Slice 1 contract, the demo doesn't require a full calendar year of payroll history. The format doc records this; the implementation accepts a `year` argument and aggregates whatever it finds.

**Real-world implication:** a partial-year 2316 is **not acceptable for BIR filing** as the year-end certificate. It is acceptable as a mid-year preview / proof of withholding for the employee, and as the carry-over input when the employee transfers to a new employer mid-year (the new employer needs the prior employer's 2316 stub to compute year-end tax correctly under tax-annualization).

If Phase 7 research surfaces that BIR rejects partial-year 2316 entirely (no in-year use), the Slice 1 contract is amended to "internal preview only" and the export is renamed `previewBIR_2316`.

## Form structure (BIR 2316, Sep 2021 ENCS)

### Part I — Employee Information

| # | Field | Type |
| --- | --- | --- |
| 1 | For the Year (`YYYY`) | int |
| 2 | For the Period From — To | date range |
| 3 | TIN | string (9 or 12 digits, formatted `XXX-XXX-XXX[-XXX]`) |
| 4 | Employee's Name (Last, First, Middle) | string |
| 5 | RDO Code | string (3 digits) |
| 6 | Registered Address | string |
| 6A | ZIP Code | string |
| 6B | Local Home Address | string (if different from registered) |
| 6C | Local Home ZIP Code | string |
| 6D | Foreign Address | string (if applicable) |
| 7 | Date of Birth (`MM/DD/YYYY`) | date |
| 8 | Contact Number | string |
| 9 | Statutory Minimum Wage rate per day | decimal |
| 10 | Statutory Minimum Wage rate per month | decimal |
| 11 | MWE — exempt-from-withholding flag | boolean (`X` if yes) |

### Part II — Employer Information (Present)

| # | Field | Type |
| --- | --- | --- |
| 12 | TIN | string |
| 13 | Employer's Name | string |
| 14 | Registered Address | string |
| 14A | ZIP Code | string |
| 15 | Type of Employer — Main | boolean |
| 16 | Type of Employer — Secondary | boolean |

### Part III — Employer Information (Previous, if applicable)

| # | Field | Type |
| --- | --- | --- |
| 16 | TIN | string |
| 17 | Employer's Name | string |
| 18 | Registered Address | string |
| 18A | ZIP Code | string |

(Slice 1: leave blank — no inter-employer carry-over support yet.)

### Part IVA — Summary

| # | Field | Computation |
| --- | --- | --- |
| 19 | Gross Compensation Income from Present Employer | Sum of items 38 + 52 (= Σ `payslips.gross_pay` for the year) |
| 20 | Less: Total Non-Taxable / Exempt Compensation | Σ non-taxable items (Slice 1: SSS-EE + PhilHealth-EE + Pag-IBIG-EE + 13th-month-up-to-cap; 13th-month not in Slice 1) |
| 21 | Taxable Compensation from Present Employer | 19 − 20 |
| 22 | Add: Taxable Compensation from Previous Employer | Slice 1: 0 |
| 23 | Gross Taxable Compensation Income | 21 + 22 |
| 24 | Tax Due | From BIR tax table (annual brackets — same `gov_wtax_table` used by payroll, applied annually instead of per-period) |
| 25A | Amount of Taxes Withheld — Present Employer | Σ `payslips.bir_wtax` for the year |
| 25B | Amount of Taxes Withheld — Previous Employer | Slice 1: 0 |
| 26 | Total Amount of Taxes Withheld as adjusted | 25A + 25B |

### Part IVB — Details of Compensation and Tax Withheld (line items)

Items 27–52 break down the summary into named compensation categories (basic salary, holiday pay, overtime, 13th-month, de minimis, etc). For Slice 1, only the items present in v3 payslips are populated:

| # | Field | Sentinel source |
| --- | --- | --- |
| 36 | Basic Salary | Σ `payslips.basic_salary_snapshot` × periods (or derived from `gross_pay − ot`) |
| 38 | (Subtotal Non-Taxable) | computed |
| 41 | Overtime Pay | (Slice 1: skip — OT lives inside `gross_pay`, not broken out yet — see follow-up) |
| 52 | Gross Compensation (Taxable) | = item 19 minus non-taxable items |

(Items 27–35 are non-taxable compensation breakdown; items 36–52 are taxable compensation breakdown. Sentinel populates these progressively as Phase 6+ extensions land.)

### Signatures (item 51 / 52 / 53 / 54)

The paper 2316 requires employer-rep and employee signatures. Sentinel's CSV/JSON export carries only the data fields; signature affixing is a separate workflow (paper, or future e-signature integration).

## Sentinel export shape (what `exportBIR_2316` produces)

The function returns a **structured object** with all populated fields, plus optionally a **CSV** rendering (one row per employee for batch context):

```ts
type BIR2316Export = {
  year: number;
  employee: {
    tin: string | null;        // null surfaces as a warning
    lastName: string;
    firstName: string;
    middleName: string | null;
    rdoCode: string | null;    // not yet captured in v3 schema — null for Slice 1
    address: string | null;
    dateOfBirth: string | null;
    contactNumber: string | null;
  };
  employer: {
    tin: string;               // from app config (CGoC's TIN)
    name: string;
    address: string;
    type: 'Main' | 'Secondary';
  };
  summary: {
    grossCompensation: number;          // item 19
    nonTaxable: number;                 // item 20
    taxableFromPresent: number;         // item 21
    taxableFromPrevious: number;        // item 22 (Slice 1: 0)
    grossTaxable: number;               // item 23
    taxDue: number;                     // item 24
    taxesWithheldPresent: number;       // item 25A
    taxesWithheldPrevious: number;      // item 25B (Slice 1: 0)
    totalTaxesWithheldAdjusted: number; // item 26
  };
  partialYear: boolean;                 // true if year is incomplete at time of export
  warnings: string[];                   // missing TIN, missing RDO, partial-year, etc.
};
```

A second helper, `exportBIR_2316_CSV(year)`, returns a single CSV with one row per employee for batch download — column headers mirror the summary block plus employee identifier columns.

## Missing-data handling

- Missing `tin_number` → emitted as `null`, added to `warnings`, export does NOT block.
- Missing `rdo_code`, `dob`, `address` on employee → null + warning. (These v3 schema gaps are tracked as Phase-7 follow-ups; they don't block Slice 1 demo since the demo shows summary numbers, not regulatory-grade filings.)

## Known constraints / followups

1. **Items 27–35 non-taxable breakdown** is materially incomplete in Slice 1 — only the SSS/PhilHealth/Pag-IBIG EE deductions are computable from v3 payslips. Holiday pay, OT, 13th-month, COLA, etc., are not yet broken out on the payslip schema. Tracked as Slice-2 work.
2. **RDO code, date of birth, registered address, contact number** are required by the 2316 form but not yet captured in `hr_employees`. Slice 1 export emits `null` + warnings. Adding these fields is a Slice-2 schema ripple, gated on Commander Group HR confirming which fields they want surfaced in the bulk-import CSV.
3. **Substituted filing eligibility** (items 53–54) is not computed by Slice 1.
4. **Year-end annualised tax** (item 24) uses the annual BIR tax table — the `gov_wtax_table` already has annual brackets; the export applies them to the annual taxable compensation, matching the BIR's "annualised tax due" calculation.
5. **PDF form rendering** is explicitly out of scope per the Slice 1 plan. Slice 1 ships JSON/CSV; PDF form-filling is deferred to a later slice once the field set above is complete and an e-signature workflow is decided.

## Schema dependency

| Sentinel field | 2316 field |
| --- | --- |
| `hr_employees.tin_number` | Item 3 (TIN) |
| `hr_employees.last_name` / `first_name` / `middle_name` | Item 4 (Name) |
| Σ `payslips.gross_pay` (year) | Item 19 (Gross Compensation) |
| Σ `payslips.sss_ee + philhealth_ee + pagibig_ee` (year) | Item 20 (Non-Taxable, partial — 13th-month TBD) |
| Σ `payslips.bir_wtax` (year) | Item 25A (Taxes Withheld) |
| Annual lookup against `gov_wtax_table` | Item 24 (Tax Due) |
