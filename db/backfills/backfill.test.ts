/**
 * backfill.test.ts — Integration tests for the persons backfill (0021-persons.ts).
 *
 * Every safety case required by Slice 3a Task 4:
 *   - Dedup: two employees with same SSS → first anchor, second quarantined (two-sided)
 *   - Empty-string: sss_number='' → Person sssNumber NULL, anchorIdType='none'
 *   - Phase order: hired applicant links to employee's Person; no duplicate Person
 *   - Idempotent: second run → identical counts
 *   - Blacklist link: SSS match → blacklist.person_id set
 *   - is_armed_post: hired via armed applicant → true; bulk employee → NULL
 *   - Quarantine report lists quarantined rows
 *
 * Runs against TEST_DATABASE_URL (sentinel_test). Must be at migration 0022.
 *
 * Cleanup: beforeEach resets persons, employees, applicants, blacklist in FK order.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { getDb, closeDb } from '@/core/db';
import { persons } from '@/modules/persons/schema';
import { employees } from '@/modules/hr/schema';
import { applicants, applicantDocuments, blacklist } from '@/modules/recruitment/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { runBackfill, type BackfillReport } from './0021-persons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _codeSeq = 0;
function nextCode(): string {
  return `TEST-${String(++_codeSeq).padStart(5, '0')}`;
}

/** Insert a minimal employee row and return its id. */
async function insertEmployee(opts: {
  firstName: string;
  lastName: string;
  sssNumber?: string | null;
  tinNumber?: string | null;
  philhealthNumber?: string | null;
  pagibigNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  city?: string | null;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(employees)
    .values({
      employeeCode: nextCode(),
      firstName: opts.firstName,
      lastName: opts.lastName,
      sssNumber: opts.sssNumber ?? null,
      tinNumber: opts.tinNumber ?? null,
      philhealthNumber: opts.philhealthNumber ?? null,
      pagibigNumber: opts.pagibigNumber ?? null,
      email: opts.email ?? null,
      phone: opts.phone ?? null,
      dateOfBirth: opts.dateOfBirth ?? null,
      addressLine1: opts.addressLine1 ?? null,
      basicSalary: '18000',
      hiredOn: '2026-01-01',
    })
    .returning({ id: employees.id });
  return row!.id;
}

/** Insert a minimal applicant and return its id. */
async function insertApplicant(opts: {
  firstName: string;
  lastName: string;
  sssNumber?: string | null;
  dateOfBirth?: string | null;
  isArmedPost?: boolean;
  hiredEmployeeId?: string | null;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(applicants)
    .values({
      firstName: opts.firstName,
      lastName: opts.lastName,
      sssNumber: opts.sssNumber ?? null,
      dateOfBirth: opts.dateOfBirth ?? null,
      isArmedPost: opts.isArmedPost ?? false,
      hiredEmployeeId: opts.hiredEmployeeId ?? null,
      source: 'walk_in',
      positionAppliedFor: 'GUARD',
      pipelineStage: opts.hiredEmployeeId ? 'hired' : 'applied',
      appliedOn: '2026-01-01',
    })
    .returning({ id: applicants.id });
  return row!.id;
}

/** Insert a minimal blacklist entry and return its id. */
async function insertBlacklist(opts: {
  firstName: string;
  lastName: string;
  sssNumber?: string | null;
  dateOfBirth?: string | null;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(blacklist)
    .values({
      firstName: opts.firstName,
      lastName: opts.lastName,
      sssNumber: opts.sssNumber ?? null,
      dateOfBirth: opts.dateOfBirth ?? null,
      reason: 'test',
    })
    .returning({ id: blacklist.id });
  return row!.id;
}

// ─── Cleanup (FK order) ───────────────────────────────────────────────────────
// Full FK order matching hr.test.ts + recruitment.test.ts patterns:
//   payslips → payRuns → dtrEntries → dtrPeriodCloses → assignmentsTable
//   → applicantDocuments → applicants → blacklist → employees → persons
//
// persons must be last: employees/applicants/blacklist all have person_id FKs
// (ON DELETE SET NULL, but Postgres still checks on delete unless we go in order).

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

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('persons backfill (0021-persons)', () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // DEDUP: two employees with the same SSS number
  // Expected: first keeps anchorIdType='sss'; second gets 'none' + suspectedDuplicateOf
  //   (two-sided), its SSS in quarantinedIds, sssNumber NULL on persons row.
  // ────────────────────────────────────────────────────────────────────────────
  it('dedup: two employees same SSS → first-processed anchored, second quarantined (two-sided)', async () => {
    const db = getDb();
    const dupSss = '12-3456789-0';

    const empId1 = await insertEmployee({ firstName: 'Ana', lastName: 'Reyes', sssNumber: dupSss });
    const empId2 = await insertEmployee({ firstName: 'Maria', lastName: 'Santos', sssNumber: dupSss });

    const report = await runBackfill();

    // Both employees should have person_id set
    const [e1] = await db.select().from(employees).where(eq(employees.id, empId1));
    const [e2] = await db.select().from(employees).where(eq(employees.id, empId2));
    expect(e1!.personId).toBeTruthy();
    expect(e2!.personId).toBeTruthy();

    // Different person rows
    expect(e1!.personId).not.toBe(e2!.personId);

    const [p1] = await db.select().from(persons).where(eq(persons.id, e1!.personId!));
    const [p2] = await db.select().from(persons).where(eq(persons.id, e2!.personId!));

    // Exactly one is anchored on SSS; the other is quarantined.
    // Which is "first" depends on UUID sort order, not insertion order.
    const anchorP   = [p1!, p2!].find((p) => p.anchorIdType === 'sss')!;
    const quarantineP = [p1!, p2!].find((p) => p.anchorIdType === 'none')!;

    expect(anchorP).toBeDefined();
    expect(quarantineP).toBeDefined();

    expect(anchorP.sssNumber).toBe(dupSss);
    expect(quarantineP.sssNumber).toBeNull();
    expect(quarantineP.quarantinedIds).toContain(`sss:${dupSss}`);

    // Two-sided: both persons have suspectedDuplicateOf set
    expect(quarantineP.suspectedDuplicateOf).toBe(anchorP.id);
    expect(anchorP.suspectedDuplicateOf).toBe(quarantineP.id);

    // Quarantine report lists the duplicate
    expect(report.quarantinedRows.length).toBeGreaterThanOrEqual(1);
    expect(report.suspectedDuplicatePairs.length).toBeGreaterThanOrEqual(1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // findPersonByAnyId: the quarantined person is still findable by its SSS
  // ────────────────────────────────────────────────────────────────────────────
  it('dedup: quarantined person remains findable via quarantinedIds', async () => {
    const db = getDb();
    const dupSss = '99-8765432-1';

    const empId1 = await insertEmployee({ firstName: 'Juan', lastName: 'Cruz', sssNumber: dupSss });
    const empId2 = await insertEmployee({ firstName: 'Pedro', lastName: 'Bautista', sssNumber: dupSss });

    await runBackfill();

    const [e1] = await db.select().from(employees).where(eq(employees.id, empId1));
    const [e2] = await db.select().from(employees).where(eq(employees.id, empId2));
    const [p1] = await db.select().from(persons).where(eq(persons.id, e1!.personId!));
    const [p2] = await db.select().from(persons).where(eq(persons.id, e2!.personId!));

    // Find which person was quarantined (anchorIdType=none)
    const quarantinedP = [p1!, p2!].find((p) => p.anchorIdType === 'none')!;
    expect(quarantinedP).toBeDefined();

    // quarantinedIds must have the SSS value so findPersonByAnyId can surface it
    expect(quarantinedP.quarantinedIds).toBeTruthy();
    const lines = quarantinedP.quarantinedIds!.split('\n');
    const hasSss = lines.some((l) => l === `sss:${dupSss}`);
    expect(hasSss).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // EMPTY-STRING: sss_number='' → Person sssNumber NULL, anchorIdType='none'
  // ────────────────────────────────────────────────────────────────────────────
  it('empty-string sss_number="" → Person sssNumber NULL, anchorIdType=none', async () => {
    const db = getDb();
    const empId = await insertEmployee({ firstName: 'Legacy', lastName: 'Guard', sssNumber: '' });

    await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    expect(e!.personId).toBeTruthy();

    const [p] = await db.select().from(persons).where(eq(persons.id, e!.personId!));
    expect(p!.sssNumber).toBeNull();
    expect(p!.anchorIdType).toBe('none');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE ORDER: hired applicant links to employee's Person (no dup Person minted)
  // ────────────────────────────────────────────────────────────────────────────
  it('phase order: hired applicant shares employee Person; no extra Person minted', async () => {
    const db = getDb();

    const empId = await insertEmployee({ firstName: 'Carlos', lastName: 'Garcia' });
    const appId = await insertApplicant({
      firstName: 'Carlos',
      lastName: 'Garcia',
      hiredEmployeeId: empId,
    });

    const report = await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    const [a] = await db.select().from(applicants).where(eq(applicants.id, appId));

    // Both point to the same Person
    expect(e!.personId).toBeTruthy();
    expect(a!.personId).toBe(e!.personId);

    // Only ONE Person created (the employee's)
    expect(report.personsCreated).toBe(1);

    // Total persons in DB = 1
    const allPersons = await db.select().from(persons);
    expect(allPersons.length).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE ORDER: unhired applicant gets its own Person
  // ────────────────────────────────────────────────────────────────────────────
  it('phase order: unhired applicant (no hiredEmployeeId) gets its own Person', async () => {
    const db = getDb();

    const empId = await insertEmployee({ firstName: 'Rosa', lastName: 'Flores' });
    const appId = await insertApplicant({
      firstName: 'José',
      lastName: 'Torres',
      hiredEmployeeId: null,
    });

    const report = await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    const [a] = await db.select().from(applicants).where(eq(applicants.id, appId));

    expect(e!.personId).toBeTruthy();
    expect(a!.personId).toBeTruthy();
    expect(e!.personId).not.toBe(a!.personId);

    // 2 persons: one for the employee, one for the unhired applicant
    expect(report.personsCreated).toBe(2);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IDEMPOTENT: second run changes nothing
  // ────────────────────────────────────────────────────────────────────────────
  it('idempotent: running backfill twice produces identical counts', async () => {
    const db = getDb();
    const empId = await insertEmployee({ firstName: 'Ana', lastName: 'Reyes', sssNumber: '34-5678901-2' });
    const appId = await insertApplicant({ firstName: 'New', lastName: 'Applicant' });

    const report1 = await runBackfill();

    // Second run
    const report2 = await runBackfill();

    // No new persons created on second run
    expect(report2.personsCreated).toBe(0);
    expect(report2.quarantinedRows.length).toBe(0);

    // DB state unchanged
    const allPersons = await db.select().from(persons);
    expect(allPersons.length).toBe(report1.personsCreated);

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    const [a] = await db.select().from(applicants).where(eq(applicants.id, appId));
    expect(e!.personId).toBeTruthy();
    expect(a!.personId).toBeTruthy();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BLACKLIST LINK: blacklist.sss matches employee's Person → person_id set
  // ────────────────────────────────────────────────────────────────────────────
  it('blacklist link: sss match → blacklist.person_id set', async () => {
    const db = getDb();
    const sss = '55-1234567-8';

    const empId = await insertEmployee({ firstName: 'Fernando', lastName: 'Navarro', sssNumber: sss });
    const blId = await insertBlacklist({ firstName: 'Fernando', lastName: 'Navarro', sssNumber: sss });

    await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    const [bl] = await db.select().from(blacklist).where(eq(blacklist.id, blId));

    expect(e!.personId).toBeTruthy();
    expect(bl!.personId).toBe(e!.personId);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BLACKLIST LINK: no SSS match, no name+DOB match → blacklist.person_id stays NULL
  // ────────────────────────────────────────────────────────────────────────────
  it('blacklist: no match → person_id stays NULL', async () => {
    const db = getDb();
    await insertEmployee({ firstName: 'Juan', lastName: 'Cruz', sssNumber: '11-1111111-1' });
    const blId = await insertBlacklist({
      firstName: 'Unknown',
      lastName: 'Person',
      sssNumber: '99-9999999-9',
    });

    await runBackfill();

    const [bl] = await db.select().from(blacklist).where(eq(blacklist.id, blId));
    expect(bl!.personId).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // is_armed_post: hired via armed applicant → employee.is_armed_post = true
  // ────────────────────────────────────────────────────────────────────────────
  it('is_armed_post: employee hired via armed applicant → is_armed_post=true', async () => {
    const db = getDb();

    const empId = await insertEmployee({ firstName: 'Guard', lastName: 'Armed' });
    await insertApplicant({
      firstName: 'Guard',
      lastName: 'Armed',
      isArmedPost: true,
      hiredEmployeeId: empId,
    });

    await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    expect(e!.isArmedPost).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // is_armed_post: unarmed applicant → is_armed_post=false
  // ────────────────────────────────────────────────────────────────────────────
  it('is_armed_post: employee hired via unarmed applicant → is_armed_post=false', async () => {
    const db = getDb();

    const empId = await insertEmployee({ firstName: 'Staff', lastName: 'Office' });
    await insertApplicant({
      firstName: 'Staff',
      lastName: 'Office',
      isArmedPost: false,
      hiredEmployeeId: empId,
    });

    await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    expect(e!.isArmedPost).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // is_armed_post: bulk/legacy employee with no applicant → stays NULL
  // ────────────────────────────────────────────────────────────────────────────
  it('is_armed_post: bulk/legacy employee (no applicant) → is_armed_post stays NULL', async () => {
    const db = getDb();

    const empId = await insertEmployee({ firstName: 'Legacy', lastName: 'Bulk' });
    // No applicant row referencing this employee

    await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    expect(e!.isArmedPost).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // QUARANTINE REPORT: quarantined row is listed in report
  // ────────────────────────────────────────────────────────────────────────────
  it('quarantine report: lists quarantined employee (duplicate SSS)', async () => {
    const db = getDb();
    const dupSss = '77-7777777-7';

    const empId1 = await insertEmployee({ firstName: 'First', lastName: 'Emp', sssNumber: dupSss });
    const empId2 = await insertEmployee({ firstName: 'Second', lastName: 'Emp', sssNumber: dupSss });

    const report = await runBackfill();

    const [e1] = await db.select().from(employees).where(eq(employees.id, empId1));
    const [e2] = await db.select().from(employees).where(eq(employees.id, empId2));

    // Exactly one of the two employees should be quarantined (whichever was
    // processed second, determined by UUID sort order — not insertion order).
    // We validate by checking that one person is in quarantinedRows and the
    // other is the anchor it points at.
    const quarantinedPersonIds = new Set(report.quarantinedRows.map((r) => r.personId));
    const allPersonIds = [e1!.personId!, e2!.personId!];

    // Exactly one is quarantined
    const quarantinedCount = allPersonIds.filter((id) => quarantinedPersonIds.has(id)).length;
    expect(quarantinedCount).toBe(1);
    expect(report.quarantinedRows.length).toBeGreaterThanOrEqual(1);

    // suspectedDuplicatePairs should contain both person IDs
    const pairPersonIds = report.suspectedDuplicatePairs.flatMap((pair) => [pair.personId, pair.suspectedDuplicateOf]);
    expect(pairPersonIds).toContain(e1!.personId!);
    expect(pairPersonIds).toContain(e2!.personId!);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // DEDUP: duplicate TIN on employees
  // ────────────────────────────────────────────────────────────────────────────
  it('dedup: two employees same TIN → first-processed anchored, second quarantined', async () => {
    const db = getDb();
    const dupTin = '123456789';

    // Give them no SSS so TIN is the best available anchor.
    // Which employee is "first" depends on UUID sort order, not insertion order.
    const empId1 = await insertEmployee({ firstName: 'TinA', lastName: 'Emp', tinNumber: dupTin });
    const empId2 = await insertEmployee({ firstName: 'TinB', lastName: 'Emp', tinNumber: dupTin });

    await runBackfill();

    const [e1] = await db.select().from(employees).where(eq(employees.id, empId1));
    const [e2] = await db.select().from(employees).where(eq(employees.id, empId2));

    const [p1] = await db.select().from(persons).where(eq(persons.id, e1!.personId!));
    const [p2] = await db.select().from(persons).where(eq(persons.id, e2!.personId!));

    // Exactly one should have anchorIdType='tin'; the other should be quarantined
    const anchors   = [p1!, p2!].filter((p) => p.anchorIdType === 'tin');
    const quarantined = [p1!, p2!].filter((p) => p.anchorIdType === 'none');

    expect(anchors).toHaveLength(1);
    expect(quarantined).toHaveLength(1);

    expect(anchors[0]!.tinNumber).toBe(dupTin);
    expect(quarantined[0]!.tinNumber).toBeNull();
    expect(quarantined[0]!.quarantinedIds).toContain(`tin:${dupTin}`);

    // Two-sided link
    expect(quarantined[0]!.suspectedDuplicateOf).toBe(anchors[0]!.id);
    expect(anchors[0]!.suspectedDuplicateOf).toBe(quarantined[0]!.id);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // WHITESPACE TRIM: leading/trailing whitespace in sss/tin is trimmed
  // ────────────────────────────────────────────────────────────────────────────
  it('normalize: leading/trailing whitespace in sss is trimmed', async () => {
    const db = getDb();
    const empId = await insertEmployee({ firstName: 'Trim', lastName: 'Me', sssNumber: '  34-5678901-2  ' });

    await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    const [p] = await db.select().from(persons).where(eq(persons.id, e!.personId!));

    expect(p!.sssNumber).toBe('34-5678901-2');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BLACKLIST: name+DOB match (no SSS) → person_id linked
  // ────────────────────────────────────────────────────────────────────────────
  it('blacklist: name+DOB match (no SSS) → person_id set', async () => {
    const db = getDb();

    const empId = await insertEmployee({
      firstName: 'Danilo',
      lastName: 'Ramos',
      dateOfBirth: '1985-03-20',
    });
    const blId = await insertBlacklist({
      firstName: 'Danilo',
      lastName: 'Ramos',
      dateOfBirth: '1985-03-20',
    });

    await runBackfill();

    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    const [bl] = await db.select().from(blacklist).where(eq(blacklist.id, blId));

    expect(e!.personId).toBeTruthy();
    expect(bl!.personId).toBe(e!.personId);
  });
});
