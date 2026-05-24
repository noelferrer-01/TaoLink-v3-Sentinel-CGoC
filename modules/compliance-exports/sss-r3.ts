/**
 * exportSSS_R3 — emits the per-pay-run R-3 CSV.
 *
 * Format spec: ./SSS_R3_FORMAT.md
 *
 * Slice-1 scope: one pay run → one R-3 CSV. The contributions for the pay run's
 * calendar month land in the corresponding quarter-month column
 * (1st / 2nd / 3rd Month). The HR clerk combines three monthly CSVs externally
 * to produce the quarterly filing. A `exportSSS_R3_Quarter` wrapper is deferred.
 */

import { eq, inArray } from 'drizzle-orm';
import Papa from 'papaparse';
import { getDb } from '@/core/db';
import { payRuns, payslips } from '@/modules/payroll/schema';
import { employees } from '@/modules/hr/schema';
import { sssBracketForMonthly } from '@/modules/compliance/service';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { round2 } from '@/core/money';

// EC (Employee Compensation) is employer-paid and not stored in compliance
// tables. Per SSS Circular: ₱30 if MSC ≥ ₱14,500, else ₱10. Constants live
// here (not in modules/compliance) because EC only surfaces in R-3 export,
// not in payroll computation — payslips don't carry it.
function ecContribution(monthlySalaryCredit: number): number {
  return monthlySalaryCredit >= 14500 ? 30 : 10;
}

/** Map a date (YYYY-MM-DD) to the position within its calendar quarter: 1, 2, or 3. */
function quarterMonth(dateStr: string): 1 | 2 | 3 {
  const month = Number(dateStr.slice(5, 7)); // 1..12
  return ((month - 1) % 3) + 1 as 1 | 2 | 3;
}

type Row = {
  sss_number: string;
  surname: string;
  given_name: string;
  middle_initial: string;
  ss_1st_month: string;
  ss_2nd_month: string;
  ss_3rd_month: string;
  ec_1st_month: string;
  ec_2nd_month: string;
  ec_3rd_month: string;
  separation_date: string;
};

const COLUMNS: ReadonlyArray<keyof Row> = [
  'sss_number', 'surname', 'given_name', 'middle_initial',
  'ss_1st_month', 'ss_2nd_month', 'ss_3rd_month',
  'ec_1st_month', 'ec_2nd_month', 'ec_3rd_month',
  'separation_date',
];

export type SSS_R3_Export = {
  csv: string;
  rows: number;
  warnings: string[];
};

export async function exportSSS_R3(
  payRunId: string,
  opts: { actorUserId?: string | null } = {},
): Promise<SSS_R3_Export> {
  const db = getDb();

  // ── 1. Resolve pay_run ─────────────────────────────────────────────────────
  const runRows = await db.select().from(payRuns).where(eq(payRuns.id, payRunId));
  const run = runRows[0];
  if (!run) throw new Error(`[compliance-exports/sss-r3] Pay run not found: ${payRunId}`);

  // ── 2. Load payslips for the run ──────────────────────────────────────────
  const slips = await db.select().from(payslips).where(eq(payslips.payRunId, run.id));

  // ── 3. Load employees referenced by those payslips ────────────────────────
  const empById = new Map<string, typeof employees.$inferSelect>();
  if (slips.length > 0) {
    const ids = [...new Set(slips.map((s) => s.employeeId))];
    const empRows = await db.select().from(employees).where(inArray(employees.id, ids));
    for (const e of empRows) empById.set(e.id, e);
  }

  // ── 4. Project to R-3 rows ────────────────────────────────────────────────
  const month = quarterMonth(run.periodEnd);
  const rows: Row[] = [];
  const warnings: string[] = [];

  let ssTotal = 0;
  let ecTotal = 0;

  for (const slip of slips) {
    const emp = empById.get(slip.employeeId);
    if (!emp) {
      // Should not happen — FK guarantees the employee exists. Defensive log.
      warnings.push(`payslip ${slip.id} references unknown employee ${slip.employeeId}`);
      continue;
    }

    // Combined SS = EE + ER (regular + WISP) for the period.
    const bracket = await sssBracketForMonthly(Number(emp.basicSalary), run.periodEnd);
    let ssCombined = 0;
    let ec = 0;
    if (bracket) {
      ssCombined = round2(
        Number(bracket.eeShareRegular) +
        Number(bracket.erShareRegular) +
        Number(bracket.eeShareWisp) +
        Number(bracket.erShareWisp),
      );
      ec = ecContribution(Number(bracket.monthlySalaryCredit));
    } else {
      warnings.push(`employee ${emp.employeeCode} has no matching SSS bracket for salary ₱${emp.basicSalary} as of ${run.periodEnd}`);
    }

    ssTotal = round2(ssTotal + ssCombined);
    ecTotal = round2(ecTotal + ec);

    const sssNumber = emp.sssNumber;
    if (!sssNumber) {
      warnings.push(`employee ${emp.employeeCode} has no sss_number on file — emitted as MISSING`);
    }

    const blank = '';
    const ssStr = ssCombined > 0 ? ssCombined.toFixed(2) : '';
    const ecStr = ec > 0 ? ec.toFixed(2) : '';

    rows.push({
      sss_number: sssNumber ?? 'MISSING',
      surname: emp.lastName,
      given_name: emp.firstName,
      middle_initial: (emp.middleName ?? '').charAt(0),
      ss_1st_month: month === 1 ? ssStr : blank,
      ss_2nd_month: month === 2 ? ssStr : blank,
      ss_3rd_month: month === 3 ? ssStr : blank,
      ec_1st_month: month === 1 ? ecStr : blank,
      ec_2nd_month: month === 2 ? ecStr : blank,
      ec_3rd_month: month === 3 ? ecStr : blank,
      separation_date: emp.terminatedOn ?? '',
    });
  }

  // ── 5. Totals row ─────────────────────────────────────────────────────────
  const totalsRow: Row = {
    sss_number: 'TOTAL',
    surname: '',
    given_name: '',
    middle_initial: '',
    ss_1st_month: month === 1 ? ssTotal.toFixed(2) : '0.00',
    ss_2nd_month: month === 2 ? ssTotal.toFixed(2) : '0.00',
    ss_3rd_month: month === 3 ? ssTotal.toFixed(2) : '0.00',
    ec_1st_month: month === 1 ? ecTotal.toFixed(2) : '0.00',
    ec_2nd_month: month === 2 ? ecTotal.toFixed(2) : '0.00',
    ec_3rd_month: month === 3 ? ecTotal.toFixed(2) : '0.00',
    separation_date: '',
  };

  // ── 6. CSV via papaparse ─────────────────────────────────────────────────
  // Force LF newlines so the output is byte-identical across platforms
  // (papaparse defaults to CRLF on Windows; tests + downstream consumers
  // assume LF).
  const csv = Papa.unparse({ fields: [...COLUMNS], data: [...rows, totalsRow] }, { newline: '\n' });

  // ── 7. Audit + event ──────────────────────────────────────────────────────
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'compliance.export.sss_r3',
    target: { kind: 'pay_run', id: run.id },
    payload: {
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      rows: rows.length,
      warnings: warnings.length,
    },
  });
  await events.publish('compliance.export.sss_r3', {
    payRunId: run.id,
    rows: rows.length,
    warnings: warnings.length,
  });

  return { csv, rows: rows.length, warnings };
}
