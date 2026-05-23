import { describe, it, expect, vi } from 'vitest';
import { computePayrollLine, type PayrollRates } from './compute';

// ─── Fixture: hand-extracted 2026 rates (MSC 18,000) ──────────────────────────
// SSS at MSC 18,000: regular EE share 720 + WISP EE share 180 = 900 total
// PhilHealth: 5% × 18,000 ÷ 2 = 450
// Pag-IBIG: capped at 200
// WTAX: 0 for this income bracket (below the threshold in the fixture)
const RATES_2026: PayrollRates = {
  sssBracketForMonthly: async (_m: number) => ({ eeShareRegular: 720, eeShareWisp: 180 }),
  philhealthEE: async (_m: number) => 450,
  pagibigEE: async (_m: number) => 200,
  wtaxMonthly: async (_taxable: number, _freq) => 0,
};

describe('computePayrollLine', () => {
  // ─── Test 1: CGoC-typical case, SEMI_MONTHLY first cut (15th) ─────────────
  // 18,000 / 26 = 692.307... × 13 = 9,000
  // isFinalCutOfMonth: false → statutory deductions are all 0
  it('SEMI_MONTHLY first cut (15th): gross ≈ 9000, statutory = 0, net ≈ 9000', async () => {
    const result = await computePayrollLine({
      basicSalaryMonthly: 18_000,
      payFrequency: 'SEMI_MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 13,
      otHours: 0,
      isFinalCutOfMonth: false,
      rates: RATES_2026,
    });

    expect(result.grossPay).toBeCloseTo(9000, 2);
    expect(result.sssEE).toBe(0);
    expect(result.philhealthEE).toBe(0);
    expect(result.pagibigEE).toBe(0);
    expect(result.birWtax).toBe(0);
    expect(result.netPay).toBeCloseTo(9000, 2);
    expect(result.breakdown['applyStatutory']).toBe('no');
  });

  // ─── Test 2: SEMI_MONTHLY final cut (30th) ────────────────────────────────
  // gross ≈ 9000; sssEE=900, philhealthEE=450, pagibigEE=200, birWtax=0
  // net = 9000 - 900 - 450 - 200 = 7450
  it('SEMI_MONTHLY final cut (30th): full statutory deducted, net = 7450', async () => {
    const result = await computePayrollLine({
      basicSalaryMonthly: 18_000,
      payFrequency: 'SEMI_MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 13,
      otHours: 0,
      isFinalCutOfMonth: true,
      rates: RATES_2026,
    });

    expect(result.grossPay).toBeCloseTo(9000, 2);
    expect(result.sssEE).toBe(900);
    expect(result.philhealthEE).toBe(450);
    expect(result.pagibigEE).toBe(200);
    expect(result.birWtax).toBe(0);
    expect(result.netPay).toBeCloseTo(7450, 2);
    expect(result.breakdown['applyStatutory']).toBe('yes');
  });

  // ─── Test 3: MONTHLY, full month worked ───────────────────────────────────
  // 18,000 / 26 × 26 = 18,000; full statutory applied once
  it('MONTHLY: 26 days worked → gross = 18000, full statutory applied once', async () => {
    const result = await computePayrollLine({
      basicSalaryMonthly: 18_000,
      payFrequency: 'MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 26,
      otHours: 0,
      rates: RATES_2026,
    });

    expect(result.grossPay).toBeCloseTo(18_000, 2);
    expect(result.sssEE).toBe(900);
    expect(result.philhealthEE).toBe(450);
    expect(result.pagibigEE).toBe(200);
    expect(result.birWtax).toBe(0);
    expect(result.netPay).toBeCloseTo(16_450, 2);
    expect(result.breakdown['applyStatutory']).toBe('yes');
  });

  // ─── Test 4: Zero days worked → grossPay = 0, netPay clamped to 0 ─────────
  // Even though statutory deductions are computed (900 + 450 + 200 = 1550),
  // netPay = max(0, 0 - 1550) = 0 per the spec.
  it('MONTHLY: 0 days worked → grossPay = 0, netPay clamped to 0', async () => {
    const result = await computePayrollLine({
      basicSalaryMonthly: 18_000,
      payFrequency: 'MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 0,
      otHours: 0,
      rates: RATES_2026,
    });

    expect(result.grossPay).toBe(0);
    // Statutory is still computed and returned in the result
    expect(result.sssEE).toBe(900);
    expect(result.philhealthEE).toBe(450);
    expect(result.pagibigEE).toBe(200);
    // Net clamped — never goes negative
    expect(result.netPay).toBe(0);
  });

  // ─── Test 5: OT contribution stacks ────────────────────────────────────────
  // dailyRate = 18000 / 26 = 692.307...
  // hourlyRate = 692.307... / 8 = 86.538...
  // otPay = 8 × 86.538... × 1.25 = 865.384...
  // gross = 18000 + 865.384... ≈ 18865.38
  it('MONTHLY: 26 days + 8 OT hours → otPay ≈ 865.38, gross ≈ 18865.38', async () => {
    const result = await computePayrollLine({
      basicSalaryMonthly: 18_000,
      payFrequency: 'MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 26,
      otHours: 8,
      rates: RATES_2026,
    });

    expect(result.breakdown['otPay']).toBeCloseTo(865.38, 1);
    expect(result.grossPay).toBeCloseTo(18_865.38, 1);
    // Statutory still applied once (MONTHLY)
    expect(result.sssEE).toBe(900);
  });

  // ─── Test 6: WTAX mock spy — verify it receives correct args ───────────────
  it('passes correct taxable amount and frequency to wtaxMonthly', async () => {
    const wtaxSpy = vi.fn(async (_taxable: number, _freq: 'MONTHLY' | 'SEMI_MONTHLY') => 1500);

    const spyRates: PayrollRates = {
      ...RATES_2026,
      wtaxMonthly: wtaxSpy,
    };

    const result = await computePayrollLine({
      basicSalaryMonthly: 18_000,
      payFrequency: 'MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 26,
      otHours: 0,
      rates: spyRates,
    });

    expect(wtaxSpy).toHaveBeenCalledOnce();

    const [calledTaxable, calledFreq] = wtaxSpy.mock.calls[0]!;
    // taxable = gross - sssEE - philhealthEE - pagibigEE = 18000 - 900 - 450 - 200 = 16450
    expect(calledTaxable).toBeCloseTo(16_450, 2);
    expect(calledFreq).toBe('MONTHLY');

    // birWtax in result should reflect what the spy returned
    expect(result.birWtax).toBe(1500);
  });

  // ─── Test 7: Rounding — all monetary outputs are 2 dp ─────────────────────
  it('all monetary outputs are rounded to 2 decimal places', async () => {
    const result = await computePayrollLine({
      basicSalaryMonthly: 18_000,
      payFrequency: 'SEMI_MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 13,
      otHours: 3,
      isFinalCutOfMonth: true,
      rates: RATES_2026,
    });

    const monetaryFields = [result.grossPay, result.sssEE, result.philhealthEE, result.pagibigEE, result.birWtax, result.netPay];
    for (const val of monetaryFields) {
      // Check it equals itself rounded to 2 dp (i.e., no extra decimals)
      expect(val).toBe(Math.round(val * 100) / 100);
    }
  });
});
