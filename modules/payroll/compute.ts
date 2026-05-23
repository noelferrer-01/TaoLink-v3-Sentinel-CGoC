/**
 * computePayrollLine — pure payroll-math function (no DB, no I/O).
 *
 * SEMI_MONTHLY statutory-deduction convention
 * ─────────────────────────────────────────────
 * SSS, PhilHealth, and Pag-IBIG are monthly figures under Philippine regulation.
 * For SEMI_MONTHLY frequency (15th + 30th cuts), this engine applies the full
 * monthly statutory deduction ONLY on the cut where isFinalCutOfMonth === true
 * (the 30th/31st cut). The 15th cut carries zero statutory deductions.
 * This mirrors many PH payroll systems and matches v2 behaviour.
 *
 * Rate lookups are async (Task 6.4 refactor): in production, rate functions hit
 * the compliance service via DB queries, which are inherently async. The test
 * fixtures supply async arrow functions returning Promise.resolve(...) so the
 * contract is the same in tests and at runtime.
 */

import { round2 } from '@/core/money';

export type PayrollFrequency = 'MONTHLY' | 'SEMI_MONTHLY';

export type PayrollRates = {
  sssBracketForMonthly: (monthly: number) => Promise<{ eeShareRegular: number; eeShareWisp: number }>;
  philhealthEE: (monthly: number) => Promise<number>;
  pagibigEE: (monthly: number) => Promise<number>;
  wtaxMonthly: (taxableMonthly: number, freq: PayrollFrequency) => Promise<number>;
};

export type PayrollComputeInput = {
  basicSalaryMonthly: number;
  payFrequency: PayrollFrequency;
  workDaysPerMonth: number;       // typically 26 for guards
  daysWorked: number;
  otHours: number;
  isFinalCutOfMonth?: boolean;    // for SEMI_MONTHLY: true on the 30th/31st cut, false on the 15th cut
  rates: PayrollRates;
};

export type PayrollComputeResult = {
  grossPay: number;
  sssEE: number;
  philhealthEE: number;
  pagibigEE: number;
  birWtax: number;
  netPay: number;
  breakdown: Record<string, number | string>;
};

export async function computePayrollLine(input: PayrollComputeInput): Promise<PayrollComputeResult> {
  const dailyRate = input.basicSalaryMonthly / input.workDaysPerMonth;
  const hourlyRate = dailyRate / 8;
  const basicEarnings = dailyRate * input.daysWorked;
  const otPay = input.otHours * hourlyRate * 1.25;
  const grossPay = round2(Math.max(0, basicEarnings + otPay));

  // Statutory deductions are MONTHLY figures by regulation.
  // For SEMI_MONTHLY, apply on the final cut of the month (convention); ₱0 on the first cut.
  const applyStatutory =
    input.payFrequency === 'MONTHLY' ||
    (input.payFrequency === 'SEMI_MONTHLY' && input.isFinalCutOfMonth === true);

  const sssBracket = await input.rates.sssBracketForMonthly(input.basicSalaryMonthly);
  const sssEEMonthly = (sssBracket?.eeShareRegular ?? 0) + (sssBracket?.eeShareWisp ?? 0);
  const philhealthEEMonthly = await input.rates.philhealthEE(input.basicSalaryMonthly);
  const pagibigEEMonthly = await input.rates.pagibigEE(input.basicSalaryMonthly);

  const sssEE        = applyStatutory ? round2(sssEEMonthly) : 0;
  const philhealthEE = applyStatutory ? round2(philhealthEEMonthly) : 0;
  const pagibigEE    = applyStatutory ? round2(pagibigEEMonthly) : 0;

  // BIR WTAX: taxable = gross minus non-taxable statutory contributions.
  const taxableForCut = round2(grossPay - sssEE - philhealthEE - pagibigEE);
  const birWtax = round2(await input.rates.wtaxMonthly(Math.max(0, taxableForCut), input.payFrequency));

  const netPay = round2(Math.max(0, grossPay - sssEE - philhealthEE - pagibigEE - birWtax));

  return {
    grossPay, sssEE, philhealthEE, pagibigEE, birWtax, netPay,
    breakdown: {
      dailyRate: round2(dailyRate),
      hourlyRate: round2(hourlyRate),
      basicEarnings: round2(basicEarnings),
      otPay: round2(otPay),
      applyStatutory: applyStatutory ? 'yes' : 'no',
      sssEEMonthly: round2(sssEEMonthly),
      philhealthEEMonthly: round2(philhealthEEMonthly),
      pagibigEEMonthly: round2(pagibigEEMonthly),
      taxableForCut,
    },
  };
}
