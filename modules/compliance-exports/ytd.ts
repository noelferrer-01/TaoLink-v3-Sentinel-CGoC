/**
 * ytd.ts — Year-to-date aggregator for BIR 2316 PDF generation.
 *
 * Produces a single-row SQL aggregation over LOCKED pay runs in a given
 * calendar year for one employee. Callers do not iterate over individual pay
 * runs; the DB sums everything in one round-trip.
 */

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { payslips, payRuns } from '@/modules/payroll/schema';

export interface YtdAggregate {
  year: number;
  employeeId: string;
  /** Postgres numeric returned as string — use Number() only when formatting */
  gross: string;
  sssEe: string;
  philhealthEe: string;
  pagibigEe: string;
  wtax: string;
  net: string;
  payRunCount: number;
}

/**
 * computeYtd — Aggregate payslip columns for one employee across all LOCKED
 * pay runs whose period falls entirely within the given calendar year.
 *
 * Filter:
 *  - pay_runs.period_start >= YYYY-01-01
 *  - pay_runs.period_end   <= YYYY-12-31
 *  - pay_runs.status       = 'locked'
 *  - payslips.employee_id  = employeeId
 *
 * Returns zero-value aggregate (payRunCount = 0) when no qualifying pay runs
 * exist. Never throws for missing data; callers add warnings based on
 * payRunCount.
 */
export async function computeYtd(employeeId: string, year: number): Promise<YtdAggregate> {
  const db = getDb();

  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  const rows = await db
    .select({
      gross:          sql<string>`coalesce(sum(${payslips.grossPay}), 0)`.as('gross'),
      sssEe:          sql<string>`coalesce(sum(${payslips.sssEE}), 0)`.as('sss_ee'),
      philhealthEe:   sql<string>`coalesce(sum(${payslips.philhealthEE}), 0)`.as('philhealth_ee'),
      pagibigEe:      sql<string>`coalesce(sum(${payslips.pagibigEE}), 0)`.as('pagibig_ee'),
      wtax:           sql<string>`coalesce(sum(${payslips.birWtax}), 0)`.as('wtax'),
      net:            sql<string>`coalesce(sum(${payslips.netPay}), 0)`.as('net'),
      payRunCount:    sql<number>`cast(count(distinct ${payslips.payRunId}) as int)`.as('pay_run_count'),
    })
    .from(payslips)
    .innerJoin(payRuns, eq(payslips.payRunId, payRuns.id))
    .where(and(
      eq(payslips.employeeId, employeeId),
      eq(payRuns.status, 'locked'),
      gte(payRuns.periodStart, yearStart),
      lte(payRuns.periodEnd, yearEnd),
    ));

  const row = rows[0];

  // The query always returns exactly one row (aggregate with coalesce).
  return {
    year,
    employeeId,
    gross:        String(row?.gross        ?? '0'),
    sssEe:        String(row?.sssEe        ?? '0'),
    philhealthEe: String(row?.philhealthEe ?? '0'),
    pagibigEe:    String(row?.pagibigEe    ?? '0'),
    wtax:         String(row?.wtax         ?? '0'),
    net:          String(row?.net          ?? '0'),
    payRunCount:  row?.payRunCount ?? 0,
  };
}
