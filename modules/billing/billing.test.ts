/**
 * billing.test.ts — integration tests for the billing module.
 *
 * Coverage (Slice 4, Task 3 — Task 4 additions):
 *   setClientBillingConfig — insert, upsert (same client → still one row), audit
 *   getClientBillingConfig — returns null when unset, row when set
 *   generateInvoice         — happy path, guards, mid-period transfer, re-generate,
 *                             finalized guard, local check, audit PII check
 *   getInvoiceWithLines     — returns invoice + ordered lines
 *
 * Fixture order for cleanup (FK-safe):
 *   billing_invoice_lines → billing_invoices → client_billing_config →
 *   payslips → pay_runs → dtr_entries → dtr_period_closes →
 *   assignments → detachments → clients → employees → persons
 *
 * closeDb is called ONCE at the file level (afterAll below), not per describe
 * block, to avoid closing the shared connection while other suites are still
 * running.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq, gte, sql } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { clients as clientsTable, detachments } from '@/modules/clients/schema';
import { clientBillingConfig, billingInvoices, billingInvoiceLines } from './schema';
import { auditLog } from '@/modules/audit/schema';
import { clients } from '@/modules/clients/index';
import { assignments } from '@/modules/assignments/index';
import { hr } from '@/modules/hr/index';
import { payRuns, payslips } from '@/modules/payroll/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { employees } from '@/modules/hr/schema';
import { persons } from '@/modules/persons/schema';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { runPayroll } from '@/modules/payroll/index';
import { recordDTR } from '@/modules/dtr/index';
import {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
} from './service';

// ─── Shared cleanup ──────────────────────────────────────────────────────────

async function cleanup() {
  const db = getDb();
  // FK order: lines → invoices → config → payslips → pay_runs →
  //   dtr_entries → dtr_period_closes → assignments → detachments →
  //   clients → employees → persons
  await db.delete(billingInvoiceLines);
  await db.delete(billingInvoices);
  await db.delete(clientBillingConfig);
  await db.delete(payslips);
  await db.delete(payRuns);
  await db.delete(dtrEntries);
  await db.delete(dtrPeriodCloses);
  await db.delete(assignmentsTable);
  await db.delete(detachments);
  await db.delete(clientsTable);
  await db.delete(employees);
  await db.delete(persons);
}

// ─── Tests — setClientBillingConfig ──────────────────────────────────────────

describe('billing.setClientBillingConfig', () => {
  beforeEach(cleanup);

  it('inserts a billing config for a new client', async () => {
    const client = await clients.createClient({ name: 'Commander Group' });

    const config = await setClientBillingConfig({
      clientId: client.id,
      ratePerManday: '650.00',
    });

    expect(config.clientId).toBe(client.id);
    expect(config.ratePerManday).toBe('650.00');
    expect(config.paymentTermsDays).toBe(15);
    expect(config.chargesVat).toBe(true);
    expect(config.clientWithholdsEwt).toBe(true);
    expect(config.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('upserts — updating the same client changes the rate, still only one row', async () => {
    const client = await clients.createClient({ name: 'Client Upsert Test' });

    await setClientBillingConfig({ clientId: client.id, ratePerManday: '500.00' });
    const updated = await setClientBillingConfig({
      clientId: client.id,
      ratePerManday: '750.00',
      paymentTermsDays: 30,
    });

    expect(updated.ratePerManday).toBe('750.00');
    expect(updated.paymentTermsDays).toBe(30);

    // Confirm exactly one row for this client in the DB.
    const rows = await getDb()
      .select()
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientId, client.id));
    expect(rows.length).toBe(1);
  });

  it('audits billing.config.updated with clientId only (no PII)', async () => {
    const client = await clients.createClient({ name: 'PII Test Client' });

    // actorUserId must be a UUID or null (FK to users.id); pass null in tests.
    await setClientBillingConfig({
      clientId: client.id,
      ratePerManday: '600.00',
      actorUserId: null,
    });

    const rows = await getDb().select().from(auditLog)
      .where(sql`action = 'billing.config.updated' AND target_id = ${client.id}`);

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const blob = JSON.stringify(rows[0]!.payload);
    // clientId is the only expected payload field
    expect(blob).toContain(client.id);
    // client name must NOT leak into the audit payload
    expect(blob).not.toContain('PII Test Client');
  });
});

// ─── Tests — getClientBillingConfig ──────────────────────────────────────────

describe('billing.getClientBillingConfig', () => {
  beforeEach(cleanup);

  it('returns null when no config is set for the client', async () => {
    const client = await clients.createClient({ name: 'No Config Client' });
    const result = await getClientBillingConfig(client.id);
    expect(result).toBeNull();
  });

  it('returns the config row when set', async () => {
    const client = await clients.createClient({ name: 'Has Config Client' });
    await setClientBillingConfig({
      clientId: client.id,
      ratePerManday: '400.00',
      chargesVat: false,
    });

    const result = await getClientBillingConfig(client.id);
    expect(result).not.toBeNull();
    expect(result!.clientId).toBe(client.id);
    expect(result!.ratePerManday).toBe('400.00');
    expect(result!.chargesVat).toBe(false);
  });
});

// ─── Tests — generateInvoice ──────────────────────────────────────────────────
//
// All tests in this suite share a beforeAll compliance seed (idempotent) and
// a beforeEach that wipes billing + payroll + dtr + org rows.

describe('billing.generateInvoice', () => {
  const db = getDb();
  let testStart: Date;

  beforeAll(async () => {
    // Compliance rates must exist for runPayroll (used to build fixtures).
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    testStart = new Date();
    await cleanup();
  });

  // ─── Guard: no pay run for the period ─────────────────────────────────────
  it('throws when no pay run exists for the period', async () => {
    const client = await clients.createClient({ name: 'No-run Client' });
    await setClientBillingConfig({ clientId: client.id, ratePerManday: '780.00' });

    await expect(
      generateInvoice(client.id, { start: '2026-05-16', end: '2026-05-31' }),
    ).rejects.toThrow(/run .*payroll.*first/i);
  });

  // ─── Guard: no billing rate set for client ────────────────────────────────
  it('throws when no billing rate is set for the client', async () => {
    // Create a pay run without a billing config by inserting one row directly
    // (no employees needed — payRuns has no FK to employees).
    await db.insert(payRuns).values({
      periodStart: '2026-05-16',
      periodEnd: '2026-05-31',
      status: 'calculated',
      workDaysPerMonth: 26,
    });

    const client = await clients.createClient({ name: 'No-rate Client' });
    // No billing config set

    await expect(
      generateInvoice(client.id, { start: '2026-05-16', end: '2026-05-31' }),
    ).rejects.toThrow(/billing rate/i);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────
  // Guard A: 15 days, Guard C: 12 days; rate 780
  // Expected: lines (A→11700, C→9360), subtotal 21060, VAT 2527.20, EWT 421.20,
  //           total 23166.00
  it('happy path: two guards at one detachment produce correct lines and totals', async () => {
    const clientX = await clients.createClient({ name: 'Client-Main' });
    const detMain = await clients.createDetachment({ clientId: clientX.id, name: 'Main' });

    const guardA = await hr.createEmployee({
      employeeCode: 'CG-INV-A',
      firstName: 'Ana',
      lastName: 'Reyes',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });
    const guardC = await hr.createEmployee({
      employeeCode: 'CG-INV-C',
      firstName: 'Carlos',
      lastName: 'Garcia',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });

    // Assign both guards to Main detachment
    await assignments.assign({ employeeId: guardA.id, detachmentId: detMain.id, startDate: '2026-05-01' });
    await assignments.assign({ employeeId: guardC.id, detachmentId: detMain.id, startDate: '2026-05-01' });

    // Record 15 worked days for guard A (May 1-15 = 15 days)
    for (let d = 1; d <= 15; d++) {
      const date = `2026-05-${String(d).padStart(2, '0')}`;
      await recordDTR({ employeeId: guardA.id, date, status: 'worked' });
    }
    // Record 12 worked days for guard C (May 1-12 = 12 days)
    for (let d = 1; d <= 12; d++) {
      const date = `2026-05-${String(d).padStart(2, '0')}`;
      await recordDTR({ employeeId: guardC.id, date, status: 'worked' });
    }

    // Run payroll — this creates the pay run + payslips (15 and 12 daysWorked)
    await runPayroll('2026-05-01', '2026-05-15');

    // Set billing config: rate 780, chargesVat=true, clientWithholdsEwt=true
    await setClientBillingConfig({
      clientId: clientX.id,
      ratePerManday: '780.00',
      chargesVat: true,
      clientWithholdsEwt: true,
    });

    const invoice = await generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' });

    // Status
    expect(invoice.status).toBe('draft');

    // Exactly two lines
    expect(invoice.lines).toHaveLength(2);

    // Find lines by code
    const lineA = invoice.lines.find(l => l.employeeCodeSnapshot === 'CG-INV-A')!;
    const lineC = invoice.lines.find(l => l.employeeCodeSnapshot === 'CG-INV-C')!;

    expect(lineA).toBeDefined();
    expect(lineA.daysWorked).toBe(15);
    expect(lineA.ratePerManday).toBe('780.00');
    expect(lineA.amount).toBe('11700.00');
    expect(lineA.employeeNameSnapshot).toBe('Reyes, Ana');
    expect(lineA.detachmentNameSnapshot).toBe('Main');

    expect(lineC).toBeDefined();
    expect(lineC.daysWorked).toBe(12);
    expect(lineC.ratePerManday).toBe('780.00');
    expect(lineC.amount).toBe('9360.00');
    expect(lineC.employeeNameSnapshot).toBe('Garcia, Carlos');
    expect(lineC.detachmentNameSnapshot).toBe('Main');

    // Invoice totals
    expect(invoice.subtotal).toBe('21060.00');
    expect(invoice.vatAmount).toBe('2527.20');
    expect(invoice.ewtAmount).toBe('421.20');
    expect(invoice.totalDue).toBe('23166.00');
  });

  // ─── Mid-period transfer ──────────────────────────────────────────────────
  // Guard transferred mid-period: days at Client-X appear on X's invoice only.
  it('mid-period transfer: guard days are attributed by frozen assignment stamp', async () => {
    const clientX = await clients.createClient({ name: 'Client-X' });
    const clientY = await clients.createClient({ name: 'Client-Y' });
    const detX = await clients.createDetachment({ clientId: clientX.id, name: 'X Post' });
    const detY = await clients.createDetachment({ clientId: clientY.id, name: 'Y Post' });

    const guard = await hr.createEmployee({
      employeeCode: 'CG-TRF-01',
      firstName: 'Transfer',
      lastName: 'Guard',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });

    // Assign to Client-X from May 1
    const assignX = await assignments.assign({
      employeeId: guard.id,
      detachmentId: detX.id,
      startDate: '2026-05-01',
    });

    // Record 5 days at Client-X (May 1-5) — stamped with X assignment
    for (let d = 1; d <= 5; d++) {
      await recordDTR({ employeeId: guard.id, date: `2026-05-0${d}`, status: 'worked' });
    }

    // End X assignment on May 5, then assign to Client-Y from May 6
    await assignments.endAssignment(assignX.id, '2026-05-05', 'transfer');
    await assignments.assign({ employeeId: guard.id, detachmentId: detY.id, startDate: '2026-05-06' });

    // Record 3 days at Client-Y (May 6-8) — stamped with Y assignment
    for (let d = 6; d <= 8; d++) {
      await recordDTR({ employeeId: guard.id, date: `2026-05-0${d}`, status: 'worked' });
    }

    // Run payroll (8 total days across both clients)
    await runPayroll('2026-05-01', '2026-05-15');

    await setClientBillingConfig({ clientId: clientX.id, ratePerManday: '780.00' });
    await setClientBillingConfig({ clientId: clientY.id, ratePerManday: '780.00' });

    const invoiceX = await generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' });
    const invoiceY = await generateInvoice(clientY.id, { start: '2026-05-01', end: '2026-05-15' });

    // X invoice has exactly 5 days for the guard
    expect(invoiceX.lines).toHaveLength(1);
    expect(invoiceX.lines[0]!.daysWorked).toBe(5);

    // Y invoice has exactly 3 days for the guard
    expect(invoiceY.lines).toHaveLength(1);
    expect(invoiceY.lines[0]!.daysWorked).toBe(3);
  });

  // ─── Re-generate draft wipes + recomputes ─────────────────────────────────
  it('re-generating a draft wipes lines and reflects new rate', async () => {
    const clientX = await clients.createClient({ name: 'Regen Client' });
    const detX = await clients.createDetachment({ clientId: clientX.id, name: 'Regen Post' });
    const guard = await hr.createEmployee({
      employeeCode: 'CG-REGEN-01',
      firstName: 'Regen',
      lastName: 'Guard',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });

    await assignments.assign({ employeeId: guard.id, detachmentId: detX.id, startDate: '2026-05-01' });
    for (let d = 1; d <= 10; d++) {
      await recordDTR({
        employeeId: guard.id,
        date: `2026-05-${String(d).padStart(2, '0')}`,
        status: 'worked',
      });
    }
    await runPayroll('2026-05-01', '2026-05-15');
    await setClientBillingConfig({ clientId: clientX.id, ratePerManday: '700.00' });

    // First generation
    const first = await generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' });
    expect(first.lines[0]!.amount).toBe('7000.00');

    // Change rate and re-generate
    await setClientBillingConfig({ clientId: clientX.id, ratePerManday: '800.00' });
    const second = await generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' });

    // Same invoice id (draft was reused)
    expect(second.id).toBe(first.id);

    // Lines updated — exactly 1 line, new rate
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0]!.ratePerManday).toBe('800.00');
    expect(second.lines[0]!.amount).toBe('8000.00');
  });

  // ─── Refuses when invoice is already finalized ────────────────────────────
  it('throws when invoice status is finalized', async () => {
    const clientX = await clients.createClient({ name: 'Finalized Client' });
    const detX = await clients.createDetachment({ clientId: clientX.id, name: 'Fin Post' });
    const guard = await hr.createEmployee({
      employeeCode: 'CG-FIN-01',
      firstName: 'Final',
      lastName: 'Guard',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });
    await assignments.assign({ employeeId: guard.id, detachmentId: detX.id, startDate: '2026-05-01' });
    for (let d = 1; d <= 5; d++) {
      await recordDTR({ employeeId: guard.id, date: `2026-05-0${d}`, status: 'worked' });
    }
    await runPayroll('2026-05-01', '2026-05-15');
    await setClientBillingConfig({ clientId: clientX.id, ratePerManday: '780.00' });

    // Generate and then manually finalize
    const draft = await generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' });
    await db.update(billingInvoices)
      .set({ status: 'finalized' })
      .where(eq(billingInvoices.id, draft.id));

    await expect(
      generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' }),
    ).rejects.toThrow(/finalized/i);
  });

  // ─── Local check: billed days exceed payslip daysWorked ──────────────────
  it('throws when billed days exceed payslip daysWorked for a guard', async () => {
    const clientX = await clients.createClient({ name: 'Overage Client' });
    const detX = await clients.createDetachment({ clientId: clientX.id, name: 'Overage Post' });
    const guard = await hr.createEmployee({
      employeeCode: 'CG-OVER-01',
      firstName: 'Over',
      lastName: 'Guard',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });

    await assignments.assign({ employeeId: guard.id, detachmentId: detX.id, startDate: '2026-05-01' });

    // Record 10 days BEFORE running payroll
    for (let d = 1; d <= 10; d++) {
      await recordDTR({
        employeeId: guard.id,
        date: `2026-05-${String(d).padStart(2, '0')}`,
        status: 'worked',
      });
    }

    // Run payroll — payslip will have daysWorked=10
    await runPayroll('2026-05-01', '2026-05-15');

    // Knock the payslip's daysWorked DOWN to 5 to simulate a mismatch:
    // DTR says 10, payslip says 5 → billed 10 > payslip 5 → should throw
    const [run] = await db
      .select()
      .from(payRuns)
      .where(and(eq(payRuns.periodStart, '2026-05-01'), eq(payRuns.periodEnd, '2026-05-15')))
      .limit(1);
    await db.update(payslips)
      .set({ daysWorked: '5' })
      .where(eq(payslips.payRunId, run!.id));

    await setClientBillingConfig({ clientId: clientX.id, ratePerManday: '780.00' });

    await expect(
      generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' }),
    ).rejects.toThrow(/exceeds payroll/i);
  });

  // ─── Audit: billing.invoice.generated has NO PII ─────────────────────────
  it('audits billing.invoice.generated with no guard name/PII in payload', async () => {
    const clientX = await clients.createClient({ name: 'Audit PII Client' });
    const detX = await clients.createDetachment({ clientId: clientX.id, name: 'Audit Post' });
    const guard = await hr.createEmployee({
      employeeCode: 'CG-AUD-01',
      firstName: 'SecretFirst',
      lastName: 'SecretLast',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });
    await assignments.assign({ employeeId: guard.id, detachmentId: detX.id, startDate: '2026-05-01' });
    for (let d = 1; d <= 5; d++) {
      await recordDTR({ employeeId: guard.id, date: `2026-05-0${d}`, status: 'worked' });
    }
    await runPayroll('2026-05-01', '2026-05-15');
    await setClientBillingConfig({ clientId: clientX.id, ratePerManday: '780.00' });

    await generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' });

    // Find the billing.invoice.generated audit record created after testStart
    const rows = await db.select().from(auditLog).where(gte(auditLog.createdAt, testStart));
    const genRow = rows.find(r => r.action === 'billing.invoice.generated');

    expect(genRow).toBeDefined();
    const blob = JSON.stringify(genRow!.payload);

    // Required fields in payload
    expect(blob).toContain(clientX.id);
    expect(blob).toContain('subtotal');
    expect(blob).toContain('totalDue');

    // Must NOT contain guard name PII
    expect(blob).not.toContain('SecretFirst');
    expect(blob).not.toContain('SecretLast');
    // Must NOT contain guard employee code
    expect(blob).not.toContain('CG-AUD-01');
  });

  // ─── getInvoiceWithLines ──────────────────────────────────────────────────
  it('getInvoiceWithLines returns null for a non-existent id', async () => {
    const result = await getInvoiceWithLines('00000000-0000-0000-0000-000000000099');
    expect(result).toBeNull();
  });

  it('getInvoiceWithLines returns invoice with lines ordered by employeeCodeSnapshot', async () => {
    const clientX = await clients.createClient({ name: 'Lines Order Client' });
    const det = await clients.createDetachment({ clientId: clientX.id, name: 'Lines Post' });

    const guardA = await hr.createEmployee({
      employeeCode: 'CG-ORD-A',
      firstName: 'Alpha',
      lastName: 'First',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });
    const guardB = await hr.createEmployee({
      employeeCode: 'CG-ORD-B',
      firstName: 'Beta',
      lastName: 'Second',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });

    await assignments.assign({ employeeId: guardA.id, detachmentId: det.id, startDate: '2026-05-01' });
    await assignments.assign({ employeeId: guardB.id, detachmentId: det.id, startDate: '2026-05-01' });

    for (let d = 1; d <= 3; d++) {
      await recordDTR({ employeeId: guardA.id, date: `2026-05-0${d}`, status: 'worked' });
    }
    for (let d = 1; d <= 5; d++) {
      await recordDTR({ employeeId: guardB.id, date: `2026-05-0${d}`, status: 'worked' });
    }

    await runPayroll('2026-05-01', '2026-05-15');
    await setClientBillingConfig({ clientId: clientX.id, ratePerManday: '780.00' });

    const inv = await generateInvoice(clientX.id, { start: '2026-05-01', end: '2026-05-15' });
    const fetched = await getInvoiceWithLines(inv.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(inv.id);
    expect(fetched!.lines).toHaveLength(2);

    // Lines ordered by employeeCodeSnapshot ascending
    expect(fetched!.lines[0]!.employeeCodeSnapshot).toBe('CG-ORD-A');
    expect(fetched!.lines[1]!.employeeCodeSnapshot).toBe('CG-ORD-B');
  });
});

// ─── Close the shared DB connection once at the file level ───────────────────
afterAll(async () => {
  await closeDb();
});
