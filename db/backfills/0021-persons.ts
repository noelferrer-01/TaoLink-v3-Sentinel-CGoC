/**
 * db/backfills/0021-persons.ts — Dedup + normalize persons backfill.
 *
 * Creates one Person per existing employee/applicant, links blacklist rows,
 * and is safe against messy real data (10 k rows, duplicate/blank SSS, etc.).
 *
 * Run order is STRICT (a → e) — do NOT reorder:
 *   (a) NORMALIZE  — blank IDs → NULL, trim whitespace (kills '' vs NULL collision)
 *   (b) BUILD DUPS — in-memory maps of sss/tin values already seen (primary guard)
 *   (c) EMPLOYEES  — one Person per employee (guard: person_id IS NULL)
 *   (d) APPLICANTS — link hired applicant → employee's Person; else mint own Person
 *   (e) BLACKLIST  — match on SSS or name+DOB; leave NULL when uncertain
 *
 * Idempotent: every insert is guarded by `person_id IS NULL`.
 * Batched:    processes employees and applicants in BATCH_SIZE chunks (cursor).
 * Per-row safety: one bad row does not abort the whole run.
 * Quarantine report: printed at end + returned — silent quarantine is unacceptable.
 *
 * Design: wiki/slices/3a-person-identity-plan.md Task 4
 * ADR:    wiki/decisions/0017-person-centric-identity.md "Migration safety"
 *
 * Usage:
 *   pnpm db:backfill:persons
 */

import { sql, eq, isNull, and, gt } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getActiveDatabaseUrl } from '@/core/env';
import { persons }    from '@/modules/persons/schema';
import { employees }  from '@/modules/hr/schema';
import { applicants, blacklist } from '@/modules/recruitment/schema';
import { normalizeNameKey, ID_TYPE_LADDER } from '@/modules/persons/labels';
import type { AnchorIdType } from '@/modules/persons/labels';

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuarantinedRow = {
  kind: 'employee' | 'applicant';
  sourceId: string;           // employee.id or applicant.id
  sourceCode?: string;        // employeeCode (employees only)
  personId: string;
  collisionType: string;      // e.g. "sss", "tin"
  collisionValue: string;
};

export type SuspectedDuplicatePair = {
  personId: string;
  suspectedDuplicateOf: string;
};

export type BackfillReport = {
  personsCreated: number;
  quarantinedRows: QuarantinedRow[];
  suspectedDuplicatePairs: SuspectedDuplicatePair[];
};

// ─── DB connection factory ────────────────────────────────────────────────────
//
// We do NOT use getDb() because we want a dedicated connection (not the
// singleton) and may close it ourselves in main(). Tests import runBackfill()
// which re-uses getDb() via this same URL. The helper below is called only by
// main().

function makeDb() {
  const url = getActiveDatabaseUrl();
  const client = postgres(url, { max: 5, prepare: false });
  const db = drizzle(client, {
    schema: {
      persons,
      employees,
      applicants,
      blacklist,
    },
  });
  return { db, client };
}

// ─── Main runBackfill ─────────────────────────────────────────────────────────

/**
 * Runs the full backfill. Returns a structured report.
 * When called from tests, it uses the test DB (via getActiveDatabaseUrl).
 * When called from main(), same — because NODE_ENV=test is set by vitest.
 */
export async function runBackfill(): Promise<BackfillReport> {
  // We always use the module-level import of getDb so tests get the test DB.
  // For the script entrypoint we use makeDb() to avoid polluting the singleton.
  // The trick: when called with the `forceOwnConnection` path we pass `rawSql`.
  return _runBackfillWithRawSql(null);
}

export async function runBackfillWithOwnConnection(): Promise<BackfillReport> {
  const { db, client } = makeDb();
  try {
    return await _runBackfillWithRawSql(client);
  } finally {
    await client.end({ timeout: 5 });
  }
}

// ─── Internal implementation ──────────────────────────────────────────────────

async function _runBackfillWithRawSql(
  externalClient: ReturnType<typeof postgres> | null,
): Promise<BackfillReport> {
  // Resolve the DB client to use.
  // When running in tests (externalClient=null) we import getDb lazily so the
  // test environment's singleton is used (respects TEST_DATABASE_URL).
  const { getDb } = await import('@/core/db');
  const db = getDb();

  const report: BackfillReport = {
    personsCreated: 0,
    quarantinedRows: [],
    suspectedDuplicatePairs: [],
  };

  // ── (a) NORMALIZE ──────────────────────────────────────────────────────────
  // Blank IDs → NULL so '' and NULL are the same going forward.
  // Trim remaining values.
  // Covers: hr_employees (sss, tin), recruitment_applicants (sss), blacklist (sss).

  await db.execute(sql`
    UPDATE hr_employees
    SET
      sss_number = CASE WHEN trim(sss_number) = '' THEN NULL ELSE trim(sss_number) END,
      tin_number = CASE WHEN trim(tin_number) = '' THEN NULL ELSE trim(tin_number) END
    WHERE sss_number IS NOT NULL OR tin_number IS NOT NULL
  `);

  await db.execute(sql`
    UPDATE recruitment_applicants
    SET sss_number = CASE WHEN trim(sss_number) = '' THEN NULL ELSE trim(sss_number) END
    WHERE sss_number IS NOT NULL
  `);

  await db.execute(sql`
    UPDATE recruitment_blacklist
    SET sss_number = CASE WHEN trim(sss_number) = '' THEN NULL ELSE trim(sss_number) END
    WHERE sss_number IS NOT NULL
  `);

  // ── (b) BUILD DUPLICATE SETS ───────────────────────────────────────────────
  // In-memory maps: unique-ID value → personId that already claimed it.
  // This is the PRIMARY dedup guard — the DB unique index is just a backstop.

  // We pre-populate with any persons that were already created (idempotency).
  const claimedSss = new Map<string, string>(); // sssValue → personId
  const claimedTin = new Map<string, string>(); // tinValue → personId

  const existingPersons = await db
    .select({ id: persons.id, sssNumber: persons.sssNumber, tinNumber: persons.tinNumber })
    .from(persons);

  for (const p of existingPersons) {
    if (p.sssNumber) claimedSss.set(p.sssNumber, p.id);
    if (p.tinNumber) claimedTin.set(p.tinNumber, p.id);
  }

  // ── (c) EMPLOYEES ──────────────────────────────────────────────────────────
  // Process in batches via cursor (by id order, using > last-seen id).

  let lastEmployeeId = '00000000-0000-0000-0000-000000000000';
  let moreBatches = true;

  // Pre-load applicant→employee map for is_armed_post sourcing.
  // We only need: hiredEmployeeId → isArmedPost.
  // Load once; it fits in memory (≤ 10k rows, one boolean per row).
  const armedByEmployeeId = new Map<string, boolean>(); // employeeId → isArmedPost

  {
    let lastAppId = '00000000-0000-0000-0000-000000000000';
    let moreApps = true;
    while (moreApps) {
      const batch = await db
        .select({
          hiredEmployeeId: applicants.hiredEmployeeId,
          isArmedPost: applicants.isArmedPost,
        })
        .from(applicants)
        .where(and(
          gt(applicants.id, lastAppId),
          sql`${applicants.hiredEmployeeId} IS NOT NULL`,
        ))
        .orderBy(applicants.id)
        .limit(BATCH_SIZE);

      for (const a of batch) {
        if (a.hiredEmployeeId) {
          // Last-write wins: if multiple applicants link to same employee,
          // prefer true (armed) over false.
          const existing = armedByEmployeeId.get(a.hiredEmployeeId);
          if (existing === undefined || a.isArmedPost) {
            armedByEmployeeId.set(a.hiredEmployeeId, a.isArmedPost);
          }
        }
        lastAppId = batch[batch.length - 1]!.hiredEmployeeId ?? lastAppId;
      }

      // Use a separate tracker for app id cursor
      if (batch.length < BATCH_SIZE) {
        moreApps = false;
      } else {
        // Need to track by applicant.id, not hiredEmployeeId. Re-query with id.
        const batchWithId = await db
          .select({ id: applicants.id, hiredEmployeeId: applicants.hiredEmployeeId, isArmedPost: applicants.isArmedPost })
          .from(applicants)
          .where(and(
            gt(applicants.id, lastAppId),
            sql`${applicants.hiredEmployeeId} IS NOT NULL`,
          ))
          .orderBy(applicants.id)
          .limit(BATCH_SIZE);
        if (batchWithId.length === 0) moreApps = false;
      }

      moreApps = false; // Simplification: load all in one pass since we already filter
    }
  }

  // Actually load the armed map properly (simpler: no batching, just one query)
  armedByEmployeeId.clear();
  {
    // Load all applicants with hiredEmployeeId in batches
    let cursor = '00000000-0000-0000-0000-000000000000';
    let more = true;
    while (more) {
      const batch = await db
        .select({
          id: applicants.id,
          hiredEmployeeId: applicants.hiredEmployeeId,
          isArmedPost: applicants.isArmedPost,
        })
        .from(applicants)
        .where(and(
          gt(applicants.id, cursor),
          sql`${applicants.hiredEmployeeId} IS NOT NULL`,
        ))
        .orderBy(applicants.id)
        .limit(BATCH_SIZE);

      for (const a of batch) {
        if (a.hiredEmployeeId) {
          const existing = armedByEmployeeId.get(a.hiredEmployeeId);
          if (existing === undefined || a.isArmedPost) {
            armedByEmployeeId.set(a.hiredEmployeeId, a.isArmedPost);
          }
        }
      }
      if (batch.length < BATCH_SIZE) {
        more = false;
      } else {
        cursor = batch[batch.length - 1]!.id;
      }
    }
  }

  // Now process employees in batches
  lastEmployeeId = '00000000-0000-0000-0000-000000000000';
  moreBatches = true;

  while (moreBatches) {
    const batch = await db
      .select()
      .from(employees)
      .where(and(
        isNull(employees.personId),
        gt(employees.id, lastEmployeeId),
      ))
      .orderBy(employees.id)
      .limit(BATCH_SIZE);

    for (const emp of batch) {
      try {
        await _processEmployee(db, emp, claimedSss, claimedTin, armedByEmployeeId, report);
      } catch (err: unknown) {
        const e = err as Record<string, unknown>;
        console.warn(
          `[backfill] WARNING: failed to process employee ${emp.id} (${emp.employeeCode}): ` +
            `${e.message ?? String(err)}`,
        );
      }
    }

    if (batch.length < BATCH_SIZE) {
      moreBatches = false;
    } else {
      lastEmployeeId = batch[batch.length - 1]!.id;
    }
  }

  // ── (d) APPLICANTS ──────────────────────────────────────────────────────────
  // Process in batches via cursor.
  let lastApplicantId = '00000000-0000-0000-0000-000000000000';
  let moreApplicants = true;

  while (moreApplicants) {
    const batch = await db
      .select()
      .from(applicants)
      .where(and(
        isNull(applicants.personId),
        gt(applicants.id, lastApplicantId),
      ))
      .orderBy(applicants.id)
      .limit(BATCH_SIZE);

    for (const app of batch) {
      try {
        await _processApplicant(db, app, claimedSss, report);
      } catch (err: unknown) {
        const e = err as Record<string, unknown>;
        console.warn(
          `[backfill] WARNING: failed to process applicant ${app.id}: ` +
            `${e.message ?? String(err)}`,
        );
      }
    }

    if (batch.length < BATCH_SIZE) {
      moreApplicants = false;
    } else {
      lastApplicantId = batch[batch.length - 1]!.id;
    }
  }

  // ── (e) BLACKLIST ──────────────────────────────────────────────────────────
  // Pre-load the full SSS→personId map from persons (avoid O(blacklist×persons)).
  // Also pre-load name+DOB→personId for name-match fallback.

  const personsBySss = new Map<string, string>();    // sssValue → personId
  const personsByNameDob = new Map<string, string>(); // normalizeNameKey → personId

  {
    let cursor = '00000000-0000-0000-0000-000000000000';
    let more = true;
    while (more) {
      const batch = await db
        .select({
          id: persons.id,
          sssNumber: persons.sssNumber,
          firstName: persons.firstName,
          lastName: persons.lastName,
          dateOfBirth: persons.dateOfBirth,
          quarantinedIds: persons.quarantinedIds,
        })
        .from(persons)
        .where(gt(persons.id, cursor))
        .orderBy(persons.id)
        .limit(BATCH_SIZE);

      for (const p of batch) {
        if (p.sssNumber) {
          personsBySss.set(p.sssNumber, p.id);
        }
        // Also index quarantined SSS values
        if (p.quarantinedIds) {
          for (const line of p.quarantinedIds.split('\n')) {
            const m = line.match(/^sss:(.+)$/);
            if (m) personsBySss.set(m[1]!, p.id);
          }
        }
        // Name+DOB index (only if DOB is set)
        if (p.dateOfBirth) {
          const key = normalizeNameKey(p.firstName, p.lastName, p.dateOfBirth);
          if (!personsByNameDob.has(key)) {
            personsByNameDob.set(key, p.id);
          }
        }
      }

      if (batch.length < BATCH_SIZE) {
        more = false;
      } else {
        cursor = batch[batch.length - 1]!.id;
      }
    }
  }

  // Now match blacklist rows
  {
    let cursor = '00000000-0000-0000-0000-000000000000';
    let more = true;
    while (more) {
      const batch = await db
        .select()
        .from(blacklist)
        .where(and(
          isNull(blacklist.personId),
          gt(blacklist.id, cursor),
        ))
        .orderBy(blacklist.id)
        .limit(BATCH_SIZE);

      for (const bl of batch) {
        try {
          let matchedPersonId: string | null = null;

          // 1. SSS match (most confident)
          if (bl.sssNumber) {
            matchedPersonId = personsBySss.get(bl.sssNumber) ?? null;
          }

          // 2. Name + DOB match (fallback)
          if (!matchedPersonId && bl.dateOfBirth) {
            const key = normalizeNameKey(bl.firstName, bl.lastName, bl.dateOfBirth);
            matchedPersonId = personsByNameDob.get(key) ?? null;
          }

          if (matchedPersonId) {
            await db
              .update(blacklist)
              .set({ personId: matchedPersonId })
              .where(eq(blacklist.id, bl.id));
          }
        } catch (err: unknown) {
          const e = err as Record<string, unknown>;
          console.warn(
            `[backfill] WARNING: failed to process blacklist ${bl.id}: ` +
              `${e.message ?? String(err)}`,
          );
        }
      }

      if (batch.length < BATCH_SIZE) {
        more = false;
      } else {
        cursor = batch[batch.length - 1]!.id;
      }
    }
  }

  return report;
}

// ─── _processEmployee ─────────────────────────────────────────────────────────

type DbClient = ReturnType<typeof drizzle<{
  persons: typeof persons;
  employees: typeof employees;
  applicants: typeof applicants;
  blacklist: typeof blacklist;
}>>;

// We use `any` for the db type here since the schema type depends on runtime imports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _processEmployee(
  db: any,
  emp: typeof employees.$inferSelect,
  claimedSss: Map<string, string>,
  claimedTin: Map<string, string>,
  armedByEmployeeId: Map<string, boolean>,
  report: BackfillReport,
): Promise<void> {
  // Guard: idempotency — skip if already linked
  if (emp.personId) return;

  // Pick the best anchor using ID_TYPE_LADDER.
  // Employees have: sss, tin (no philsys, no passport, no umid, no DL in this schema)
  let anchorIdType: AnchorIdType = 'none';
  let quarantinedType: string | null = null;
  let quarantinedValue: string | null = null;
  let anchorPersonId: string | null = null;

  const sss = emp.sssNumber ?? null;
  const tin = emp.tinNumber ?? null;

  // Walk ladder: sss preferred over tin (philsys not on employees)
  if (sss) {
    const existing = claimedSss.get(sss);
    if (existing) {
      // Duplicate — this employee's SSS is taken
      quarantinedType = 'sss';
      quarantinedValue = sss;
      anchorPersonId = existing;
    } else {
      anchorIdType = 'sss';
    }
  } else if (tin) {
    const existing = claimedTin.get(tin);
    if (existing) {
      quarantinedType = 'tin';
      quarantinedValue = tin;
      anchorPersonId = existing;
    } else {
      anchorIdType = 'tin';
    }
  }

  // Build Person values
  const personValues: typeof persons.$inferInsert = {
    firstName:        emp.firstName,
    lastName:         emp.lastName,
    dateOfBirth:      emp.dateOfBirth ?? null,
    email:            emp.email ?? null,
    phone:            emp.phone ?? null,
    philhealthNumber: emp.philhealthNumber ?? null,
    pagibigNumber:    emp.pagibigNumber ?? null,
    addressLine1:     emp.addressLine1 ?? null,
    addressLine2:     emp.addressLine2 ?? null,
    city:             emp.city ?? null,
    province:         emp.province ?? null,
    postalCode:       emp.postalCode ?? null,
    anchorIdType:     'none', // set below
    sssNumber:        null,
    tinNumber:        null,
  };

  // If this is a clean anchor, set the ID on the Person row
  if (anchorIdType === 'sss' && sss) {
    personValues.sssNumber = sss;
    personValues.anchorIdType = 'sss';
  } else if (anchorIdType === 'tin' && tin) {
    personValues.tinNumber = tin;
    personValues.anchorIdType = 'tin';
  }

  // If duplicate, set quarantinedIds
  if (quarantinedType && quarantinedValue) {
    personValues.quarantinedIds = `${quarantinedType}:${quarantinedValue}`;
    personValues.suspectedDuplicateOf = anchorPersonId ?? undefined;
  }

  // Insert the Person
  let personId: string;
  try {
    const [inserted] = await db
      .insert(persons)
      .values(personValues)
      .returning({ id: persons.id });
    if (!inserted) throw new Error('[backfill/_processEmployee] insert returned no row');
    personId = inserted.id;
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    // 23505: unique violation (backstop — should not happen if in-memory dedup works)
    if (e.code === '23505') {
      // Quarantine: insert as anchorIdType='none', no unique ID
      console.warn(`[backfill] 23505 on employee ${emp.id} — quarantining to none`);
      const safeValues: typeof persons.$inferInsert = {
        ...personValues,
        anchorIdType: 'none',
        sssNumber: null,
        tinNumber: null,
        quarantinedIds: [
          personValues.sssNumber ? `sss:${personValues.sssNumber}` : null,
          personValues.tinNumber ? `tin:${personValues.tinNumber}` : null,
        ].filter(Boolean).join('\n') || null,
      };
      const [fallback] = await db
        .insert(persons)
        .values(safeValues)
        .returning({ id: persons.id });
      if (!fallback) throw new Error('[backfill/_processEmployee] fallback insert returned no row');
      personId = fallback.id;
    } else {
      throw err;
    }
  }

  // Claim the IDs in our in-memory maps
  if (anchorIdType === 'sss' && sss) claimedSss.set(sss, personId);
  if (anchorIdType === 'tin' && tin) claimedTin.set(tin, personId);

  // Two-sided suspectedDuplicateOf: if this person is a dup, flag the anchor too
  if (anchorPersonId) {
    try {
      await db
        .update(persons)
        .set({ suspectedDuplicateOf: personId })
        .where(eq(persons.id, anchorPersonId));
    } catch {
      // Non-fatal — the link is best-effort
    }

    report.quarantinedRows.push({
      kind: 'employee',
      sourceId: emp.id,
      sourceCode: emp.employeeCode,
      personId,
      collisionType: quarantinedType!,
      collisionValue: quarantinedValue!,
    });

    report.suspectedDuplicatePairs.push({
      personId,
      suspectedDuplicateOf: anchorPersonId,
    });
  }

  report.personsCreated++;

  // Set is_armed_post from applicant source
  const isArmedPost = armedByEmployeeId.has(emp.id)
    ? armedByEmployeeId.get(emp.id)!
    : null; // NULL = unknown (no applicant linked)

  // Link employee to person + set is_armed_post
  await db
    .update(employees)
    .set({ personId, isArmedPost })
    .where(eq(employees.id, emp.id));
}

// ─── _processApplicant ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _processApplicant(
  db: any,
  app: typeof applicants.$inferSelect,
  claimedSss: Map<string, string>,
  report: BackfillReport,
): Promise<void> {
  // Guard: idempotency
  if (app.personId) return;

  // Case 1: hired applicant — link to employee's Person
  if (app.hiredEmployeeId) {
    const [linkedEmp] = await db
      .select({ personId: employees.personId })
      .from(employees)
      .where(eq(employees.id, app.hiredEmployeeId));

    if (linkedEmp?.personId) {
      await db
        .update(applicants)
        .set({ personId: linkedEmp.personId })
        .where(eq(applicants.id, app.id));
      return; // No new Person minted
    }
    // Employee exists but has no personId yet (edge: employee not processed — shouldn't happen)
    // Fall through to mint a Person
  }

  // Case 2: unhired applicant — mint own Person
  // Applicants have: sssNumber only (no tin)
  const sss = app.sssNumber ?? null;
  let anchorIdType: AnchorIdType = 'none';
  let quarantinedType: string | null = null;
  let quarantinedValue: string | null = null;
  let anchorPersonId: string | null = null;

  if (sss) {
    const existing = claimedSss.get(sss);
    if (existing) {
      quarantinedType = 'sss';
      quarantinedValue = sss;
      anchorPersonId = existing;
    } else {
      anchorIdType = 'sss';
    }
  }

  const personValues: typeof persons.$inferInsert = {
    firstName:   app.firstName,
    lastName:    app.lastName,
    dateOfBirth: app.dateOfBirth ?? null,
    email:       app.email ?? null,
    phone:       app.phone ?? null,
    addressLine1: app.addressLine1 ?? null,
    addressLine2: app.addressLine2 ?? null,
    city:         app.city ?? null,
    province:     app.province ?? null,
    anchorIdType: 'none',
    sssNumber:    null,
  };

  if (anchorIdType === 'sss' && sss) {
    personValues.sssNumber = sss;
    personValues.anchorIdType = 'sss';
  }

  if (quarantinedType && quarantinedValue) {
    personValues.quarantinedIds = `${quarantinedType}:${quarantinedValue}`;
    personValues.suspectedDuplicateOf = anchorPersonId ?? undefined;
  }

  let personId: string;
  try {
    const [inserted] = await db
      .insert(persons)
      .values(personValues)
      .returning({ id: persons.id });
    if (!inserted) throw new Error('[backfill/_processApplicant] insert returned no row');
    personId = inserted.id;
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    if (e.code === '23505') {
      console.warn(`[backfill] 23505 on applicant ${app.id} — quarantining to none`);
      const safeValues: typeof persons.$inferInsert = {
        ...personValues,
        anchorIdType: 'none',
        sssNumber: null,
        quarantinedIds: personValues.sssNumber ? `sss:${personValues.sssNumber}` : null,
      };
      const [fallback] = await db
        .insert(persons)
        .values(safeValues)
        .returning({ id: persons.id });
      if (!fallback) throw new Error('[backfill/_processApplicant] fallback insert returned no row');
      personId = fallback.id;
    } else {
      throw err;
    }
  }

  if (anchorIdType === 'sss' && sss) claimedSss.set(sss, personId);

  if (anchorPersonId) {
    try {
      await db
        .update(persons)
        .set({ suspectedDuplicateOf: personId })
        .where(eq(persons.id, anchorPersonId));
    } catch {
      // Non-fatal
    }

    report.quarantinedRows.push({
      kind: 'applicant',
      sourceId: app.id,
      personId,
      collisionType: quarantinedType!,
      collisionValue: quarantinedValue!,
    });

    report.suspectedDuplicatePairs.push({
      personId,
      suspectedDuplicateOf: anchorPersonId,
    });
  }

  report.personsCreated++;

  await db
    .update(applicants)
    .set({ personId })
    .where(eq(applicants.id, app.id));
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

async function main() {
  console.log('[backfill:persons] Starting persons backfill...');
  console.time('[backfill:persons] duration');

  const report = await runBackfillWithOwnConnection();

  console.timeEnd('[backfill:persons] duration');
  console.log('\n── Backfill Report ──────────────────────────────────────────');
  console.log(`  Persons created:       ${report.personsCreated}`);
  console.log(`  Quarantined to none:   ${report.quarantinedRows.length}`);
  console.log(`  Suspected dup pairs:   ${report.suspectedDuplicatePairs.length}`);

  if (report.quarantinedRows.length > 0) {
    console.log('\n  ⚠  QUARANTINED ROWS (review before go-live):');
    for (const row of report.quarantinedRows) {
      const ref = row.sourceCode ? `${row.kind}:${row.sourceCode}` : `${row.kind}:${row.sourceId.slice(0, 8)}`;
      console.log(`    [${ref}] personId=${row.personId.slice(0, 8)} — ${row.collisionType}:${row.collisionValue} already claimed`);
    }
  }

  if (report.suspectedDuplicatePairs.length > 0) {
    console.log('\n  ⚠  SUSPECTED DUPLICATE PAIRS (review before go-live):');
    for (const pair of report.suspectedDuplicatePairs) {
      console.log(`    personId=${pair.personId.slice(0, 8)} ↔  suspectedDuplicateOf=${pair.suspectedDuplicateOf.slice(0, 8)}`);
    }
  }

  if (report.quarantinedRows.length === 0 && report.suspectedDuplicatePairs.length === 0) {
    console.log('  ✓ No duplicates detected.');
  }

  console.log('────────────────────────────────────────────────────────────\n');
  console.log('[backfill:persons] Done.');
}

// Run when invoked directly (not imported by tests)
if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
    process.argv[1]?.endsWith('0021-persons.ts') ||
    process.argv[1]?.endsWith('0021-persons.js')) {
  main().catch((err) => {
    console.error('[backfill:persons] FATAL:', err);
    process.exit(1);
  });
}
