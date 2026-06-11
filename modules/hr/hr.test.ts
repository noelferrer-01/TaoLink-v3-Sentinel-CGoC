import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { employees } from './schema';
import { persons } from '@/modules/persons/schema';
import { auditLog } from '@/modules/audit/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { hr } from './index';
import {
  createPerson, getPerson,
  addCredential, updateCredential, listCredentials, READINESS_CRED_SET,
} from '@/modules/persons';
import { _resetEventsForTests } from '@/modules/events';

// FK-ordered cleanup helper reused across describe blocks.
// T7: createEmployee now mints a Person, so employees cleanup must also clear
// persons (otherwise SSS/TIN unique constraints fire on the next test run).
async function cleanupEmployees() {
  await getDb().delete(payslips);
  await getDb().delete(payRuns);
  await getDb().delete(dtrEntries);
  await getDb().delete(dtrPeriodCloses);
  await getDb().delete(assignmentsTable);
  await getDb().delete(employees);
  await getDb().delete(persons);
}

async function cleanupPersons() {
  // cleanupEmployees now handles persons too.
  await cleanupEmployees();
}

describe('hr.createEmployee + state machine', () => {
  beforeEach(async () => {
    // FK order: payslips → pay_runs → dtr_entries → dtr_period_closes → assignments → employees → persons
    await getDb().delete(payslips);
    await getDb().delete(payRuns);
    await getDb().delete(dtrEntries);
    await getDb().delete(dtrPeriodCloses);
    await getDb().delete(assignmentsTable);
    await getDb().delete(employees);
    await getDb().delete(persons);
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

  it('does not embed the employee name in the append-only audit payload (PII)', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-NOPII', firstName: 'Zxqfirst', lastName: 'Zxqlast',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    const rows = await getDb().select().from(auditLog)
      .where(sql`target_kind = 'hr_employee' AND target_id = ${e.id} AND action = 'hr.employee.created'`);
    expect(rows.length).toBe(1);
    const blob = JSON.stringify(rows[0]!.payload);
    // Referenced by code, never by name — so the name can't outlive redaction here.
    expect(blob).toContain('CG-NOPII');
    expect(blob).not.toContain('Zxqfirst');
    expect(blob).not.toContain('Zxqlast');
  });

  it('allows two employees to share an email (uniqueness retired at T12 — persons.email is non-unique by design)', async () => {
    const e1 = await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01', email: 'shared@x.com' });
    const e2 = await hr.createEmployee({ employeeCode: 'CG-2', firstName: 'C', lastName: 'D', basicSalary: 18000, hiredOn: '2026-05-01', email: 'shared@x.com' });
    expect(e1.id).not.toBe(e2.id);
    const w1 = await hr.getEmployeeWithIdentity(e1.id);
    const w2 = await hr.getEmployeeWithIdentity(e2.id);
    expect(w1?.email).toBe('shared@x.com');
    expect(w2?.email).toBe('shared@x.com');
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
    // FK order: payslips → pay_runs → dtr_entries → dtr_period_closes → assignments → employees → persons
    await getDb().delete(payslips);
    await getDb().delete(payRuns);
    await getDb().delete(dtrEntries);
    await getDb().delete(dtrPeriodCloses);
    await getDb().delete(assignmentsTable);
    await getDb().delete(employees);
    await getDb().delete(persons);
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

  it('imports rows sharing an email (email dedup retired at T12 — persons.email is non-unique)', async () => {
    const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on
CG-1,A,B,dup@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-2,C,D,dup@x.com,18000,SEMI_MONTHLY,2026-05-01`;
    const result = await hr.bulkImportEmployees(csv);
    expect(result.imported).toBe(2);
    expect(result.errors).toEqual([]);
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
    await getDb().delete(persons);
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

  it('updates employment fields and emits audit', async () => {
    const e = await hr.createEmployee({
      firstName: 'Juan', lastName: 'Cruz', employeeCode: 'CG-U-0001',
      basicSalary: '20000', payFrequency: 'SEMI_MONTHLY', hiredOn: '2026-01-01',
    });
    // T11: identity fields (lastName) are stripped; employment fields are updated.
    const updated = await hr.updateEmployee(e.id, {
      employmentType: 'OFFICE_STAFF',
      basicSalary: '22000',
    });
    expect(updated.employmentType).toBe('OFFICE_STAFF');
    expect(Number(updated.basicSalary)).toBe(22000);
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
      hr.updateEmployee('00000000-0000-0000-0000-000000000000', { rdoCode: '044' }),
    ).rejects.toThrow(/not found/);
  });

  // (The former "person-less row" baseline test was removed at T12: rows with
  // personId = NULL are impossible now — hr_employees.person_id is NOT NULL.)
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

  it('treats LIKE wildcards in the query as literals (_ and % do not match)', async () => {
    // 'S_0002' must NOT match 'S-0002' — an unescaped _ matches any one char.
    const r = await hr.searchEmployees('S_0002');
    expect(r.some((e) => e.employeeCode === 'CG-S-0002')).toBe(false);
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

  it('stores RDO on the role row; DOB/address land on the Person', async () => {
    const e = await hr.createEmployee({
      firstName: 'A', lastName: 'B', employeeCode: 'CG-T-0003',
      basicSalary: '1', payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
      rdoCode: '044', dateOfBirth: '1990-03-15',
      addressLine1: '123 Rizal St', city: 'Manila', province: 'Metro Manila', postalCode: '1000',
    });
    expect(e.rdoCode).toBe('044'); // role-owned BIR field stays on hr_employees
    const merged = await hr.getEmployeeWithIdentity(e.id);
    expect(merged?.city).toBe('Manila');
    // Drizzle returns date columns as string (YYYY-MM-DD) for pg `date` type
    expect(merged?.dateOfBirth).toBe('1990-03-15');
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
    const merged = await hr.getEmployeeWithIdentity(maria!.id);
    expect(merged?.city).toBe('Quezon City'); // address lands on the Person
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
    await hr.updateEmployee(e.id, { employmentType: 'OFFICE_STAFF' });

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

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 — next employee-code generator (used by Recruitment hire flow)
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.generateNextEmployeeCode', () => {
  beforeEach(async () => { await cleanupEmployees(); });
  afterAll(async () => { await closeDb(); });

  it('returns the next CG- code after the current max', async () => {
    await hr.createEmployee({ employeeCode: 'CG-10001', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
    await hr.createEmployee({ employeeCode: 'CG-10009', firstName: 'C', lastName: 'D', basicSalary: 18000, hiredOn: '2026-05-01' });
    const next = await hr.generateNextEmployeeCode('CG-');
    expect(next).toBe('CG-10010');
  });

  it('starts at 10001 when no codes exist for the prefix', async () => {
    const next = await hr.generateNextEmployeeCode('CG-');
    expect(next).toBe('CG-10001');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 6 — getEmployeeWithIdentity (employee ⋈ persons)
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.getEmployeeWithIdentity', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('returns employment fields + linked person identity merged into one object', async () => {
    const p = await createPerson({
      firstName: 'Maria',
      lastName: 'Santos',
      middleName: 'Cruz',
      suffix: null,
      dateOfBirth: '1990-06-15',
      sex: 'female',
      sssNumber: '34-5678901-2',
      tinNumber: '123-456-789',
      philhealthNumber: 'PH-111',
      pagibigNumber: 'PAG-222',
      addressLine1: '123 Rizal St',
      addressLine2: null,
      city: 'Manila',
      province: 'Metro Manila',
      postalCode: '1000',
      phone: '09171234567',
      email: 'maria@test.com',
      anchorIdType: 'sss',
    });

    const e = await hr.createEmployee({
      employeeCode: 'CG-WI-001',
      firstName: 'Maria', // used only for the audit label — the Person (passed below) is the identity source
      lastName: 'Santos',
      basicSalary: 20000,
      hiredOn: '2026-01-01',
      personId: p.id,
    });

    const result = await hr.getEmployeeWithIdentity(e.id);

    expect(result).not.toBeNull();
    // Employment fields
    expect(result!.id).toBe(e.id);
    expect(result!.employeeCode).toBe('CG-WI-001');
    expect(Number(result!.basicSalary)).toBe(20000);
    expect(result!.hiredOn).toBe('2026-01-01');
    expect(result!.status).toBe('hired');
    expect(result!.personId).toBe(p.id);
    // Identity fields sourced from Person
    expect(result!.firstName).toBe('Maria');
    expect(result!.lastName).toBe('Santos');
    expect(result!.middleName).toBe('Cruz');
    expect(result!.dateOfBirth).toBe('1990-06-15');
    expect(result!.sssNumber).toBe('34-5678901-2');
    expect(result!.tinNumber).toBe('123-456-789');
    expect(result!.philhealthNumber).toBe('PH-111');
    expect(result!.pagibigNumber).toBe('PAG-222');
    expect(result!.city).toBe('Manila');
    expect(result!.addressLine1).toBe('123 Rizal St');
    expect(result!.phone).toBe('09171234567');
    expect(result!.email).toBe('maria@test.com');
  });

  // (The former "personId is NULL" LEFT-JOIN test was removed at T12: person-less
  // employee rows are impossible now — hr_employees.person_id is NOT NULL.)

  it('returns null when the employee does not exist', async () => {
    const result = await hr.getEmployeeWithIdentity('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 7 — createEmployee + bulkImportEmployees create/link a Person
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.createEmployee — dual-write (T7)', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('mints a Person and sets personId when no personId is given', async () => {
    const countBefore = (await getDb().select({ id: persons.id }).from(persons)).length;
    const e = await hr.createEmployee({
      employeeCode: 'CG-DW-001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      basicSalary: 18000,
      hiredOn: '2026-01-01',
      sssNumber: '34-1111111-1',
      email: 'juan.dw@test.com',
    });
    expect(e.personId).not.toBeNull();
    const countAfter = (await getDb().select({ id: persons.id }).from(persons)).length;
    expect(countAfter).toBe(countBefore + 1);
    // The role row carries NO identity columns (retired at T12); the merged
    // accessor sources them from the minted Person.
    const merged = await hr.getEmployeeWithIdentity(e.id);
    expect(merged?.firstName).toBe('Juan');
    expect(merged?.lastName).toBe('Dela Cruz');
    expect(merged?.sssNumber).toBe('34-1111111-1');
  });

  it('links the given personId and does NOT mint a new Person', async () => {
    const p = await createPerson({ firstName: 'Maria', lastName: 'Santos', anchorIdType: 'none' });
    const countBefore = (await getDb().select({ id: persons.id }).from(persons)).length;
    const e = await hr.createEmployee({
      employeeCode: 'CG-DW-002',
      firstName: 'Maria',
      lastName: 'Santos',
      basicSalary: 18000,
      hiredOn: '2026-01-01',
      personId: p.id,
    });
    expect(e.personId).toBe(p.id);
    const countAfter = (await getDb().select({ id: persons.id }).from(persons)).length;
    expect(countAfter).toBe(countBefore); // no new person
  });

  it('minted Person holds the identity fields from the input', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-DW-003',
      firstName: 'Pedro',
      lastName: 'Reyes',
      middleName: 'Cruz',
      dateOfBirth: '1985-04-20',
      sssNumber: '34-2222222-2',
      philhealthNumber: 'PH-DW-003',
      pagibigNumber: 'PAG-DW-003',
      tinNumber: '111222333',
      email: 'pedro.dw@test.com',
      phone: '09181234567',
      addressLine1: '1 Rizal St',
      city: 'Davao',
      province: 'Davao del Sur',
      basicSalary: 20000,
      hiredOn: '2026-01-01',
    });
    expect(e.personId).not.toBeNull();
    const p = await getDb().select().from(persons).where(sql`id = ${e.personId!}`);
    expect(p[0]).toBeDefined();
    expect(p[0]!.firstName).toBe('Pedro');
    expect(p[0]!.lastName).toBe('Reyes');
    expect(p[0]!.sssNumber).toBe('34-2222222-2');
    expect(p[0]!.email).toBe('pedro.dw@test.com');
    expect(p[0]!.city).toBe('Davao');
  });

  it('a failed employee insert leaves NO orphaned Person (atomicity guard)', async () => {
    // Pre-seed an employee with the code we will reuse to cause a duplicate-code
    // violation on the second createEmployee call.
    await hr.createEmployee({
      employeeCode: 'CG-DW-DUP',
      firstName: 'Existing',
      lastName: 'Employee',
      basicSalary: 18000,
      hiredOn: '2026-01-01',
    });

    const countBefore = (await getDb().select({ id: persons.id }).from(persons)).length;

    // This call should fail because 'CG-DW-DUP' already exists, rolling back
    // the Person that was minted inside the transaction.
    await expect(
      hr.createEmployee({
        employeeCode: 'CG-DW-DUP', // duplicate code — triggers 23505
        firstName: 'Should',
        lastName: 'Rollback',
        basicSalary: 20000,
        hiredOn: '2026-01-02',
        sssNumber: '34-9999999-9',
      }),
    ).rejects.toThrow();

    const countAfter = (await getDb().select({ id: persons.id }).from(persons)).length;
    // Person count must be unchanged — the rolled-back Person was NOT persisted.
    expect(countAfter).toBe(countBefore);
  });
});

describe('hr.bulkImportEmployees — dual-write (T7)', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('creates a Person per imported row', async () => {
    const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on,sss_number
CG-BW-001,Ana,Reyes,ana.bw@test.com,18000,SEMI_MONTHLY,2026-05-01,34-3333333-3
CG-BW-002,Ben,Torres,ben.bw@test.com,18000,SEMI_MONTHLY,2026-05-01,34-4444444-4`;
    const result = await hr.bulkImportEmployees(csv);
    expect(result.imported).toBe(2);
    expect(result.errors).toEqual([]);
    const pCount = (await getDb().select({ id: persons.id }).from(persons)).length;
    expect(pCount).toBe(2);
  });

  it('reports a duplicate-SSS row as a row error and continues importing the rest', async () => {
    const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on,sss_number
CG-BW-003,First,Row,first.bw@test.com,18000,SEMI_MONTHLY,2026-05-01,34-5555555-5
CG-BW-004,Dup,Row,dup.bw@test.com,18000,SEMI_MONTHLY,2026-05-01,34-5555555-5
CG-BW-005,Third,Row,third.bw@test.com,18000,SEMI_MONTHLY,2026-05-01,34-6666666-6`;
    const result = await hr.bulkImportEmployees(csv);
    expect(result.imported).toBe(2); // row 1 and row 3 succeed
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 2, reason: expect.stringMatching(/SSS|already on file/i) });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 6 — getEmployeesWithIdentityPage (paginated employee ⋈ persons)
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.getEmployeesWithIdentityPage', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('returns {rows, total} with the merged shape', async () => {
    const p1 = await createPerson({ firstName: 'Ana', lastName: 'Reyes', anchorIdType: 'none' });
    const p2 = await createPerson({ firstName: 'Ben', lastName: 'Torres', anchorIdType: 'none' });

    await hr.createEmployee({ employeeCode: 'CG-PG-001', firstName: 'Ana', lastName: 'Reyes', basicSalary: 10000, hiredOn: '2026-01-01', personId: p1.id });
    await hr.createEmployee({ employeeCode: 'CG-PG-002', firstName: 'Ben', lastName: 'Torres', basicSalary: 10000, hiredOn: '2026-01-01', personId: p2.id });
    await hr.createEmployee({ employeeCode: 'CG-PG-003', firstName: 'No', lastName: 'Sss',   basicSalary: 10000, hiredOn: '2026-01-01' });

    const result = await hr.getEmployeesWithIdentityPage({ limit: 10, offset: 0 });

    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
    // Every row has the merged shape: pick one with a pre-created person
    const ana = result.rows.find((r) => r.employeeCode === 'CG-PG-001');
    expect(ana).toBeDefined();
    expect(ana!.firstName).toBe('Ana');
    expect(ana!.lastName).toBe('Reyes');
    // The auto-minted Person (no SSS given) returns null for absent identity fields
    const noSss = result.rows.find((r) => r.employeeCode === 'CG-PG-003');
    expect(noSss).toBeDefined();
    expect(noSss!.sssNumber).toBeNull();
  });

  it('paginates correctly — offset/limit respected', async () => {
    for (let i = 1; i <= 5; i++) {
      await hr.createEmployee({
        employeeCode: `CG-PG-P${String(i).padStart(2, '0')}`,
        firstName: 'X', lastName: `Page${String(i).padStart(2, '0')}`,
        basicSalary: 10000, hiredOn: '2026-01-01',
      });
    }
    const page1 = await hr.getEmployeesWithIdentityPage({ limit: 2, offset: 0 });
    const page2 = await hr.getEmployeesWithIdentityPage({ limit: 2, offset: 2 });
    expect(page1.total).toBe(5);
    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(2);
    // No overlap
    const codes1 = page1.rows.map((r) => r.employeeCode);
    const codes2 = page2.rows.map((r) => r.employeeCode);
    expect(codes1.some((c) => codes2.includes(c))).toBe(false);
  });

  it('employmentType filter narrows both rows and total', async () => {
    await hr.createEmployee({ employeeCode: 'CG-PG-F1', firstName: 'A', lastName: 'B', basicSalary: 1, hiredOn: '2026-01-01', employmentType: 'OFFICE_STAFF' });
    await hr.createEmployee({ employeeCode: 'CG-PG-F2', firstName: 'C', lastName: 'D', basicSalary: 1, hiredOn: '2026-01-01', employmentType: 'GUARD' });

    const r = await hr.getEmployeesWithIdentityPage({ employmentType: 'OFFICE_STAFF' });
    expect(r.total).toBe(1);
    expect(r.rows[0]!.employmentType).toBe('OFFICE_STAFF');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 10 — employee search/list via Person name (GIN-indexed)
// ─────────────────────────────────────────────────────────────────────────────

describe('hr.searchEmployees — T10: name search via persons', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('fuzzy-matches name from persons (not legacy columns)', async () => {
    // Create employee via the normal path so a Person is linked.
    await hr.createEmployee({ employeeCode: 'CG-T10-001', firstName: 'Juan', lastName: 'Dela Cruz', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    await hr.createEmployee({ employeeCode: 'CG-T10-002', firstName: 'Maria', lastName: 'Reyes', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });

    const r = await hr.searchEmployees('dela');
    const codes = r.map((e) => e.employeeCode);
    expect(codes).toContain('CG-T10-001'); // "Juan Dela Cruz" matches "dela"
    expect(codes).not.toContain('CG-T10-002');
  });

  it('name result has firstName/lastName from persons (nullable)', async () => {
    await hr.createEmployee({ employeeCode: 'CG-T10-003', firstName: 'Pedro', lastName: 'Santos', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    const r = await hr.searchEmployees('pedro');
    const match = r.find((e) => e.employeeCode === 'CG-T10-003');
    expect(match).toBeDefined();
    // T10: returned name fields come from the linked Person, not legacy columns.
    expect(match!.firstName).toBe('Pedro');
    expect(match!.lastName).toBe('Santos');
  });

  // (The two former "person-less row" search tests were removed at T12: rows
  // with personId = NULL are impossible now — hr_employees.person_id is NOT
  // NULL. Code-search with a linked Person is covered above.)

  it('code-search (ILIKE) finds an employee by code substring', async () => {
    await hr.createEmployee({ employeeCode: 'CG-T10-CODE', firstName: 'Code', lastName: 'Search', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    const r = await hr.searchEmployees('T10-CODE');
    expect(r.map((e) => e.employeeCode)).toContain('CG-T10-CODE');
  });

  it('respects employmentType filter (T10 regression guard)', async () => {
    await hr.createEmployee({ employeeCode: 'CG-T10-004', firstName: 'Ana', lastName: 'Lopez', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01', employmentType: 'OFFICE_STAFF' });
    await hr.createEmployee({ employeeCode: 'CG-T10-005', firstName: 'Ana', lastName: 'Gomez', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01', employmentType: 'GUARD' });

    const r = await hr.searchEmployees('ana', { employmentType: 'OFFICE_STAFF' });
    expect(r.every((e) => e.employmentType === 'OFFICE_STAFF')).toBe(true);
  });

  it('EXPLAIN plan uses persons_fullname_trgm index for name predicate', async () => {
    // NOTE: The GIN trgm index on persons is used when the query scans persons
    // directly. In the join query (hr_employees LEFT JOIN persons), the planner
    // uses the FK path (persons_pkey) and applies the trgm filter after the join
    // — this is standard PG behavior for small tables and join cardinality.
    // We verify the predicate SHAPE is GIN-compatible by running EXPLAIN on
    // the persons table directly (with seqscan disabled). This guards against
    // predicate-form regressions (e.g. someone reverting to similarity() > 0.2).
    const db = getDb();
    const planText = await db.transaction(async (tx) => {
      // Disable seqscan so the planner is forced to use the index if the
      // predicate form is index-compatible — proves shape correctness
      // independent of table size.
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const result = await tx.execute(
        sql`EXPLAIN (FORMAT JSON) SELECT id FROM persons WHERE (first_name || ' ' || last_name) % 'carlos'`
      );
      // postgres-js execute() returns an array of rows directly; the first row
      // has a 'QUERY PLAN' key containing the JSON plan tree.
      const firstRow = (result as unknown as Array<Record<string, unknown>>)[0];
      return JSON.stringify(firstRow?.['QUERY PLAN'] ?? firstRow);
    });

    expect(planText).toContain('persons_fullname_trgm');
  });
});

describe('hr.listEmployeesPage — T10: name search via persons', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('fuzzy-matches on persons name field', async () => {
    await hr.createEmployee({ employeeCode: 'CG-LP10-001', firstName: 'Rosa', lastName: 'Mendoza', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    await hr.createEmployee({ employeeCode: 'CG-LP10-002', firstName: 'Marco', lastName: 'Villanueva', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });

    const r = await hr.listEmployeesPage({ query: 'mendoza' });
    expect(r.rows.some((e) => e.employeeCode === 'CG-LP10-001')).toBe(true);
    expect(r.rows.every((e) => e.employeeCode !== 'CG-LP10-002')).toBe(true);
  });

  it('returned rows have firstName/lastName from persons (nullable)', async () => {
    await hr.createEmployee({ employeeCode: 'CG-LP10-003', firstName: 'Sofia', lastName: 'Torres', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    const r = await hr.listEmployeesPage({ query: 'sofia' });
    const match = r.rows.find((e) => e.employeeCode === 'CG-LP10-003');
    expect(match).toBeDefined();
    expect(match!.firstName).toBe('Sofia');
    expect(match!.lastName).toBe('Torres');
  });

  it('code-search finds an employee by code substring', async () => {
    await hr.createEmployee({ employeeCode: 'CG-LP10-CODE', firstName: 'Code', lastName: 'Search', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    const r = await hr.listEmployeesPage({ query: 'LP10-CODE' });
    expect(r.rows.some((e) => e.employeeCode === 'CG-LP10-CODE')).toBe(true);
  });

  it('returns {rows, total} and total counts correctly after T10 switch', async () => {
    for (let i = 1; i <= 4; i++) {
      await hr.createEmployee({
        employeeCode: `CG-LP10-PG${i}`,
        firstName: 'Test', lastName: `User${String(i).padStart(2, '0')}`,
        basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
      });
    }
    const r = await hr.listEmployeesPage({ limit: 2, offset: 0 });
    expect(r.total).toBe(4);
    expect(r.rows).toHaveLength(2);
  });
});

describe('hr.getEmployeesWithIdentityPage — T10: name search via persons', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('fuzzy-matches on persons name field (identity page)', async () => {
    await hr.createEmployee({ employeeCode: 'CG-IP10-001', firstName: 'Elena', lastName: 'Castillo', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    await hr.createEmployee({ employeeCode: 'CG-IP10-002', firstName: 'Luis', lastName: 'Vargas', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });

    const r = await hr.getEmployeesWithIdentityPage({ query: 'castillo' });
    expect(r.rows.some((e) => e.employeeCode === 'CG-IP10-001')).toBe(true);
    expect(r.rows.every((e) => e.employeeCode !== 'CG-IP10-002')).toBe(true);
  });

  it('code-search finds an employee by code substring (identity page)', async () => {
    await hr.createEmployee({ employeeCode: 'CG-IP10-CODE', firstName: 'Code', lastName: 'Search', basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01' });
    const r = await hr.getEmployeesWithIdentityPage({ query: 'IP10-CODE' });
    expect(r.rows.some((e) => e.employeeCode === 'CG-IP10-CODE')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 gap-closers: similarity ordering + 0.2-threshold band coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('hr.searchEmployees — T10: similarity ordering', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('returns better match before weaker match (ORDER BY similarity DESC)', async () => {
    // Query: 'Juan Cruz'
    // similarity('Juan Cruz', 'Juan Cruz')      = 1.0   (exact)
    // similarity('Juan Cruz', 'Juana Cruzado')  = 0.5   (partial)
    // Both are above the 0.2 threshold, so both appear; exact must rank first.
    await hr.createEmployee({
      employeeCode: 'CG-T10-ORD-001',
      firstName: 'Juan', lastName: 'Cruz',
      basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
    });
    await hr.createEmployee({
      employeeCode: 'CG-T10-ORD-002',
      firstName: 'Juana', lastName: 'Cruzado',
      basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
    });

    const r = await hr.searchEmployees('Juan Cruz');
    const codes = r.map((e) => e.employeeCode);

    // Both names must appear (similarity 1.0 and 0.5 — both above 0.2 threshold).
    expect(codes).toContain('CG-T10-ORD-001');
    expect(codes).toContain('CG-T10-ORD-002');

    // The exact match (sim = 1.0) must come before the partial match (sim = 0.5).
    expect(codes.indexOf('CG-T10-ORD-001')).toBeLessThan(codes.indexOf('CG-T10-ORD-002'));
  });
});

describe('hr.listEmployeesPage — T10: 0.2-threshold band', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('matches when similarity is in (0.2, 0.3] — would be excluded at default 0.3 threshold', async () => {
    // similarity('mend', 'Rosa Mendoza') = 0.2857143 — verified on test DB.
    // At default pg_trgm threshold of 0.3, 'mend' % 'Rosa Mendoza' is FALSE
    // and this employee would be invisible. SET LOCAL 0.2 makes it TRUE.
    await hr.createEmployee({
      employeeCode: 'CG-LP10-BAND-001',
      firstName: 'Rosa', lastName: 'Mendoza',
      basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
    });

    const r = await hr.listEmployeesPage({ query: 'mend' });
    expect(r.rows.some((e) => e.employeeCode === 'CG-LP10-BAND-001')).toBe(true);
  });
});

describe('hr.getEmployeesWithIdentityPage — T10: 0.2-threshold band', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('matches when similarity is in (0.2, 0.3] — would be excluded at default 0.3 threshold', async () => {
    // similarity('stillo', 'Gregorio Castillo') = 0.25 — verified on test DB.
    // At default pg_trgm threshold of 0.3, 'stillo' % 'Gregorio Castillo' is FALSE
    // and this employee would be invisible. SET LOCAL 0.2 makes it TRUE.
    await hr.createEmployee({
      employeeCode: 'CG-IP10-BAND-001',
      firstName: 'Gregorio', lastName: 'Castillo',
      basicSalary: 1, payFrequency: 'MONTHLY', hiredOn: '2026-01-01',
    });

    const r = await hr.getEmployeesWithIdentityPage({ query: 'stillo' });
    expect(r.rows.some((e) => e.employeeCode === 'CG-IP10-BAND-001')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 11 — updateEmployee is employment-only (identity keys stripped)
// ─────────────────────────────────────────────────────────────────────────────
describe('hr.updateEmployee — T11: identity fields stripped, employment fields updated', () => {
  beforeEach(cleanupPersons);
  afterAll(async () => { await closeDb(); });

  it('identity keys in patch do NOT change the Person (silent strip)', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-T11-001',
      firstName: 'Identity', lastName: 'Test',
      sssNumber: '34-T11-0001',
      email: 'identity.test@t11.com',
      basicSalary: 20000, hiredOn: '2026-01-01',
    });
    expect(e.personId).not.toBeNull();

    // Fetch Person state before update
    const personBefore = await getPerson(e.personId!);
    expect(personBefore?.firstName).toBe('Identity');

    // Pass identity fields in the patch — they must be silently stripped
    await hr.updateEmployee(e.id, {
      firstName: 'CHANGED' as any,
      lastName: 'CHANGED' as any,
      email: 'changed@hacked.com' as any,
      sssNumber: '00-000000-0' as any,
      // also update a real employment field to confirm the call works
      employmentType: 'OFFICE_STAFF',
    } as any);

    // Person identity must be unchanged
    const personAfter = await getPerson(e.personId!);
    expect(personAfter?.firstName).toBe('Identity');
    expect(personAfter?.lastName).toBe('Test');
    expect(personAfter?.email).toBe('identity.test@t11.com');
    expect(personAfter?.sssNumber).toBe('34-T11-0001');

    // Employment field must be updated
    const emp = await hr.getEmployee(e.id);
    expect(emp?.employmentType).toBe('OFFICE_STAFF');
  });

  it('identity fields do NOT appear in changedFields of the audit record', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-T11-002',
      firstName: 'AuditTest', lastName: 'Guard',
      basicSalary: 18000, hiredOn: '2026-01-01',
    });

    await hr.updateEmployee(e.id, {
      firstName: 'HACKED' as any,
      lastName: 'HACKED' as any,
      basicSalary: '25000',
    } as any);

    // Check audit log: changedFields should only contain employment fields
    const rows = await getDb()
      .select()
      .from(auditLog)
      .where(sql`target_kind = 'hr_employee' AND target_id = ${e.id} AND action = 'hr.employee.updated'`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const last = rows[rows.length - 1]!;
    const payload = last.payload as { changedFields: string[] };
    expect(payload.changedFields).not.toContain('firstName');
    expect(payload.changedFields).not.toContain('lastName');
    expect(payload.changedFields).toContain('basicSalary');
  });

  // (The former "person-less employee" patch test was removed at T12: rows with
  // personId = NULL are impossible now — hr_employees.person_id is NOT NULL.)
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3b — hr.listReadinessIssues (licence readiness radar)
// Moved here from recruitment in the pressure-test fix: readiness is an employee
// concern (employees + credentials) and uses no recruitment-domain code.
// ─────────────────────────────────────────────────────────────────────────────

describe('hr.listReadinessIssues (Slice 3b)', () => {
  beforeEach(cleanupEmployees);
  afterAll(async () => { await cleanupEmployees(); await closeDb(); });

  // Fixed "today" so expiry math is deterministic regardless of the real clock.
  const today = '2026-06-11';

  async function makeGuard(code: string, armed: boolean, status: 'deployed' | 'terminated' = 'deployed') {
    const p = await createPerson({ firstName: 'Guard', lastName: code, dateOfBirth: '1990-01-01' });
    await hr.createEmployee({
      employeeCode: code,
      firstName: 'Guard', lastName: code,   // ignored — personId wins
      personId: p.id,
      basicSalary: 18000,
      hiredOn: '2026-01-01',
      isArmedPost: armed,
      status,
    });
    return { person: p };
  }

  // Full 8-credential base set, far-future valid, so the only issues a test sees
  // are the ones it deliberately creates.
  async function addValidBaseSet(personId: string) {
    for (const credType of READINESS_CRED_SET(false)) {
      await addCredential({ personId, credType, status: 'valid', expiresOn: '2030-01-01' });
    }
  }

  // ── Moved cases ──────────────────────────────────────────────────────────────

  it('flags an armed guard with no LTOPF row as missing', async () => {
    const { person } = await makeGuard('CG-ARM-1', true);
    await addValidBaseSet(person.id);   // everything valid except LTOPF
    const { rows } = await hr.listReadinessIssues({ today, armedOnly: true });
    const mine = rows.filter((r) => r.employeeCode === 'CG-ARM-1');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.credType).toBe('ltopf_license');
    expect(mine[0]!.kind).toBe('missing');
  });

  it('does not phantom-flag a missing résumé (resume_biodata excluded)', async () => {
    const { person } = await makeGuard('CG-UNA-1', false);
    await addValidBaseSet(person.id);
    const { rows } = await hr.listReadinessIssues({ today });
    expect(rows.filter((r) => r.employeeCode === 'CG-UNA-1')).toHaveLength(0);
    expect(rows.map((r) => r.credType as string)).not.toContain('resume_biodata');
  });

  it('flags a SOSIA expiring within its (90-day) window', async () => {
    const { person } = await makeGuard('CG-EXP-1', false);
    await addValidBaseSet(person.id);
    const sosia = (await listCredentials(person.id)).find((c) => c.credType === 'sosia_license')!;
    await updateCredential(sosia.id, { expiresOn: '2026-07-15' });   // ~34d out
    const { rows } = await hr.listReadinessIssues({ today });
    const mine = rows.filter((r) => r.employeeCode === 'CG-EXP-1');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.credType).toBe('sosia_license');
    expect(mine[0]!.kind).toBe('expiring');
  });

  it('reports a present valid LTOPF as unverified — never a clean all-clear', async () => {
    const { person } = await makeGuard('CG-ARM-2', true);
    await addValidBaseSet(person.id);
    await addCredential({ personId: person.id, credType: 'ltopf_license', status: 'valid', expiresOn: '2030-01-01' });
    const { rows } = await hr.listReadinessIssues({ today, armedOnly: true });
    const mine = rows.filter((r) => r.employeeCode === 'CG-ARM-2');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.credType).toBe('ltopf_license');
    expect(mine[0]!.kind).toBe('unverified');
    expect(mine[0]!.firearmLinkUnverified).toBe(true);
  });

  it('keeps the firearm caveat on an EXPIRED LTOPF (the caveat must not vanish in a worse state)', async () => {
    // ADR 0018: an armed post never gets a clean all-clear on firearms. The caveat
    // flag has to ride along even when the LTOPF itself is expired/revoked — the
    // radar page renders it, so dropping it here would silently hide the warning
    // exactly when the firearms licence is in its worst state.
    const { person } = await makeGuard('CG-ARM-3', true);
    await addValidBaseSet(person.id);
    await addCredential({ personId: person.id, credType: 'ltopf_license', status: 'valid', expiresOn: '2025-01-01' }); // expired by date
    const { rows } = await hr.listReadinessIssues({ today, armedOnly: true });
    const mine = rows.filter((r) => r.employeeCode === 'CG-ARM-3');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.credType).toBe('ltopf_license');
    expect(mine[0]!.kind).toBe('expired');
    expect(mine[0]!.firearmLinkUnverified).toBe(true);
  });

  it('returns no issues for a fully-valid unarmed guard', async () => {
    const { person } = await makeGuard('CG-OK-1', false);
    await addValidBaseSet(person.id);
    const { rows } = await hr.listReadinessIssues({ today });
    expect(rows.filter((r) => r.employeeCode === 'CG-OK-1')).toEqual([]);
  });

  it('excludes terminated guards from the radar', async () => {
    await makeGuard('CG-TERM-1', true, 'terminated');   // no creds → all-missing IF included
    const { rows } = await hr.listReadinessIssues({ today });
    expect(rows.filter((r) => r.employeeCode === 'CG-TERM-1')).toEqual([]);
  });

  // ── New edge cases (the pressure-test gaps) ──────────────────────────────────

  it('treats a guard as covered when a VALID renewal sits alongside an expired one (best-of-N)', async () => {
    const { person } = await makeGuard('CG-RENEW-1', false);
    await addValidBaseSet(person.id);   // includes a valid SOSIA (2030)
    // An old expired SOSIA also on file — the valid one should still clear it.
    await addCredential({ personId: person.id, credType: 'sosia_license', status: 'valid', expiresOn: '2020-01-01' });
    const { rows } = await hr.listReadinessIssues({ today });
    expect(rows.filter((r) => r.employeeCode === 'CG-RENEW-1' && r.credType === 'sosia_license')).toHaveLength(0);
  });

  it('reports the MOST SEVERE state when a required type has an expired AND a pending row (expired, not pending)', async () => {
    const { person } = await makeGuard('CG-SEV-1', false);
    // Only SOSIA on file: an expired one + a pending renewal, no valid.
    await addCredential({ personId: person.id, credType: 'sosia_license', status: 'valid', expiresOn: '2020-01-01' }); // expired by date
    await addCredential({ personId: person.id, credType: 'sosia_license', status: 'pending' });
    const { rows } = await hr.listReadinessIssues({ today });
    const sosia = rows.find((r) => r.employeeCode === 'CG-SEV-1' && r.credType === 'sosia_license');
    expect(sosia?.kind).toBe('expired');   // NOT 'pending' — a lapse outranks an unverified renewal
  });

  it('reports an expired required credential as expired', async () => {
    const { person } = await makeGuard('CG-XP-1', false);
    await addValidBaseSet(person.id);
    const sosia = (await listCredentials(person.id)).find((c) => c.credType === 'sosia_license')!;
    await updateCredential(sosia.id, { expiresOn: '2025-01-01' });   // past
    const { rows } = await hr.listReadinessIssues({ today });
    const mine = rows.find((r) => r.employeeCode === 'CG-XP-1' && r.credType === 'sosia_license');
    expect(mine?.kind).toBe('expired');
  });

  it('reports a revoked required credential as revoked (distinct from expired)', async () => {
    const { person } = await makeGuard('CG-RV-1', false);
    await addValidBaseSet(person.id);
    const sosia = (await listCredentials(person.id)).find((c) => c.credType === 'sosia_license')!;
    await updateCredential(sosia.id, { status: 'revoked' });
    const { rows } = await hr.listReadinessIssues({ today });
    const mine = rows.find((r) => r.employeeCode === 'CG-RV-1' && r.credType === 'sosia_license');
    expect(mine?.kind).toBe('revoked');
  });

  it('reports a pending-only required credential as pending', async () => {
    const { person } = await makeGuard('CG-PD-1', false);
    await addValidBaseSet(person.id);
    const sosia = (await listCredentials(person.id)).find((c) => c.credType === 'sosia_license')!;
    await updateCredential(sosia.id, { status: 'pending' });
    const { rows } = await hr.listReadinessIssues({ today });
    const mine = rows.find((r) => r.employeeCode === 'CG-PD-1' && r.credType === 'sosia_license');
    expect(mine?.kind).toBe('pending');
  });

  it('paginates the issue list (total counts all issues; limit/offset slice rows)', async () => {
    // Two unarmed guards, no credentials → 8 missing required each = 16 issues.
    await makeGuard('CG-PG-1', false);
    await makeGuard('CG-PG-2', false);

    const first = await hr.listReadinessIssues({ today, limit: 5, offset: 0 });
    expect(first.total).toBe(16);
    expect(first.rows).toHaveLength(5);

    const tail = await hr.listReadinessIssues({ today, limit: 5, offset: 15 });
    expect(tail.total).toBe(16);
    expect(tail.rows).toHaveLength(1);   // the 16th issue
  });
});
