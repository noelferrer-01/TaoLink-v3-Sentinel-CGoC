/**
 * recruitment.test.ts — integration tests against real Postgres (sentinel_test
 * via TEST_DATABASE_URL). Cleanup respects FK order:
 *   applicant_documents → applicants → blacklist → employees
 * (applicants.hired_employee_id and blacklist.source_employee_id reference
 * hr_employees, so employees are deleted last; payslips/pay_runs cleared too
 * because the hire→no-payslip test runs payroll.)
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { applicants, applicantDocuments, blacklist } from './schema';
import { employees } from '@/modules/hr/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { dtrEntries } from '@/modules/dtr/schema';
import { hr } from '@/modules/hr';
import { runPayroll, listPayslips } from '@/modules/payroll';
import { recruitment } from './index';

// Full cleanup in FK order. Run in beforeEach AND afterAll so this suite never
// leaves trailing applicant rows that would block other suites' employee
// deletes (recruitment_applicants/blacklist FK into hr_employees).
async function cleanup() {
  const db = getDb();
  await db.delete(payslips);
  await db.delete(payRuns);
  await db.delete(dtrEntries);
  await db.delete(applicantDocuments);
  await db.delete(applicants);
  await db.delete(blacklist);
  await db.delete(employees);
}

describe('recruitment service', () => {
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await closeDb(); });

  // ─── createApplicant + checklist ───────────────────────────────────────────
  it('createApplicant defaults to applied and seeds the unarmed required-doc checklist', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Ana', lastName: 'Reyes', source: 'referral', appliedOn: '2026-05-29',
    });
    expect(a.pipelineStage).toBe('applied');
    const got = await recruitment.getApplicant(a.id);
    expect(got?.documents.length).toBe(9);
  });

  it('createApplicant for an armed post includes the LTOPF license', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'B', lastName: 'C', source: 'walk_in', appliedOn: '2026-05-29', isArmedPost: true,
    });
    const got = await recruitment.getApplicant(a.id);
    expect(got?.documents.some((d) => d.docType === 'ltopf_license')).toBe(true);
    expect(got?.documents.length).toBe(10);
  });

  // ─── stage transitions ─────────────────────────────────────────────────────
  it('advanceStage follows the allowed matrix', async () => {
    const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
    await recruitment.advanceStage(a.id, 'contacted');
    const got = await recruitment.getApplicant(a.id);
    expect(got?.applicant.pipelineStage).toBe('contacted');
  });

  it('advanceStage rejects an illegal transition', async () => {
    const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
    await expect(recruitment.advanceStage(a.id, 'hired')).rejects.toThrow(/cannot move/i);
  });

  // ─── documents ──────────────────────────────────────────────────────────────
  it('setDocument marks a doc verified', async () => {
    const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
    await recruitment.setDocument(a.id, 'nbi_clearance', { status: 'verified', expiresOn: '2027-05-01' });
    const got = await recruitment.getApplicant(a.id);
    expect(got?.documents.find((d) => d.docType === 'nbi_clearance')?.status).toBe('verified');
  });

  // ─── reject / withdraw ──────────────────────────────────────────────────────
  it('reject is terminal and records the reason', async () => {
    const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
    await recruitment.rejectApplicant(a.id, 'failed neuro-psych');
    const got = await recruitment.getApplicant(a.id);
    expect(got?.applicant.pipelineStage).toBe('rejected');
    expect(got?.applicant.outcomeReason).toBe('failed neuro-psych');
  });

  // ─── checkMatches ────────────────────────────────────────────────────────────
  it('checkMatches flags a terminated employee by SSS (exact) and by name+DOB (possible)', async () => {
    const emp = await hr.createEmployee({
      employeeCode: 'CG-20001', firstName: 'Juan', lastName: 'Dela Cruz',
      basicSalary: 18000, hiredOn: '2026-01-01', dateOfBirth: '1990-01-01', sssNumber: '34-1234567-8',
    });
    await hr.changeStatus(emp.id, 'terminated', 'AWOL');

    const bySss = await recruitment.checkMatches({ firstName: 'X', lastName: 'Y', sssNumber: '34-1234567-8' });
    expect(bySss.some((m) => m.kind === 'terminated_employee' && m.confidence === 'exact')).toBe(true);

    const byName = await recruitment.checkMatches({ firstName: 'Juan', lastName: 'Dela Cruz', dateOfBirth: '1990-01-01' });
    expect(byName.some((m) => m.kind === 'terminated_employee' && m.confidence === 'possible')).toBe(true);
  });

  it('checkMatches flags an active blacklist entry and returns nothing for a clean applicant', async () => {
    await recruitment.addToBlacklist({ firstName: 'Bad', lastName: 'Guy', dateOfBirth: '1985-05-05', reason: 'theft' });
    const hit = await recruitment.checkMatches({ firstName: 'Bad', lastName: 'Guy', dateOfBirth: '1985-05-05' });
    expect(hit.some((m) => m.kind === 'blacklist')).toBe(true);
    const clean = await recruitment.checkMatches({ firstName: 'Fresh', lastName: 'Face', dateOfBirth: '2000-01-01' });
    expect(clean.length).toBe(0);
  });

  // ─── hireApplicant (ADR 0009 handoff) ───────────────────────────────────────
  it('hireApplicant creates an employee, back-links, and is terminal', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Ana', lastName: 'Reyes', source: 'referral', appliedOn: '2026-05-29',
      dateOfBirth: '1994-03-12', sssNumber: '11-2222222-3',
    });
    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');
    const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-01' });

    expect(emp.employeeCode).toMatch(/^CG-\d{5}$/);
    expect(emp.status).toBe('hired');
    expect(emp.firstName).toBe('Ana');
    const got = await recruitment.getApplicant(a.id);
    expect(got?.applicant.pipelineStage).toBe('hired');
    expect(got?.applicant.hiredEmployeeId).toBe(emp.id);
  });

  it('hireApplicant rejects before documents stage', async () => {
    const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
    await expect(recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-01' }))
      .rejects.toThrow(/completed documents/i);
  });

  it('a freshly-hired (undeployed) employee produces NO payslip', async () => {
    const a = await recruitment.createApplicant({ firstName: 'Z', lastName: 'Q', source: 'walk_in', appliedOn: '2026-05-29' });
    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');
    const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-01' });

    const run = await runPayroll('2026-06-01', '2026-06-15', { isFinalCutOfMonth: false });
    const slips = await listPayslips({ payRunId: run.id });
    expect(slips.find((s) => s.employeeId === emp.id)).toBeUndefined();
  });
});
