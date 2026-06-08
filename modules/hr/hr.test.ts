import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { employees } from './schema';
import { auditLog } from '@/modules/audit/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { hr } from './index';
import { _resetEventsForTests } from '@/modules/events';

// FK-ordered cleanup helper reused across describe blocks
async function cleanupEmployees() {
  await getDb().delete(payslips);
  await getDb().delete(payRuns);
  await getDb().delete(dtrEntries);
  await getDb().delete(dtrPeriodCloses);
  await getDb().delete(assignmentsTable);
  await getDb().delete(employees);
}

describe('hr.createEmployee + state machine', () => {
  beforeEach(async () => {
    // FK order: payslips → pay_runs → dtr_entries → dtr_period_closes → assignments → employees
    await getDb().delete(payslips);
    await getDb().delete(payRuns);
    await getDb().delete(dtrEntries);
    await getDb().delete(dtrPeriodCloses);
    await getDb().delete(assignmentsTable);
    await getDb().delete(employees);
  });
  afterAll(async () => { await closeDb(); });

  it('creates an employee with defaults', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-00001', firstName: 'Juan', lastName: 'Dela Cruz',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    expect(e.status).toBe('hired');
    expect(e.payFrequency).toBe('SEMI_MONTHLY');
    expect(Number(e.basicSalary)).toBe(18000);
  });

  it('rejects duplicate email', async () => {
    await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01', email: 'a@x.com' });
    await expect(hr.createEmployee({ employeeCode: 'CG-2', firstName: 'C', lastName: 'D', basicSalary: 18000, hiredOn: '2026-05-01', email: 'a@x.com' }))
      .rejects.toThrow(/email/i);
  });

  it('allows hired → deployed', async () => {
    const e = await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
    const updated = await hr.changeStatus(e.id, 'deployed', 'assigned to SM Megamall');
    expect(updated.status).toBe('deployed');
  });

  it('rejects terminated → deployed', async () => {
    const e = await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
    await hr.changeStatus(e.id, 'terminated', 'AWOL');
    await expect(hr.changeStatus(e.id, 'deployed', 'oops')).rejects.toThrow(/transition/i);
  });

  it('allows deployed → hired (return to neutral employed state)', async () => {
    const e = await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
    await hr.changeStatus(e.id, 'deployed', 'assigned to SM Megamall');
    const back = await hr.changeStatus(e.id, 'hired', 'pulled off all detachments');
    expect(back.status).toBe('hired');
  });

  it('allows on_leave → hired (back from leave)', async () => {
    const e = await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
    await hr.changeStatus(e.id, 'on_leave', 'maternity leave');
    const back = await hr.changeStatus(e.id, 'hired', 'returned from leave');
    expect(back.status).toBe('hired');
  });
});

describe('hr.bulkImportEmployees', () => {
  beforeEach(async () => {
    // FK order: payslips → pay_runs → dtr_entries → dtr_period_closes → assignments → employees
    await getDb().delete(payslips);
    await getDb().delete(payRuns);
    await getDb().delete(dtrEntries);
    await getDb().delete(dtrPeriodCloses);
    await getDb().delete(assignmentsTable);
    await getDb().delete(employees);
  });
  afterAll(async () => { await closeDb(); });

  it('bulk imports 3 valid rows', async () => {
    const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on
CG-1,Juan,Dela Cruz,juan@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-2,Maria,Santos,maria@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-3,Pedro,Reyes,pedro@x.com,18000,SEMI_MONTHLY,2026-05-01`;
    const result = await hr.bulkImportEmployees(csv);
    expect(result.imported).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it('flags duplicate email inside the batch (row 2 wins, row 3 errors)', async () => {
    const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on
CG-1,A,B,dup@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-2,C,D,dup@x.com,18000,SEMI_MONTHLY,2026-05-01`;
    const result = await hr.bulkImportEmployees(csv);
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 2, reason: expect.stringMatching(/dup@x\.com/) });
  });

  it('flags email that already exists in DB (per-row error, batch continues)', async () => {
    await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01', email: 'existing@x.com' });
    const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on
CG-2,C,D,existing@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-3,E,F,new@x.com,18000,SEMI_MONTHLY,2026-05-01`;
    const result = await hr.bulkImportEmployees(csv);
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1, reason: expect.stringMatching(/existing@x\.com/) });
  });

  it('flags invalid basic_salary with plain-language error', async () => {
    const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on
CG-1,A,B,a@x.com,not-a-number,SEMI_MONTHLY,2026-05-01`;
    const result = await hr.bulkImportEmployees(csv);
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    const firstError = result.errors[0];
    expect(firstError?.reason).toMatch(/basic salary must be a positive number/);
  });
});

describe('hr.listEmployees', () => {
  beforeEach(async () => {
    await getDb().delete(payslips);
    await getDb().delete(payRuns);
    await getDb().delete(dtrEntries);
    await getDb().delete(dtrPeriodCloses);
    await getDb().delete(assignmentsTable);
    await getDb().delete(employees);
  });
  afterAll(async () => { await closeDb(); });

  it('returns empty array when no employees', async () => {
    const rows = await hr.listEmployees();
    expect(rows).toEqual([]);
  });

  it('returns employees sorted by last name then first name', async () => {
    await hr.createEmployee({ employeeCode: 'CG-2', firstName: 'Pedro',  lastName: 'Santos',    basicSalary: 18000, hiredOn: '2026-05-01' });
    await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'Juan',   lastName: 'Dela Cruz', basicSalary: 18000, hiredOn: '2026-05-01' });
    await hr.createEmployee({ employeeCode: 'CG-3', firstName: 'Maria',  lastName: 'Santos',    basicSalary: 18000, hiredOn: '2026-05-01' });
    const rows = await hr.listEmployees();
    expect(rows.map((r) => r.employeeCode)).toEqual(['CG-1', 'CG-3', 'CG-2']);
  });

  it('returns the projection shape expected by the UI list', async () => {
    await hr.createEmployee({
      employeeCode: 'CG-1', firstName: 'Juan', lastName: 'Dela Cruz',
      email: 'juan@x.com', basicSalary: 18000, hiredOn: '2026-05-01',
    });
    const [row] = await hr.listEmployees();
    expect(row).toMatchObject({
      employeeCode: 'CG-1',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan@x.com',
      status: 'hired',
      payFrequency: 'SEMI_MONTHLY',
      hiredOn: '2026-05-01',
    });
    expect(Number(row?.basicSalary)).toBe(18000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.1 — updateEmployee
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.updateEmployee', () => {
  beforeEach(cleanupEmployees);
  afterAll(async () => { await closeDb(); });

  it('updates editable fields and emits audit', async () => {
    const e = await hr.createEmployee({
      firstName: 'Juan', lastName: 'Cruz', employeeCode: 'CG-U-0001',
      basicSalary: '20000', payFrequency: 'SEMI_MONTHLY', hiredOn: '2026-01-01',
    });
    const updated = await hr.updateEmployee(e.id, {
      lastName: 'Cruzal',
      employmentType: 'OFFICE_STAFF',
    });
    expect(updated.lastName).toBe('Cruzal');
    expect(updated.employmentType).toBe('OFFICE_STAFF');
    // Immutable fields cannot be changed
    expect(updated.employeeCode).toBe('CG-U-0001');
    expect(updated.id).toBe(e.id);
  });

  it('rejects changes to employeeCode, id, createdAt (silently ignored)', async () => {
    const e = await hr.createEmployee({
      firstName: 'A', lastName: 'B', employeeCode: 'CG-U-0002',
      basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
    });
    const updated = await hr.updateEmployee(e.id, { employeeCode: 'HACKED' } as any);
    expect(updated.employeeCode).toBe('CG-U-0002');
  });

  it('throws on missing id', async () => {
    await expect(
      hr.updateEmployee('00000000-0000-0000-0000-000000000000', { lastName: 'x' }),
    ).rejects.toThrow(/not found/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.2 — searchEmployees
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.searchEmployees', () => {
  beforeEach(async () => {
    await cleanupEmployees();
    await hr.createEmployee({ firstName: 'Juan', lastName: 'Cruz', employeeCode: 'CG-S-0001', basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    await hr.createEmployee({ firstName: 'Maria', lastName: 'Reyes', employeeCode: 'CG-S-0002', basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01', employmentType: 'OFFICE_STAFF' });
    await hr.createEmployee({ firstName: 'Pedro', lastName: 'Santos', employeeCode: 'CG-S-0003', basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
  });
  afterAll(async () => { await closeDb(); });

  it('fuzzy matches on name via pg_trgm', async () => {
    const r = await hr.searchEmployees('cru');
    const codes = r.map((e) => e.employeeCode);
    expect(codes).toContain('CG-S-0001'); // "Juan Cruz" matches "cru"
  });

  it('exact-matches by employee_code substring', async () => {
    const r = await hr.searchEmployees('S-0002');
    expect(r.some((e) => e.employeeCode === 'CG-S-0002')).toBe(true);
  });

  it('respects employmentType filter', async () => {
    const r = await hr.searchEmployees('', { employmentType: 'OFFICE_STAFF' });
    expect(r.every((e) => e.employmentType === 'OFFICE_STAFF')).toBe(true);
    expect(r.some((e) => e.firstName === 'Maria')).toBe(true);
  });

  it('respects limit (default 20, capped at 100)', async () => {
    const r = await hr.searchEmployees('a', { limit: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listEmployeesPage — paginated list-page-shaped sibling of searchEmployees.
// Sibling so the typeahead consumer keeps its flat-array shape.
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.listEmployeesPage', () => {
  beforeEach(async () => {
    await cleanupEmployees();
    // Seed 7 employees so we can exercise pagination boundaries.
    for (let i = 1; i <= 7; i++) {
      await hr.createEmployee({
        firstName: 'P', lastName: `Page${String(i).padStart(2, '0')}`,
        employeeCode: `CG-P-${String(i).padStart(4, '0')}`,
        basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
        employmentType: i % 2 === 0 ? 'OFFICE_STAFF' : 'GUARD',
      });
    }
  });
  afterAll(async () => { await closeDb(); });

  it('returns {rows, total} with total counting the full filtered set, not the page', async () => {
    const r = await hr.listEmployeesPage({ limit: 3, offset: 0 });
    expect(r.rows).toHaveLength(3);
    expect(r.total).toBe(7);
  });

  it('paginates: offset 3 with limit 3 returns rows 4–6', async () => {
    const all = await hr.listEmployeesPage({ limit: 100, offset: 0 });
    const page2 = await hr.listEmployeesPage({ limit: 3, offset: 3 });
    expect(page2.rows.map((e) => e.employeeCode)).toEqual(
      all.rows.slice(3, 6).map((e) => e.employeeCode),
    );
    expect(page2.total).toBe(7);
  });

  it('employmentType filter narrows both rows and total', async () => {
    const r = await hr.listEmployeesPage({ employmentType: 'OFFICE_STAFF' });
    expect(r.total).toBe(3); // even-indexed: 2, 4, 6
    expect(r.rows.every((e) => e.employmentType === 'OFFICE_STAFF')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.3 — createEmployee accepts employmentType
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.createEmployee + employmentType', () => {
  beforeEach(cleanupEmployees);
  afterAll(async () => { await closeDb(); });

  it('accepts employmentType from input', async () => {
    const e = await hr.createEmployee({
      firstName: 'A', lastName: 'B', employeeCode: 'CG-T-0001',
      basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
      employmentType: 'OFFICE_STAFF',
    });
    expect(e.employmentType).toBe('OFFICE_STAFF');
  });

  it('defaults to GUARD when omitted', async () => {
    const e = await hr.createEmployee({
      firstName: 'A', lastName: 'B', employeeCode: 'CG-T-0002',
      basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
    });
    expect(e.employmentType).toBe('GUARD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.4 — createEmployee accepts BIR fields
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.createEmployee + BIR fields', () => {
  beforeEach(cleanupEmployees);
  afterAll(async () => { await closeDb(); });

  it('stores RDO, DOB, address fields', async () => {
    const e = await hr.createEmployee({
      firstName: 'A', lastName: 'B', employeeCode: 'CG-T-0003',
      basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
      rdoCode: '044', dateOfBirth: '1990-03-15',
      addressLine1: '123 Rizal St', city: 'Manila', province: 'Metro Manila', postalCode: '1000',
    });
    expect(e.rdoCode).toBe('044');
    expect(e.city).toBe('Manila');
    // Drizzle returns date columns as string (YYYY-MM-DD) for pg `date` type
    expect(e.dateOfBirth).toBe('1990-03-15');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.5 — bulkImportEmployees accepts new columns
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.bulkImportEmployees + new columns', () => {
  beforeEach(cleanupEmployees);
  afterAll(async () => { await closeDb(); });

  it('accepts employment_type + BIR columns', async () => {
    const csv = `first_name,last_name,employee_code,basic_salary,pay_frequency,hired_on,employment_type,rdo_code,date_of_birth,address_line1,city,province,postal_code
Juan,Cruz,CG-B-0001,20000,SEMI_MONTHLY,2026-01-01,GUARD,044,1990-01-01,123 Rizal,Manila,Metro Manila,1000
Maria,Reyes,CG-B-0002,30000,SEMI_MONTHLY,2026-01-01,OFFICE_STAFF,044,1985-05-15,456 Bonifacio,Quezon City,Metro Manila,1100`;
    const r = await hr.bulkImportEmployees(csv);
    expect(r.imported).toBe(2);
    const maria = await hr.getEmployeeByCode('CG-B-0002');
    expect(maria?.employmentType).toBe('OFFICE_STAFF');
    expect(maria?.rdoCode).toBe('044');
    expect(maria?.city).toBe('Quezon City');
  });

  it('defaults employment_type to GUARD when column missing from CSV', async () => {
    const csv = `first_name,last_name,employee_code,basic_salary,pay_frequency,hired_on
A,B,CG-B-0003,1,MONTHLY,2026-01-01`;
    const r = await hr.bulkImportEmployees(csv);
    expect(r.imported).toBe(1);
    const e = await hr.getEmployeeByCode('CG-B-0003');
    expect(e?.employmentType).toBe('GUARD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.6 — updateEmployee emits hr.employee.updated event
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.updateEmployee event emission', () => {
  beforeEach(async () => {
    _resetEventsForTests();
    await cleanupEmployees();
  });
  afterAll(async () => { await closeDb(); });

  it('emits hr.employee.updated event', async () => {
    const { events } = await import('@/modules/events');
    const received: Record<string, unknown>[] = [];
    const unsub = events.subscribe('hr.employee.updated', (payload) => {
      received.push(payload);
    });

    const e = await hr.createEmployee({
      firstName: 'A', lastName: 'B', employeeCode: 'CG-EV-0001',
      basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
    });
    await hr.updateEmployee(e.id, { lastName: 'Changed' });

    // setImmediate fires after current tick; wait a tick for delivery
    await new Promise((resolve) => setImmediate(resolve));
    unsub();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ id: e.id });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 2 — undo termination (5-minute window)
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.undoTermination', () => {
  beforeEach(async () => {
    await cleanupEmployees();
  });
  afterAll(async () => { await closeDb(); });

  it('allows terminated → hired when within 5 minutes', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-UT-001', firstName: 'A', lastName: 'B',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    await hr.changeStatus(e.id, 'terminated', 'AWOL');
    const undone = await hr.undoTermination(e.id, 'mistaken termination');
    expect(undone.status).toBe('hired');
    expect(undone.terminatedOn).toBeNull();
  });

  it('rejects when employee was never terminated', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-UT-002', firstName: 'A', lastName: 'B',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    await expect(hr.undoTermination(e.id, 'oops')).rejects.toThrow(/isn't terminated/);
  });

  it('rejects when outside the 5-minute window', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-UT-003', firstName: 'A', lastName: 'B',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    await hr.changeStatus(e.id, 'terminated', 'AWOL');
    // audit_log is append-only at the DB level (a trigger blocks UPDATE), so
    // we can't backdate the termination row directly. Stub `Date.now()` to
    // simulate the clock advancing past the 5-minute window. (Full
    // `vi.useFakeTimers()` interferes with postgres-driver internals, so we
    // only patch `Date.now`.)
    const realNow = Date.now;
    const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow() + 6 * 60 * 1000);
    try {
      await expect(hr.undoTermination(e.id, 'too late')).rejects.toThrow(/5-minute undo window has passed/);
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects when employee not found', async () => {
    await expect(
      hr.undoTermination('00000000-0000-0000-0000-000000000000', 'ghost'),
    ).rejects.toThrow(/not found/);
  });

  it('audits the undo with from/to and reason', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-UT-004', firstName: 'A', lastName: 'B',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    await hr.changeStatus(e.id, 'terminated', 'AWOL');
    await hr.undoTermination(e.id, 'fat-fingered the button');

    const rows = await getDb()
      .select()
      .from(auditLog)
      .where(sql`target_kind = 'hr_employee' AND target_id = ${e.id} AND action = 'hr.employee.status_changed' AND payload->>'to' = 'hired'`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const last = rows[rows.length - 1]!;
    const payload = last.payload as { from: string; to: string; reason: string; undo?: boolean };
    expect(payload.from).toBe('terminated');
    expect(payload.to).toBe('hired');
    expect(payload.reason).toMatch(/fat-fingered/);
    expect(payload.undo).toBe(true);
  });
});
