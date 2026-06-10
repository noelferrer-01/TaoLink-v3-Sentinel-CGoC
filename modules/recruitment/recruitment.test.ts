/**
 * recruitment.test.ts — integration tests against real Postgres (sentinel_test
 * via TEST_DATABASE_URL). Cleanup respects FK order:
 *   applicant_documents → applicants → blacklist → employees
 * (applicants.hired_employee_id and blacklist.source_employee_id reference
 * hr_employees, so employees are deleted last; payslips/pay_runs cleared too
 * because the hire→no-payslip test runs payroll.)
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { applicants, applicantDocuments, blacklist } from './schema';
import { employees } from '@/modules/hr/schema';
import { persons } from '@/modules/persons/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { hr } from '@/modules/hr';
import {
  createPerson,
  updatePerson,
  listCredentials,
} from '@/modules/persons';
import { runPayroll, listPayslips } from '@/modules/payroll';
import { recruitment } from './index';
import { DOC_TO_CRED_TYPE, DOC_TYPE_LABELS, type DocType } from './labels';

// Full cleanup in FK order. Run in beforeEach AND afterAll so this suite never
// leaves trailing applicant rows that would block other suites' employee
// deletes (recruitment_applicants/blacklist FK into hr_employees).
async function cleanup() {
  const db = getDb();
  await db.delete(payslips);
  await db.delete(payRuns);
  await db.delete(dtrEntries);
  await db.delete(dtrPeriodCloses);
  await db.delete(assignmentsTable);
  await db.delete(applicantDocuments);
  await db.delete(applicants);
  await db.delete(blacklist);
  await db.delete(employees);
  await db.delete(persons);
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

    // T11: matcher now routes through persons; exact SSS match via findPersonByAnyId
    const bySss = await recruitment.checkMatches({ personId: null, firstName: 'X', lastName: 'Y', sssNumber: '34-1234567-8' });
    expect(bySss.some((m) => m.kind === 'terminated_employee' && m.confidence === 'exact')).toBe(true);

    // T11: fuzzy name+DOB match via findPossibleDuplicates → persons
    const byName = await recruitment.checkMatches({ personId: null, firstName: 'Juan', lastName: 'Dela Cruz', dateOfBirth: '1990-01-01' });
    expect(byName.some((m) => m.kind === 'terminated_employee' && m.confidence === 'possible')).toBe(true);
  });

  it('checkMatches flags an active blacklist entry and returns nothing for a clean applicant', async () => {
    await recruitment.addToBlacklist({ firstName: 'Bad', lastName: 'Guy', dateOfBirth: '1985-05-05', reason: 'theft' });
    const hit = await recruitment.checkMatches({ personId: null, firstName: 'Bad', lastName: 'Guy', dateOfBirth: '1985-05-05' });
    expect(hit.some((m) => m.kind === 'blacklist')).toBe(true);
    const clean = await recruitment.checkMatches({ personId: null, firstName: 'Fresh', lastName: 'Face', dateOfBirth: '2000-01-01' });
    expect(clean.length).toBe(0);
  });

  // ─── identity-first intake (T13) ────────────────────────────────────────────
  it('createApplicant with a PhilSys ID anchors the person and clears the ID-pending nudge', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Ramon', lastName: 'Magsaysay', source: 'walk_in', appliedOn: '2026-05-29',
      dateOfBirth: '1990-01-01', philsysNumber: '1234-5678-9012',
    });
    expect(a.idPending).toBe(false);
    const got = await recruitment.getApplicant(a.id);
    expect(got?.identity.anchorIdType).toBe('philsys');
    expect(got?.identity.philsysNumber).toBe('1234-5678-9012');
  });

  it('createApplicant with no government ID is provisional (idPending true, anchor none)', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Diego', lastName: 'Silang', source: 'walk_in', appliedOn: '2026-05-29', dateOfBirth: '1985-02-02',
    });
    expect(a.idPending).toBe(true);
    const got = await recruitment.getApplicant(a.id);
    expect(got?.identity.anchorIdType).toBe('none');
  });

  it('checkMatches flags a concurrent applicant by PhilSys number (widened gov-ID channel)', async () => {
    await recruitment.createApplicant({
      firstName: 'Apolinario', lastName: 'Mabini', source: 'walk_in', appliedOn: '2026-05-29',
      dateOfBirth: '1990-03-03', philsysNumber: '1111-2222-3333',
    });
    const m = await recruitment.checkMatches({ personId: null, firstName: 'Z', lastName: 'Q', philsysNumber: '1111-2222-3333' });
    expect(m.some((x) => x.kind === 'concurrent_applicant')).toBe(true);
  });

  // ─── listApplicantsPage (search + paginate) ─────────────────────────────────
  describe('listApplicantsPage', () => {
    async function seedTrio() {
      await recruitment.createApplicant({ firstName: 'Juan', lastName: 'Dela Cruz', source: 'walk_in', appliedOn: '2026-05-01', sssNumber: '34-1234567-8' });
      await recruitment.createApplicant({ firstName: 'Maria', lastName: 'Santos', source: 'referral', appliedOn: '2026-05-02', sssNumber: '99-8888888-7' });
      await recruitment.createApplicant({ firstName: 'Pedro', lastName: 'Reyes', source: 'walk_in', appliedOn: '2026-05-03' });
    }

    it('name search returns the matching applicant (fuzzy, case-insensitive) and excludes non-matches', async () => {
      await seedTrio();
      const { rows } = await recruitment.listApplicantsPage({ query: 'DELA CRUZ', limit: 50, offset: 0 });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]?.lastName).toBe('Dela Cruz');
      expect(rows.some((r) => r.lastName === 'Santos')).toBe(false);
    });

    it('a numeric query searches by SSS (substring), not by name', async () => {
      await seedTrio();
      const { rows } = await recruitment.listApplicantsPage({ query: '1234567', limit: 50, offset: 0 });
      expect(rows.length).toBe(1);
      expect(rows[0]?.firstName).toBe('Juan');
    });

    it('stage filter restricts results and total', async () => {
      await seedTrio();
      const found = await recruitment.listApplicantsPage({ query: 'Santos', limit: 50, offset: 0 });
      await recruitment.advanceStage(found.rows[0]!.id, 'contacted');
      const applied = await recruitment.listApplicantsPage({ stage: 'applied', limit: 50, offset: 0 });
      expect(applied.total).toBe(2);
      expect(applied.rows.some((r) => r.lastName === 'Santos')).toBe(false);
    });

    it('total counts all matches; rows respect the page limit', async () => {
      await seedTrio();
      const { rows, total } = await recruitment.listApplicantsPage({ limit: 2, offset: 0 });
      expect(total).toBe(3);
      expect(rows.length).toBe(2);
    });
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
    // Identity lives on the Person — read it back through the merged accessor.
    const merged = await hr.getEmployeeWithIdentity(emp.id);
    expect(merged?.firstName).toBe('Ana');
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
    // T11: hireApplicant requires a gov ID — add sssNumber so assertAnchored passes.
    const a = await recruitment.createApplicant({ firstName: 'Z', lastName: 'Q', source: 'walk_in', appliedOn: '2026-05-29', sssNumber: '34-NOPAY-001' });
    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');
    const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-01' });

    const run = await runPayroll('2026-06-01', '2026-06-15', { isFinalCutOfMonth: false });
    const slips = await listPayslips({ payRunId: run.id });
    expect(slips.find((s) => s.employeeId === emp.id)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 7 — createApplicant + hireApplicant create/link a Person
// ─────────────────────────────────────────────────────────────────────────────
describe('recruitment.createApplicant — dual-write (T7)', () => {
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('mints a Person and sets personId on the applicant', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Lena',
      lastName: 'Garcia',
      source: 'walk_in',
      appliedOn: '2026-06-01',
      sssNumber: '34-7777777-7',
      dateOfBirth: '1995-08-15',
    });
    expect(a.personId).not.toBeNull();
    const ps = await getDb().select().from(persons).where(sql`id = ${a.personId}`);
    expect(ps[0]).toBeDefined();
    expect(ps[0]!.firstName).toBe('Lena');
    expect(ps[0]!.sssNumber).toBe('34-7777777-7');
    // The applicant role row carries no identity; getApplicant merges it back in.
    const got = await recruitment.getApplicant(a.id);
    expect(got?.identity.firstName).toBe('Lena');
    expect(got?.identity.sssNumber).toBe('34-7777777-7');
  });

  it('prefixes raw Postgres errors from the applicant insert with the module name', async () => {
    // createPerson succeeds (names only), then the applicant INSERT fails on the
    // malformed date — that raw pg error must carry the module prefix.
    await expect(
      recruitment.createApplicant({
        firstName: 'Bad', lastName: 'Date',
        source: 'walk_in', appliedOn: 'not-a-date',
      }),
    ).rejects.toThrow(/\[recruitment\/createApplicant\]/);
  });

  it('exposes secondary-ID anchors (passport/UMID/DL) through getApplicant identity', async () => {
    // A walk-in whose only ID is a passport — the ladder anchors on it, and the
    // detail page must be able to display it (not "Not set — provisional").
    const a = await recruitment.createApplicant({
      firstName: 'Pasaporte', lastName: 'Lang',
      source: 'walk_in', appliedOn: '2026-06-01',
      passportNumber: 'P1234567A',
    });
    const got = await recruitment.getApplicant(a.id);
    expect(got?.identity.anchorIdType).toBe('passport');
    expect(got?.identity.passportNumber).toBe('P1234567A');
    expect(got?.identity.umidNumber).toBeNull();
    expect(got?.identity.driversLicenseNumber).toBeNull();
  });
});

describe('recruitment.hireApplicant — reuses applicant personId (T7)', () => {
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('the new employee personId equals the applicant personId (same human, no duplicate Person)', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Marco',
      lastName: 'Villanueva',
      source: 'referral',
      appliedOn: '2026-06-01',
      sssNumber: '34-8888888-8',
    });
    const applicantPersonId = a.personId;
    expect(applicantPersonId).not.toBeNull();

    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');

    const countBefore = (await getDb().select({ id: persons.id }).from(persons)).length;
    const emp = await recruitment.hireApplicant(a.id, { basicSalary: 20000, hiredOn: '2026-06-10' });
    const countAfter = (await getDb().select({ id: persons.id }).from(persons)).length;

    // No new Person row minted during hire
    expect(countAfter).toBe(countBefore);
    // Employee links to the applicant's existing Person
    expect(emp.personId).toBe(applicantPersonId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 11 — hireApplicant: ID gate (assertAnchored)
// ─────────────────────────────────────────────────────────────────────────────
describe('recruitment.hireApplicant — T11: hire gate', () => {
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('throws a plain-language error when the applicant has no anchor ID (anchorIdType=none)', async () => {
    // Create applicant with no SSS (Person will have anchorIdType='none')
    const a = await recruitment.createApplicant({
      firstName: 'NoId', lastName: 'Guard',
      source: 'walk_in', appliedOn: '2026-06-01',
      // no sssNumber → anchorIdType will be 'none'
    });
    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');

    await expect(
      recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-10' }),
    ).rejects.toThrow(/government id.*required|required.*government id|add.*id.*before|id.*required/i);
  });

  // (The former "no personId at all" test was removed at T12: applicant rows
  // with personId = NULL are impossible now — recruitment_applicants.person_id
  // is NOT NULL. The anchorIdType='none' gate above is the surviving guard.)

  it('succeeds when the applicant has an anchor ID', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'WithId', lastName: 'Guard',
      source: 'walk_in', appliedOn: '2026-06-01',
      sssNumber: '34-T11H-001',
    });
    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');

    const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-10' });
    expect(emp.status).toBe('hired');
    // Employee shares the applicant's Person
    expect(emp.personId).toBe(a.personId);
  });

  it('hires a provisional applicant once the Person is anchored via updatePerson (HireModal path)', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Provisional', lastName: 'Hire',
      source: 'walk_in', appliedOn: '2026-06-01',
      // no ID → anchorIdType 'none'
    });
    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');

    // The HireModal path: anchor type + ID value set TOGETHER, then hire.
    await updatePerson(a.personId, { anchorIdType: 'sss', sssNumber: '34-HMOD-001' });

    const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-10' });
    expect(emp.status).toBe('hired');
    expect(emp.personId).toBe(a.personId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 11 — advanceStage: sets idPending from Person's anchorIdType
// ─────────────────────────────────────────────────────────────────────────────
describe('recruitment.advanceStage — T11: idPending nudge', () => {
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('sets idPending=true when Person has anchorIdType=none', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'NeedsId', lastName: 'Guard',
      source: 'walk_in', appliedOn: '2026-06-01',
      // no SSS → anchorIdType = 'none'
    });
    const updated = await recruitment.advanceStage(a.id, 'contacted');
    expect(updated.idPending).toBe(true);
  });

  it('sets idPending=false when Person has an anchor ID', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'HasId', lastName: 'Guard',
      source: 'walk_in', appliedOn: '2026-06-01',
      sssNumber: '34-T11AS-001',
    });
    const updated = await recruitment.advanceStage(a.id, 'contacted');
    expect(updated.idPending).toBe(false);
  });

  it('never throws for missing anchor ID — always advances', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'NoBlock', lastName: 'Guard',
      source: 'walk_in', appliedOn: '2026-06-01',
    });
    // Should NOT throw even with no ID
    await expect(recruitment.advanceStage(a.id, 'contacted')).resolves.toBeDefined();
  });

  // (The former "no personId at all → idPending" test was removed at T12:
  // person-less applicant rows are impossible now — person_id is NOT NULL.
  // The anchorIdType='none' → idPending=true nudge above still covers the
  // surviving real-world case.)

  it('includes idPending in the audit payload', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'AuditId', lastName: 'Check',
      source: 'walk_in', appliedOn: '2026-06-01',
      // no SSS → Person will have anchorIdType='none' → idPending=true
    });
    const updated = await recruitment.advanceStage(a.id, 'contacted');

    // idPending is returned on the updated applicant row
    expect(updated.idPending).toBe(true);

    // Confirm the DB row has the value persisted
    const [dbRow] = await getDb()
      .select({ idPending: applicants.idPending })
      .from(applicants)
      .where(sql`id = ${a.id}`);
    expect(dbRow).toBeDefined();
    expect(dbRow!.idPending).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3a Task 11 — checkMatches: all-Person matcher
// ─────────────────────────────────────────────────────────────────────────────
describe('recruitment.checkMatches — T11: all-Person matcher', () => {
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('same Person already an ACTIVE employee → exact + active_employee kind (double-hire)', async () => {
    // Create a person and link them as an active employee
    const person = await createPerson({
      firstName: 'Active', lastName: 'Employee',
      sssNumber: '34-ACT-0001', anchorIdType: 'sss',
    });
    await hr.createEmployee({
      employeeCode: 'CG-T11M-001',
      firstName: 'Active', lastName: 'Employee',
      basicSalary: 18000, hiredOn: '2026-01-01',
      sssNumber: '34-ACT-0001',
      personId: person.id,
    });
    // status is 'hired' (active) by default

    const matches = await recruitment.checkMatches({
      personId: person.id,
      firstName: 'Active', lastName: 'Employee',
      sssNumber: '34-ACT-0001',
    });
    const activeMatch = matches.find((m) => m.kind === 'active_employee');
    expect(activeMatch).toBeDefined();
    expect(activeMatch?.confidence).toBe('exact');
    expect(activeMatch?.label).toMatch(/CG-T11M-001/);
  });

  it('same Person is a terminated employee → exact + terminated_employee kind', async () => {
    const person = await createPerson({
      firstName: 'Terminated', lastName: 'Guard',
      sssNumber: '34-TER-0001', anchorIdType: 'sss',
    });
    const emp = await hr.createEmployee({
      employeeCode: 'CG-T11M-002',
      firstName: 'Terminated', lastName: 'Guard',
      basicSalary: 18000, hiredOn: '2026-01-01',
      sssNumber: '34-TER-0001',
      personId: person.id,
    });
    await hr.changeStatus(emp.id, 'terminated', 'AWOL');

    const matches = await recruitment.checkMatches({
      personId: person.id,
      firstName: 'Terminated', lastName: 'Guard',
      sssNumber: '34-TER-0001',
    });
    const termMatch = matches.find((m) => m.kind === 'terminated_employee');
    expect(termMatch).toBeDefined();
    expect(termMatch?.confidence).toBe('exact');
    expect(termMatch?.label).toMatch(/CG-T11M-002/);
  });

  it('same Person has a second in-flight application → exact + concurrent_applicant (subject applicant NOT returned)', async () => {
    const person = await createPerson({
      firstName: 'Concurrent', lastName: 'Applicant',
      sssNumber: '34-CON-0001', anchorIdType: 'sss',
    });
    // Create the "other" in-flight applicant linked to same person (direct
    // insert — role row only; identity lives on the shared Person)
    const [otherApp] = await getDb()
      .insert(applicants)
      .values({
        source: 'walk_in', appliedOn: '2026-06-01',
        pipelineStage: 'contacted', // in-flight
        positionAppliedFor: 'GUARD',
        isArmedPost: false,
        personId: person.id,
      })
      .returning();

    // The subject applicant (the one we are viewing) also linked to same person
    const [subjectApp] = await getDb()
      .insert(applicants)
      .values({
        source: 'walk_in', appliedOn: '2026-06-02',
        pipelineStage: 'applied',
        positionAppliedFor: 'GUARD',
        isArmedPost: false,
        personId: person.id,
      })
      .returning();

    const matches = await recruitment.checkMatches({
      personId: person.id,
      firstName: 'Concurrent', lastName: 'Applicant',
      sssNumber: '34-CON-0001',
      excludeApplicantId: subjectApp!.id, // exclude the subject applicant
    });

    // The other in-flight applicant should show as concurrent
    const concurrentMatch = matches.find((m) => m.kind === 'concurrent_applicant');
    expect(concurrentMatch).toBeDefined();
    expect(concurrentMatch?.confidence).toBe('exact');
    // The subject applicant must NOT be in results
    expect(matches.some((m) => m.refId === subjectApp!.id)).toBe(false);
    // The other applicant IS in results
    expect(matches.some((m) => m.refId === otherApp!.id)).toBe(true);
  });

  it('blacklist entry with matching personId → exact + blacklist kind', async () => {
    const person = await createPerson({
      firstName: 'Blacklisted', lastName: 'Person',
      sssNumber: '34-BL-0001', anchorIdType: 'sss',
    });

    // Insert blacklist entry with personId
    await getDb()
      .insert(blacklist)
      .values({
        firstName: 'Blacklisted', lastName: 'Person',
        sssNumber: '34-BL-0001',
        reason: 'violence',
        personId: person.id,
      });

    const matches = await recruitment.checkMatches({
      personId: person.id,
      firstName: 'Blacklisted', lastName: 'Person',
      sssNumber: '34-BL-0001',
    });
    const blMatch = matches.find((m) => m.kind === 'blacklist' && m.confidence === 'exact');
    expect(blMatch).toBeDefined();
  });

  it('blacklist snapshot SSS match (no personId) → exact + blacklist kind', async () => {
    await getDb()
      .insert(blacklist)
      .values({
        firstName: 'Snapshot', lastName: 'Bl',
        sssNumber: '34-BL-0002',
        reason: 'theft',
        // personId is null — snapshot match
      });

    const matches = await recruitment.checkMatches({
      personId: null,
      firstName: 'Snapshot', lastName: 'Bl',
      sssNumber: '34-BL-0002',
    });
    const blMatch = matches.find((m) => m.kind === 'blacklist' && m.confidence === 'exact');
    expect(blMatch).toBeDefined();
  });

  it('fuzzy name+DOB match via persons → possible confidence', async () => {
    const person = await createPerson({
      firstName: 'Fuzzy', lastName: 'Match',
      dateOfBirth: '1990-03-15',
      anchorIdType: 'none',
    });
    // Link to an employee so the person has a role
    await hr.createEmployee({
      employeeCode: 'CG-T11M-FUZ',
      firstName: 'Fuzzy', lastName: 'Match',
      basicSalary: 18000, hiredOn: '2026-01-01',
      personId: person.id,
    });

    const matches = await recruitment.checkMatches({
      personId: null,
      firstName: 'Fuzzy', lastName: 'Match',
      dateOfBirth: '1990-03-15',
    });
    expect(matches.some((m) => m.confidence === 'possible')).toBe(true);
  });

  it('person-less subject with no IDs → no crash, returns whatever matches it can', async () => {
    // Should not throw even with null personId and no IDs
    await expect(
      recruitment.checkMatches({
        personId: null,
        firstName: 'Ghost', lastName: 'Nobody',
      }),
    ).resolves.toBeDefined();
  });

  it('terminated employee still matched via persons (regression guard)', async () => {
    const person = await createPerson({
      firstName: 'Rehire', lastName: 'Check',
      sssNumber: '34-RH-T11-001', anchorIdType: 'sss',
    });
    const emp = await hr.createEmployee({
      employeeCode: 'CG-T11-RH-001',
      firstName: 'Rehire', lastName: 'Check',
      basicSalary: 18000, hiredOn: '2026-01-01',
      sssNumber: '34-RH-T11-001',
      personId: person.id,
    });
    await hr.changeStatus(emp.id, 'terminated', 'AWOL');

    // Match via SSS (now routed through Person)
    const matches = await recruitment.checkMatches({
      personId: null,
      firstName: 'X', lastName: 'Y',
      sssNumber: '34-RH-T11-001',
    });
    expect(matches.some((m) => m.kind === 'terminated_employee')).toBe(true);
  });
});

// (listReadinessIssues moved to modules/hr — see modules/hr/hr.test.ts.)

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3b Task 4 — DOC_TO_CRED_TYPE map (round-trip guard, no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe('DOC_TO_CRED_TYPE (doc→credential map)', () => {
  it('maps every clearance doc type to its identically-spelled credential, and only resume_biodata/other to null', () => {
    for (const docType of Object.keys(DOC_TYPE_LABELS) as DocType[]) {
      const cred = DOC_TO_CRED_TYPE[docType];
      if (docType === 'resume_biodata' || docType === 'other') {
        expect(cred, `${docType} must NOT be a credential`).toBeNull();
      } else {
        // Identity spelling preserved — guards against a silent map gap.
        expect(cred, `${docType} must map to a credential`).toBe(docType);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3b Task 4 — hireApplicant carries verified clearances → credentials
// ─────────────────────────────────────────────────────────────────────────────

describe('recruitment.hireApplicant — carries verified clearances (Slice 3b)', () => {
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('copies verified clearances onto the Person, with expiry, and skips résumé', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Carry', lastName: 'Forward', source: 'walk_in', appliedOn: '2026-05-01',
      sssNumber: '34-CARRY-001',   // anchor ID so the hire gate passes
      isArmedPost: true,           // so ltopf_license is in the checklist
    });
    await recruitment.advanceStage(a.id, 'contacted');
    await recruitment.advanceStage(a.id, 'documents');

    await recruitment.setDocument(a.id, 'sosia_license',  { status: 'verified', expiresOn: '2027-02-01' });
    await recruitment.setDocument(a.id, 'ltopf_license',  { status: 'verified', expiresOn: '2026-12-31' });
    await recruitment.setDocument(a.id, 'resume_biodata', { status: 'verified' });   // verified but NOT a credential
    // nbi_clearance left pending → must NOT carry forward.

    await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-01' });

    const creds = await listCredentials(a.personId);
    const byType = new Map(creds.map((c) => [c.credType, c]));

    expect(byType.get('sosia_license')?.expiresOn).toBe('2027-02-01');
    expect(byType.get('ltopf_license')?.expiresOn).toBe('2026-12-31');
    // résumé is a document, not a credential — never carried.
    expect(creds.map((c) => c.credType as string)).not.toContain('resume_biodata');
    // only the two VERIFIED clearances carried (pending docs did not).
    expect(creds).toHaveLength(2);
  });
});
