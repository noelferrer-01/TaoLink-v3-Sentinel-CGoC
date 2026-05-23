import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { sssBrackets, philhealthConfig, pagibigConfig, wtaxBrackets } from './schema';

const EFFECTIVE_DATE_2026 = '2026-01-01';
const WISP_MSC_THRESHOLD = 20000;

export async function seedComplianceRates(opts: { effectiveDate?: string } = {}) {
  const db = getDb();
  const effectiveDate = opts.effectiveDate ?? EFFECTIVE_DATE_2026;

  // Idempotency: clear any existing rows for this effectiveDate first.
  await db.delete(sssBrackets).where(eq(sssBrackets.effectiveDate, effectiveDate));
  await db.delete(philhealthConfig).where(eq(philhealthConfig.effectiveDate, effectiveDate));
  await db.delete(pagibigConfig).where(eq(pagibigConfig.effectiveDate, effectiveDate));
  await db.delete(wtaxBrackets).where(eq(wtaxBrackets.effectiveDate, effectiveDate));

  // 1. SSS — RA 11199 final scheduled rate. SSC Resolution 560-s.2024 + Circular 2024-006.
  //    Combined 15% (ER 10% / EE 5%), MSC ₱5,000 – ₱35,000 step ₱500.
  //    WISP carve-out (EE 1% / ER 2%) when MSC ≥ ₱20,000.
  const sssRows = [];
  for (let msc = 5000; msc <= 35000; msc += 500) {
    const rangeStart = msc === 5000 ? 0 : msc - 250;
    const rangeEnd = msc === 35000 ? 9_999_999 : msc + 249.99;

    const hasWisp = msc >= WISP_MSC_THRESHOLD;
    const eeRegular = hasWisp ? msc * 0.04 : msc * 0.05;
    const eeWisp    = hasWisp ? msc * 0.01 : 0;
    const erRegular = hasWisp ? msc * 0.08 : msc * 0.10;
    const erWisp    = hasWisp ? msc * 0.02 : 0;

    sssRows.push({
      rangeStart: rangeStart.toFixed(2),
      rangeEnd: rangeEnd.toFixed(2),
      monthlySalaryCredit: msc.toFixed(2),
      eeShareRegular: eeRegular.toFixed(2),
      erShareRegular: erRegular.toFixed(2),
      eeShareWisp: eeWisp.toFixed(2),
      erShareWisp: erWisp.toFixed(2),
      effectiveDate,
    });
  }
  await db.insert(sssBrackets).values(sssRows);

  // 2. PhilHealth — RA 11223. Circular 2019-0009. 5% rate, floor ₱10k, ceiling ₱100k.
  await db.insert(philhealthConfig).values([{
    rate: '0.0500', floor: '10000.00', ceiling: '100000.00', effectiveDate,
  }]);

  // 3. Pag-IBIG (HDMF) — RA 9679. HDMF Circular 460 (2024-02). EE 2% / ER 2%, cap ₱10k.
  await db.insert(pagibigConfig).values([{
    eeRate: '0.0200', erRate: '0.0200', salaryCap: '10000.00', effectiveDate,
  }]);

  // 4. BIR WTAX — RA 10963 (TRAIN Law) Phase 2. Effective 2023-01-01, no sunset.
  await db.insert(wtaxBrackets).values([
    { frequency: 'MONTHLY' as const, rangeStart: '0.00',      rangeEnd: '20833.00',  baseTax: '0.00',       percentageOver: '0.0000', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '20833.00',  rangeEnd: '33333.00',  baseTax: '0.00',       percentageOver: '0.1500', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '33333.00',  rangeEnd: '66667.00',  baseTax: '1875.00',    percentageOver: '0.2000', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '66667.00',  rangeEnd: '166667.00', baseTax: '8541.67',    percentageOver: '0.2500', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '166667.00', rangeEnd: '666667.00', baseTax: '33541.67',   percentageOver: '0.3000', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '666667.00', rangeEnd: null,        baseTax: '183541.67',  percentageOver: '0.3500', effectiveDate },
    // SEMI_MONTHLY — monthly ÷ 2 per BIR RMC tax tables for semi-monthly periods.
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '0.00',      rangeEnd: '10417.00',  baseTax: '0.00',      percentageOver: '0.0000', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '10417.00',  rangeEnd: '16667.00',  baseTax: '0.00',      percentageOver: '0.1500', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '16667.00',  rangeEnd: '33333.00',  baseTax: '937.50',    percentageOver: '0.2000', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '33333.00',  rangeEnd: '83333.00',  baseTax: '4270.83',   percentageOver: '0.2500', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '83333.00',  rangeEnd: '333333.00', baseTax: '16770.83',  percentageOver: '0.3000', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '333333.00', rangeEnd: null,        baseTax: '91770.83',  percentageOver: '0.3500', effectiveDate },
  ]);
}
