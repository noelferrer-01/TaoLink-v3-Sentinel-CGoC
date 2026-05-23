import {
  govSssContributionTable,
  govPhilhealthConfig,
  govPagibigConfig,
  govWtaxTable,
  govDeMinimisCeilings,
} from '../modules/compliance/schema';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentPSTDate } from '../lib/utils/dates';

// Every value seeded here is cross-referenced in wiki/pages/compliance-rates.md
// with its statutory source and last-verified date. When updating any rate, also
// update that wiki page and bump its `Last verified` line so future maintainers
// can tell at a glance whether the values are current.

export async function seedComplianceData(db: any) {
  console.log('🏛️  Seeding Compliance Data...');
  const effectiveDate = getCurrentPSTDate();

  // 1. SSS — final scheduled rate under RA 11199 (Social Security Act of 2018).
  //    Authoritative source: SSC Resolution 560-s.2024 + SSS Circular 2024-006,
  //    effective 1 January 2025. Combined rate 15% (ER 10% / EE 5%), MSC range
  //    ₱5,000 – ₱35,000 (step ₱500).
  //
  //    WISP (Workers' Investment and Savings Program, RA 11199 § 4(b)(2)):
  //      MSC < ₱20,000 — all contributions are "regular", WISP = 0
  //      MSC ≥ ₱20,000 — carve out 1% EE + 2% ER as WISP (EE/ER totals unchanged)
  //    The split does not change take-home pay; it is required for accurate
  //    SSS Form R-5 / R-3 remittance reporting.
  const WISP_MSC_THRESHOLD = 20000;
  const sssBrackets = [];
  for (let msc = 5000; msc <= 35000; msc += 500) {
    const rangeStart = msc === 5000 ? 0 : msc - 250;
    const rangeEnd = msc === 35000 ? 9999999 : msc + 249.99;

    let eeRegular: number;
    let erRegular: number;
    let eeWisp: number;
    let erWisp: number;

    if (msc >= WISP_MSC_THRESHOLD) {
      // WISP applies — carve out from the 5%/10% totals
      eeRegular = msc * 0.04;  // 4% regular
      eeWisp    = msc * 0.01;  // 1% WISP  → EE total = 5%
      erRegular = msc * 0.08;  // 8% regular
      erWisp    = msc * 0.02;  // 2% WISP  → ER total = 10%
    } else {
      // No WISP — all regular
      eeRegular = msc * 0.05;
      eeWisp    = 0;
      erRegular = msc * 0.10;
      erWisp    = 0;
    }

    sssBrackets.push({
      id: uuidv4(),
      rangeStart: rangeStart.toFixed(2),
      rangeEnd: rangeEnd.toFixed(2),
      monthlySalaryCredit: msc.toFixed(2),
      eeShareRegular: eeRegular.toFixed(2),
      erShareRegular: erRegular.toFixed(2),
      eeShareWisp: eeWisp.toFixed(2),
      erShareWisp: erWisp.toFixed(2),
      effectiveDate
    });
  }
  await db.insert(govSssContributionTable).values(sssBrackets);

  // 2. PhilHealth — final scheduled rate under RA 11223 (Universal Health Care Act).
  //    Authoritative source: PhilHealth Circular 2019-0009. Final 5% rate effective
  //    CY 2024 onwards; the Philippine Information Agency confirmed no premium hike
  //    for 2026 — the 2024/2025 schedule carries over.
  //    Rate 5%, MBS floor ₱10,000, MBS ceiling ₱100,000
  //    → min monthly premium ₱500, max monthly premium ₱5,000 (employer + employee
  //    split 50/50 = ₱250 each at floor, ₱2,500 each at ceiling).
  await db.insert(govPhilhealthConfig).values([
    {
      id: uuidv4(),
      rate: '0.0500',
      floor: '10000.00',
      ceiling: '100000.00',
      effectiveDate
    }
  ]);

  // 3. Pag-IBIG (HDMF) — mandatory contribution per HDMF Circular 460, effective
  //    February 2024 (released 15 January 2024). RA 9679 (HDMF Law of 2009) provides
  //    the statutory basis; Circular 460 superseded the prior ₱5,000 MFS from
  //    Circular 274.
  //    EE rate 2% (1% for Fund Salary ≤ ₱1,500, handled in PayrollService), ER 2%,
  //    Maximum Fund Salary ₱10,000 → max mandatory EE = ER = ₱200/month each.
  //    Contributions above ₱200/month are voluntary; do not auto-deduct in payroll.
  await db.insert(govPagibigConfig).values([
    {
      id: uuidv4(),
      eeRate: '0.0200',
      erRate: '0.0200',
      salaryCap: '10000.00',
      effectiveDate
    }
  ]);

  // 4. Withholding Tax — RA 10963 (TRAIN Law) Phase 2 brackets, effective 1 January
  //    2023 onwards. Six brackets total: a 0% bracket on the first ₱20,833/month plus
  //    five marginal brackets (15% / 20% / 25% / 30% / 35%). These rates remain in
  //    force; TRAIN Phase 2 does not have a sunset date.
  await db.insert(govWtaxTable).values([
    { id: uuidv4(), frequency: 'MONTHLY', rangeStart: '0.00', rangeEnd: '20833.00', baseTax: '0.00', percentageOver: '0.0000', effectiveDate },
    { id: uuidv4(), frequency: 'MONTHLY', rangeStart: '20833.00', rangeEnd: '33333.00', baseTax: '0.00', percentageOver: '0.1500', effectiveDate },
    { id: uuidv4(), frequency: 'MONTHLY', rangeStart: '33333.00', rangeEnd: '66667.00', baseTax: '1875.00', percentageOver: '0.2000', effectiveDate },
    { id: uuidv4(), frequency: 'MONTHLY', rangeStart: '66667.00', rangeEnd: '166667.00', baseTax: '8541.67', percentageOver: '0.2500', effectiveDate },
    { id: uuidv4(), frequency: 'MONTHLY', rangeStart: '166667.00', rangeEnd: '666667.00', baseTax: '33541.67', percentageOver: '0.3000', effectiveDate },
    { id: uuidv4(), frequency: 'MONTHLY', rangeStart: '666667.00', rangeEnd: null, baseTax: '183541.67', percentageOver: '0.3500', effectiveDate },
  ]);

  // 4b. WTAX (SEMI_MONTHLY brackets) — monthly brackets ÷ 2 per BIR Revenue
  //     Memorandum Circular tax tables for semi-monthly compensation periods.
  await db.insert(govWtaxTable).values([
    { id: uuidv4(), frequency: 'SEMI_MONTHLY', rangeStart: '0.00', rangeEnd: '10417.00', baseTax: '0.00', percentageOver: '0.0000', effectiveDate },
    { id: uuidv4(), frequency: 'SEMI_MONTHLY', rangeStart: '10417.00', rangeEnd: '16667.00', baseTax: '0.00', percentageOver: '0.1500', effectiveDate },
    { id: uuidv4(), frequency: 'SEMI_MONTHLY', rangeStart: '16667.00', rangeEnd: '33333.00', baseTax: '937.50', percentageOver: '0.2000', effectiveDate },
    { id: uuidv4(), frequency: 'SEMI_MONTHLY', rangeStart: '33333.00', rangeEnd: '83333.00', baseTax: '4270.83', percentageOver: '0.2500', effectiveDate },
    { id: uuidv4(), frequency: 'SEMI_MONTHLY', rangeStart: '83333.00', rangeEnd: '333333.00', baseTax: '16770.83', percentageOver: '0.3000', effectiveDate },
    { id: uuidv4(), frequency: 'SEMI_MONTHLY', rangeStart: '333333.00', rangeEnd: null, baseTax: '91770.83', percentageOver: '0.3500', effectiveDate },
  ]);

  await seedDeMinimisCeilings(db);

  console.log('✅ Compliance seeding complete!');
}

// De Minimis ceilings — per BIR Revenue Regulations No. 29-2025 amending RR 2-98
// (issued 22 December 2025, effective 6 January 2026). Stored as monthly ceilings;
// annual benefits are divided by 12 here.
//
// The OT/night-shift meal allowance (30% of basic minimum wage) is omitted because
// it is wage-percentage-based, not a fixed peso ceiling, and the payroll engine
// computes it from each employee's wage at runtime.
//
// Idempotent: upserts by `code` so re-running the seed (or running it against a DB
// that already has a partial set) doesn't fail or duplicate.
export async function seedDeMinimisCeilings(db: any) {
  const rows = [
    { code: 'UNIFORM',        name: 'Uniform and clothing allowance',                     monthly: 8000 / 12 },   // ₱8,000/yr
    { code: 'RICE',           name: 'Rice subsidy',                                       monthly: 2500 },        // ₱2,500/mo
    { code: 'MEDICAL_CASH',   name: 'Medical cash allowance for dependents',              monthly: 2000 / 6 },    // ₱2,000/semester
    { code: 'MEDICAL_ACTUAL', name: 'Actual medical assistance',                          monthly: 12000 / 12 },  // ₱12,000/yr
    { code: 'LAUNDRY',        name: 'Laundry allowance',                                  monthly: 400 },         // ₱400/mo
    { code: 'ACHIEVEMENT',    name: 'Employee achievement awards (cash, GC, tangible)',   monthly: 12000 / 12 },  // ₱12,000/yr
    { code: 'GIFTS',          name: 'Christmas and major anniversary gifts',              monthly: 6000 / 12 },   // ₱6,000/yr
    { code: 'CBA',            name: 'CBA benefits and productivity incentive schemes',    monthly: 12000 / 12 },  // ₱12,000/yr
  ];

  for (const r of rows) {
    await db.insert(govDeMinimisCeilings)
      .values({
        id: uuidv4(),
        code: r.code,
        benefitName: r.name,
        monthlyCeiling: r.monthly.toFixed(2),
      })
      .onDuplicateKeyUpdate({
        set: {
          benefitName: r.name,
          monthlyCeiling: r.monthly.toFixed(2),
        },
      });
  }
}
