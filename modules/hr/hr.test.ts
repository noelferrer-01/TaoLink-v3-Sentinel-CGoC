import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { employees } from './schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { hr } from './index';

describe('hr.createEmployee + state machine', () => {
  beforeEach(async () => {
    // FK order: assignments → employees
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
});

describe('hr.bulkImportEmployees', () => {
  beforeEach(async () => {
    // FK order: assignments → employees
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
