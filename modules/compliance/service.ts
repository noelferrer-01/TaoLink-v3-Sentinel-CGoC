import { eq, lte, desc, and } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { sssBrackets, philhealthConfig, pagibigConfig, wtaxBrackets, type SssBracket } from './schema';

export type WtaxFreq = 'MONTHLY' | 'SEMI_MONTHLY';

export async function sssBracketForMonthly(monthlySalary: number, asOf: string): Promise<SssBracket | null> {
  const db = getDb();
  const all = await db.select().from(sssBrackets).where(lte(sssBrackets.effectiveDate, asOf)).orderBy(desc(sssBrackets.effectiveDate));
  // Filter to the most-recent effective date.
  const mostRecent = all[0]?.effectiveDate;
  if (!mostRecent) return null;
  const sameDate = all.filter((b) => b.effectiveDate === mostRecent);
  // Find the bracket where rangeStart <= salary <= rangeEnd.
  return sameDate.find((b) => Number(b.rangeStart) <= monthlySalary && monthlySalary <= Number(b.rangeEnd)) ?? null;
}

export async function philhealthEE(monthlySalary: number, asOf: string): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(philhealthConfig).where(lte(philhealthConfig.effectiveDate, asOf)).orderBy(desc(philhealthConfig.effectiveDate)).limit(1);
  const [cfg] = rows;
  if (!cfg) return 0;
  const basis = Math.min(Math.max(monthlySalary, Number(cfg.floor)), Number(cfg.ceiling));
  // 50/50 EE/ER split per RA 11223.
  return Math.round((basis * Number(cfg.rate) / 2) * 100) / 100;
}

export async function pagibigEE(monthlySalary: number, asOf: string): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(pagibigConfig).where(lte(pagibigConfig.effectiveDate, asOf)).orderBy(desc(pagibigConfig.effectiveDate)).limit(1);
  const [cfg] = rows;
  if (!cfg) return 0;
  const basis = Math.min(monthlySalary, Number(cfg.salaryCap));
  return Math.round((basis * Number(cfg.eeRate)) * 100) / 100;
}

export async function wtaxMonthly(taxableMonthly: number, freq: WtaxFreq, asOf: string): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(wtaxBrackets).where(and(eq(wtaxBrackets.frequency, freq), lte(wtaxBrackets.effectiveDate, asOf))).orderBy(desc(wtaxBrackets.effectiveDate));
  if (rows.length === 0) return 0;
  const mostRecent = rows[0]!.effectiveDate;
  const eligible = rows.filter((r) => r.effectiveDate === mostRecent);
  const bracket = eligible.find((b) => {
    const start = Number(b.rangeStart);
    const end = b.rangeEnd === null ? Infinity : Number(b.rangeEnd);
    return taxableMonthly >= start && taxableMonthly < end;
  });
  if (!bracket) return 0;
  const tax = Number(bracket.baseTax) + (taxableMonthly - Number(bracket.rangeStart)) * Number(bracket.percentageOver);
  return Math.round(tax * 100) / 100;
}
