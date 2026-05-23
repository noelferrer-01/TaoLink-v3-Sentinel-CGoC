import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/core/db';
import { seedComplianceRates } from './seed';
import { compliance } from './index';

describe('compliance rate lookups', () => {
  beforeAll(async () => {
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });
  afterAll(async () => { await closeDb(); });

  it('SSS: bracket for MSC 20,000 has WISP carve-out', async () => {
    const b = await compliance.sssBracketForMonthly(20000, '2026-06-01');
    expect(b).not.toBeNull();
    expect(Number(b!.eeShareRegular) + Number(b!.eeShareWisp)).toBeCloseTo(1000, 2); // 5%
  });

  it('PhilHealth: 25k monthly → ₱625 EE (5% / 2 since 50/50 split)', async () => {
    const p = await compliance.philhealthEE(25000, '2026-06-01');
    expect(p).toBeCloseTo(625, 2);
  });

  it('Pag-IBIG: 5,000 monthly → ₱100 EE; 15,000 monthly → ₱200 EE (cap)', async () => {
    expect(await compliance.pagibigEE(5000, '2026-06-01')).toBeCloseTo(100, 2);
    expect(await compliance.pagibigEE(15000, '2026-06-01')).toBeCloseTo(200, 2);
  });

  it('BIR WTAX MONTHLY: ₱25,000 taxable → ₱625 (15% over 20,833)', async () => {
    const tax = await compliance.wtaxMonthly(25000, 'MONTHLY', '2026-06-01');
    expect(tax).toBeCloseTo((25000 - 20833) * 0.15, 2);
  });
});
