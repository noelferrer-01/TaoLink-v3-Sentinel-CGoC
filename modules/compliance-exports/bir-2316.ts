/**
 * exportBIR_2316 — produces the annual Certificate of Compensation Payment /
 * Tax Withheld for one employee × one calendar year.
 *
 * Format spec: ./BIR_2316_FORMAT.md
 *
 * Slice-1 scope: ships the structured summary object (Part IVA fields), not a
 * filled PDF. Partial-year data is allowed; the consumer interprets per the
 * format doc. PDF rendering deferred until the IVB line-item breakdown and the
 * RDO/DOB/address schema gaps land in a later slice.
 *
 * Annual tax due is computed by applying the MONTHLY wtax brackets to the
 * monthly-equivalent (annual / 12) and multiplying by 12. This is
 * mathematically equivalent to applying the annual brackets directly because
 * BIR monthly bracket boundaries are exactly annual_boundary / 12.
 */

import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { employees } from '@/modules/hr/schema';
import { wtaxMonthly } from '@/modules/compliance/service';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { round2 } from '@/core/money';

// Employer-side config. For Slice 1 these come from env with sensible defaults
// for the Commander Group demo; a future slice adds a proper tenant-config
// table.
function employerConfig() {
  return {
    tin:     process.env['EMPLOYER_TIN']     ?? '000-000-000-000',
    name:    process.env['EMPLOYER_NAME']    ?? 'Commander Group of Companies',
    address: process.env['EMPLOYER_ADDRESS'] ?? '—',
    type:    'Main' as const,
  };
}

export type BIR2316Export = {
  year: number;
  employee: {
    tin: string | null;
    lastName: string;
    firstName: string;
    middleName: string | null;
    rdoCode: string | null;
    address: string | null;
    dateOfBirth: string | null;
    contactNumber: string | null;
  };
  employer: {
    tin: string;
    name: string;
    address: string;
    type: 'Main' | 'Secondary';
  };
  summary: {
    grossCompensation: number;
    nonTaxable: number;
    taxableFromPresent: number;
    taxableFromPrevious: number;
    grossTaxable: number;
    taxDue: number;
    taxesWithheldPresent: number;
    taxesWithheldPrevious: number;
    totalTaxesWithheldAdjusted: number;
  };
  partialYear: boolean;
  warnings: string[];
};

export async function exportBIR_2316(
  employeeId: string,
  year: number,
  opts: { actorUserId?: string | null } = {},
): Promise<BIR2316Export> {
  const db = getDb();

  // ── 1. Resolve employee ──────────────────────────────────────────────────
  const empRows = await db.select().from(employees).where(eq(employees.id, employeeId));
  const emp = empRows[0];
  if (!emp) {
    throw new Error(`[compliance-exports/bir-2316] Employee not found: ${employeeId}`);
  }

  // ── 2. Load payslips for this employee whose pay_run falls in the year ───
  // Join via pay_runs.periodEnd to pick the calendar year.
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  const slips = await db
    .select({
      grossPay:     payslips.grossPay,
      sssEE:        payslips.sssEE,
      philhealthEE: payslips.philhealthEE,
      pagibigEE:    payslips.pagibigEE,
      birWtax:      payslips.birWtax,
      periodEnd:    payRuns.periodEnd,
    })
    .from(payslips)
    .innerJoin(payRuns, eq(payslips.payRunId, payRuns.id))
    .where(and(
      eq(payslips.employeeId, employeeId),
      gte(payRuns.periodEnd, yearStart),
      lte(payRuns.periodEnd, yearEnd),
    ));

  // ── 3. Sum the IVA fields ────────────────────────────────────────────────
  let gross = 0;
  let nonTax = 0;
  let withheldPresent = 0;
  for (const s of slips) {
    gross           += Number(s.grossPay);
    nonTax          += Number(s.sssEE) + Number(s.philhealthEE) + Number(s.pagibigEE);
    withheldPresent += Number(s.birWtax);
  }
  gross           = round2(gross);
  nonTax          = round2(nonTax);
  withheldPresent = round2(withheldPresent);

  const taxableFromPresent = round2(gross - nonTax);
  const taxableFromPrevious = 0;            // Slice 1: no prior-employer support
  const grossTaxable        = round2(taxableFromPresent + taxableFromPrevious);

  // ── 4. Annual tax due via monthly-bracket equivalence ────────────────────
  // wtaxMonthly resolves brackets via `asOf`; use Dec 31 of the year so the
  // brackets in force at year-end are used.
  const monthlyEquivalent = round2(grossTaxable / 12);
  const monthlyTax        = await wtaxMonthly(monthlyEquivalent, 'MONTHLY', yearEnd);
  const taxDue            = round2(monthlyTax * 12);

  const totalWithheld = round2(withheldPresent + 0);

  // ── 5. partialYear flag ──────────────────────────────────────────────────
  // True if (a) any month of the year is not yet covered by a pay run, or
  // (b) the year is the current year and not yet ended. Slice-1 simplification:
  // if there are not at least 24 semi-monthly slips (or 12 monthly), call it
  // partial. Anything more rigorous needs a calendar-aware aggregator.
  const partialYear = slips.length < 24;

  // ── 6. Warnings ──────────────────────────────────────────────────────────
  const warnings: string[] = [];
  if (!emp.tinNumber) {
    warnings.push(`employee ${emp.employeeCode} has no TIN on file — required for BIR 2316`);
  }
  if (partialYear) {
    warnings.push(`partial-year coverage: only ${slips.length} payslips found in ${year} — acceptable as preview/carry-over, NOT for year-end filing`);
  }

  const result: BIR2316Export = {
    year,
    employee: {
      tin:           emp.tinNumber ?? null,
      lastName:      emp.lastName,
      firstName:     emp.firstName,
      middleName:    emp.middleName ?? null,
      rdoCode:       null,        // not yet in v3 schema
      address:       null,
      dateOfBirth:   null,
      contactNumber: emp.phone ?? null,
    },
    employer: employerConfig(),
    summary: {
      grossCompensation: gross,
      nonTaxable: nonTax,
      taxableFromPresent,
      taxableFromPrevious,
      grossTaxable,
      taxDue,
      taxesWithheldPresent: withheldPresent,
      taxesWithheldPrevious: 0,
      totalTaxesWithheldAdjusted: totalWithheld,
    },
    partialYear,
    warnings,
  };

  // ── 7. Audit + event ─────────────────────────────────────────────────────
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'compliance.export.bir_2316',
    target: { kind: 'hr_employee', id: emp.id },
    payload: {
      year,
      employeeCode: emp.employeeCode,
      grossCompensation: gross,
      taxDue,
      partialYear,
      warnings: warnings.length,
    },
  });
  await events.publish('compliance.export.bir_2316', {
    employeeId: emp.id,
    year,
    partialYear,
  });

  return result;
}
