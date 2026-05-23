# Philippine Statutory Compliance Rates

This page is the canonical reference for every government-mandated rate, ceiling, bracket, and holiday that the TAOLINK payroll engine consumes. Each section names the statutory source, gives the URL of the primary citation, and records the date the values were last verified against that source.

> **If you change any compliance value anywhere in the code or seed files, also update the matching section here and bump its `Last verified` line.** The Pag-IBIG bug (migration 0016, fixed in PR #14) happened because the code cited an obsolete circular and nobody re-verified it after Circular 460 was issued. This page is the safety net.

**Last full audit:** 2026-05-23

---

## SSS — Social Security System

| Field | Value |
|---|---|
| Statutory basis | RA 11199 (Social Security Act of 2018) |
| Current rate schedule | SSC Resolution 560-s.2024 + SSS Circular 2024-006 |
| Effective | 1 January 2025 |
| Combined contribution rate | **15 %** of MSC (final scheduled increase) |
| Employer share | 10 % |
| Employee share | 5 % |
| Minimum Monthly Salary Credit (MSC) | ₱5,000 |
| Maximum Monthly Salary Credit (MSC) | ₱35,000 |
| MSC step | ₱500 |
| WISP carve-out threshold | MSC ≥ ₱20,000 |
| WISP split (at threshold or above) | 1 % EE + 2 % ER (does **not** change take-home pay) |

**Where it lives in code:**
- Seed: [src/db/seed-compliance.ts](../../src/db/seed-compliance.ts) (`seedComplianceData` → SSS section)
- Schema: [src/modules/compliance/schema.ts](../../src/modules/compliance/schema.ts) (`govSssContributionTable`)
- Engine: [src/modules/payroll/service.ts](../../src/modules/payroll/service.ts) (SSS bracket lookup)

**Authoritative source:** [KPMG GMS Flash Alert 2025-026 quoting Circular 2024-006](https://kpmg.com/xx/en/our-insights/gms-flash-alert/flash-alert-2025-026.html) → [Circular 2024-006 PDF on sss.gov.ph](https://www.sss.gov.ph/wp-content/uploads/2024/12/CI-2024-006-Publication.pdf)

**Last verified:** 2026-05-23

---

## PhilHealth — Universal Health Care

| Field | Value |
|---|---|
| Statutory basis | RA 11223 (Universal Health Care Act of 2019) |
| Current rate schedule | PhilHealth Circular 2019-0009 |
| Effective | CY 2024 onwards (final scheduled rate); PIA confirmed no 2026 hike |
| Premium rate | **5 %** of Monthly Basic Salary (MBS) |
| MBS floor | ₱10,000 |
| MBS ceiling | ₱100,000 |
| Minimum monthly premium | ₱500 |
| Maximum monthly premium | ₱5,000 |
| Employer / employee split | 50 / 50 |

**Where it lives in code:**
- Seed: [src/db/seed-compliance.ts](../../src/db/seed-compliance.ts) (`seedComplianceData` → PhilHealth section)
- Schema: [src/modules/compliance/schema.ts](../../src/modules/compliance/schema.ts) (`govPhilhealthConfig`)
- Engine: [src/modules/payroll/service.ts](../../src/modules/payroll/service.ts) (`calculatePhilhealth*`)

**Authoritative source:** [PhilHealth Contribution Table PDF (2019-2025 schedule)](https://www.philhealth.gov.ph/partners/employers/ContributionTable_v2.pdf)

**Last verified:** 2026-05-23

---

## Pag-IBIG — Home Development Mutual Fund (HDMF)

| Field | Value |
|---|---|
| Statutory basis | RA 9679 (HDMF Law of 2009) |
| Current rate schedule | HDMF Circular No. 460 (supersedes Circular 274) |
| Effective | February 2024 |
| Employee rate (Fund Salary > ₱1,500) | **2 %** |
| Employee rate (Fund Salary ≤ ₱1,500) | 1 % (employer still pays 2 %) |
| Employer rate | 2 % |
| Maximum Fund Salary (MFS) | **₱10,000** |
| Max mandatory contribution (EE / ER) | ₱200 / month each |
| Contributions above ₱200 / month | Voluntary; not auto-deducted |

> **Historical note:** Migration 0016 incorrectly rolled the cap back to ₱5,000 citing the obsolete Circular 274; migration 0025 (PR #14) restored it. If you ever see the cap at ₱5,000, that is the old law — confirm against the source before assuming.

**Where it lives in code:**
- Seed: [src/db/seed-compliance.ts](../../src/db/seed-compliance.ts) (`seedComplianceData` → Pag-IBIG section)
- Schema: [src/modules/compliance/schema.ts](../../src/modules/compliance/schema.ts) (`govPagibigConfig`)
- Engine: [src/modules/payroll/service.ts](../../src/modules/payroll/service.ts) (`calculatePagibigLocal`)

**Authoritative source:** [pco.gov.ph press release, 17 January 2024](https://pco.gov.ph/other_releases/pag-ibig-members-to-gain-more-benefits-under-new-rates-starting-february-2024/) → [Circular 460 PDF on pagibigfund.gov.ph](https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/Circular%20No.%20460%20-%20Guidelines%20on%20the%20Pag-IBIG%20Fund's%20Implementation%20of%20Increase%20in%20the%20MFS%20Effective%20February%202024.pdf) (note: PDF behind reCAPTCHA; open in a browser)

**Last verified:** 2026-05-23

---

## BIR Withholding Tax on Compensation

| Field | Value |
|---|---|
| Statutory basis | RA 10963 (TRAIN Law) |
| Current rate schedule | TRAIN Phase 2 (no sunset date — rates remain unless amended) |
| Effective | 1 January 2023 onwards |

### Monthly brackets

| Bracket | Range | Tax |
|---|---|---|
| 1 | ≤ ₱20,833 | 0 |
| 2 | > ₱20,833 to ₱33,333 | 15 % × (Income − ₱20,833) |
| 3 | > ₱33,333 to ₱66,667 | ₱1,875.00 + 20 % × (Income − ₱33,333) |
| 4 | > ₱66,667 to ₱166,667 | ₱8,541.67 + 25 % × (Income − ₱66,667) |
| 5 | > ₱166,667 to ₱666,667 | ₱33,541.67 + 30 % × (Income − ₱166,667) |
| 6 | > ₱666,667 | ₱183,541.67 + 35 % × (Income − ₱666,667) |

Semi-monthly brackets are exactly half of the monthly figures (BIR convention).

**Where it lives in code:**
- Seed: [src/db/seed-compliance.ts](../../src/db/seed-compliance.ts) (`seedComplianceData` → WTAX section, two `insert` calls for MONTHLY + SEMI_MONTHLY)
- Schema: [src/modules/compliance/schema.ts](../../src/modules/compliance/schema.ts) (`govWtaxTable`)
- Engine: [src/modules/payroll/service.ts](../../src/modules/payroll/service.ts) (`calculateWithholdingTaxLocal`)

**Authoritative source:** [BIR Withholding Tax landing page](https://www.bir.gov.ph/WithHoldingTax)

**Last verified:** 2026-05-23

---

## De Minimis Benefit Ceilings

| Field | Value |
|---|---|
| Statutory basis | NIRC § 32(B)(7)(e); BIR RR 2-98 as amended |
| Current ceilings | BIR Revenue Regulations No. 29-2025 |
| Issued | 22 December 2025 |
| Effective | 6 January 2026 |

### Ceilings stored as monthly amounts

| Code | Benefit | Statutory ceiling | Stored monthly |
|---|---|---|---|
| `UNIFORM` | Uniform and clothing allowance | ₱8,000 / year | ₱666.67 |
| `RICE` | Rice subsidy | ₱2,500 / month | ₱2,500.00 |
| `MEDICAL_CASH` | Medical cash allowance for dependents | ₱2,000 / semester | ₱333.33 |
| `MEDICAL_ACTUAL` | Actual medical assistance | ₱12,000 / year | ₱1,000.00 |
| `LAUNDRY` | Laundry allowance | ₱400 / month | ₱400.00 |
| `ACHIEVEMENT` | Employee achievement awards (cash / GC / tangible) | ₱12,000 / year | ₱1,000.00 |
| `GIFTS` | Christmas and major anniversary gifts | ₱6,000 / year | ₱500.00 |
| `CBA` | CBA benefits and productivity incentive schemes | ₱12,000 / year | ₱1,000.00 |

The OT/night-shift meal allowance (30 % of basic minimum wage under RR 29-2025) is **not** stored here because it is wage-percentage-based; the payroll engine computes it from each employee's wage at runtime.

**Where it lives in code:**
- Seed function: `seedDeMinimisCeilings` in [src/db/seed-compliance.ts](../../src/db/seed-compliance.ts)
- Backfill migration: [src/db/migrations/0026_de_minimis_rr29_2025.sql](../../src/db/migrations/0026_de_minimis_rr29_2025.sql)
- Schema: [src/modules/compliance/schema.ts](../../src/modules/compliance/schema.ts) (`govDeMinimisCeilings`)
- Engine: [src/modules/payroll/service.ts](../../src/modules/payroll/service.ts) (`deMinimisCeiling` total)

**Authoritative source:** [BIR RR No. 29-2025 PDF](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2029-2025.pdf) (also summarized in [KPMG GMS Flash Alert 2026-014](https://kpmg.com/xx/en/our-insights/gms-flash-alert/2026/flash-alert-2026-014.html))

**Last verified:** 2026-05-23

---

## Philippine Holidays — CY 2026

| Field | Value |
|---|---|
| Statutory basis | Proclamation issued each year by the Office of the President under EO 292 § 26 |
| Current proclamation | **Proclamation No. 1006, s. 2025** (3 September 2025) |
| Eid (al-Fitr, al-Adha) | Declared by separate proclamation when Hijri dates are confirmed by NCMF |

### Regular Holidays (10 fixed + 2 Eid)

| Date | Holiday |
|---|---|
| Jan 1 (Thu) | New Year's Day |
| Apr 2 (Thu) | Maundy Thursday |
| Apr 3 (Fri) | Good Friday |
| Apr 9 (Thu) | Araw ng Kagitingan |
| May 1 (Fri) | Labor Day |
| Jun 12 (Fri) | Independence Day |
| Aug 31 (Mon) | National Heroes Day |
| Nov 30 (Mon) | Bonifacio Day |
| Dec 25 (Fri) | Christmas Day |
| Dec 30 (Wed) | Rizal Day |
| Mar 20 (Fri) | Eid al-Fitr (per latest NCMF guidance — verify each year) |
| May 27 (Wed) | Eid al-Adha (per latest NCMF guidance — verify each year) |

### Special (Non-Working) Days

| Date | Holiday |
|---|---|
| Feb 17 (Tue) | Chinese New Year |
| Apr 4 (Sat) | Black Saturday |
| Aug 21 (Fri) | Ninoy Aquino Day |
| Nov 1 (Sun) | All Saints' Day |
| Nov 2 (Mon) | All Souls' Day |
| Dec 8 (Tue) | Feast of the Immaculate Conception |
| Dec 24 (Thu) | Christmas Eve |
| Dec 31 (Thu) | Last Day of the Year |

### Special (Working) Days

| Date | Holiday |
|---|---|
| Feb 25 (Wed) | EDSA People Power Revolution Anniversary |

> **Historical note:** EDSA Feb 25 was previously listed as `SPECIAL_NON_WORKING` in the codebase (incorrect per Proclamation 1006). All Souls' Day and Christmas Eve were missing entirely. Fixed in this PR.

### Pay multipliers (TAOLINK convention)

| Type | Worked | Unworked |
|---|---|---|
| REGULAR | 2.00× daily rate | 1.00× daily rate |
| SPECIAL_NON_WORKING | 1.30× | 0.00× |
| SPECIAL_WORKING | 1.00× | 1.00× |

**Where it lives in code:**
- Seed: [src/db/seed-holidays.ts](../../src/db/seed-holidays.ts) (run manually via `tsx src/db/seed-holidays.ts`)
- Schema: [src/modules/compliance/holiday-schema.ts](../../src/modules/compliance/holiday-schema.ts)
- Engine: payroll service consumes via `complianceData.holidays`

**Authoritative source:** [Proclamation No. 1006, s. 2025 (PCO)](https://pco.gov.ph/wp-content/uploads/2025/09/20250903-PROC-1006-FRM.pdf.pdf) → [Official Gazette 2026 holiday list](https://www.officialgazette.gov.ph/nationwide-holidays/)

**Last verified:** 2026-05-23

---

## Update procedure

When a new circular, RR, or proclamation lands:

1. Read the primary source (a `.gov.ph` link, not a third-party summary).
2. Update the matching values in the seed file (`src/db/seed-compliance.ts` or `src/db/seed-holidays.ts`).
3. Update the comments in [src/modules/compliance/schema.ts](../../src/modules/compliance/schema.ts).
4. If existing DB rows need fixing, add a numbered migration in `src/db/migrations/` with a header comment naming the circular and effective date.
5. Update the matching section on this page — including the `Last verified` line and the table values.
6. If the change has tax / contribution-amount implications, add or update a unit test in [src/__tests__/compliance.test.ts](../../src/__tests__/compliance.test.ts) using the new numbers.

When in doubt, cite the source in the migration comment too — future readers (including the next AI assistant) will then have a path back to the authority rather than relying on whatever was in the head of the person who wrote the code.
