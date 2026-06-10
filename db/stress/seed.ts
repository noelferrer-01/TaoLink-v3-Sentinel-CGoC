/**
 * db/stress/seed.ts — Volume + adversarial seeder for the identity-spine stress test.
 *
 * Fills a THROWAWAY `sentinel_stress` database (post-0024 schema) with a
 * production-shaped, deliberately nasty dataset so we can measure the real
 * search / matcher / gate code paths at 10k+ scale BEFORE building more on top.
 *
 * What "nasty" means here (each is a known production reality or an adversarial
 * worst case for one of the hot paths):
 *   - A Jan-1 DOB cluster — many Filipinos with an unknown birthday are
 *     registered as Jan 1. This is the worst case for the name+DOB matcher,
 *     which loads every same-DOB candidate into JS before filtering by name.
 *   - Duplicate-SSS persons parked in `quarantinedIds` (the backfill's dedup
 *     output) — exercises the un-indexed `quarantined_ids LIKE` lookup path.
 *   - `dela Cruz` / `de la Cruz` / `Dela Cruz` particle variants — exercises
 *     normalizeNameKey-based fuzzy duplicate detection.
 *   - Planted "needle" rows with known values so the adversarial correctness
 *     assertions in run.ts are exact, not probabilistic.
 *
 * This module is pure: it takes a Drizzle client and seeds it. It does NOT
 * import core/db (run.ts owns the DB-target override and passes the client in),
 * which keeps the throwaway-DB tooling unable to perturb the dev/test singleton.
 *
 * Design: paired with db/stress/run.ts. Not a migration, not a fixture — a
 * stand-alone load generator. See db/stress/README.md.
 */

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { persons } from '@/modules/persons/schema';
import { employees } from '@/modules/hr/schema';
import { applicants, blacklist } from '@/modules/recruitment/schema';

// The seeder writes through the live module schemas, so it stays honest to the
// post-0024 shape (employees/applicants have NO identity columns — person_id only).
type Db = PostgresJsDatabase<Record<string, unknown>>;

// ─── Deterministic PRNG ─────────────────────────────────────────────────────
// A seeded generator (not Math.random) so every run produces the same dataset —
// stable needle placement, reproducible timings, comparable runs.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Name pools (Filipino, with the particle surnames that stress normalize) ──

const FIRST_NAMES = [
  'Juan', 'Jose', 'Maria', 'Antonio', 'Ramon', 'Carlos', 'Eduardo', 'Manuel',
  'Roberto', 'Ricardo', 'Andres', 'Felipe', 'Ignacio', 'Lorenzo', 'Marco',
  'Ana', 'Rosa', 'Carmen', 'Teresa', 'Luz', 'Cristina', 'Elena', 'Gloria',
  'Angelica', 'Bea', 'Divina', 'Imelda', 'Jasmin', 'Katrina', 'Liza',
  'Nestor', 'Oscar', 'Pablo', 'Rodrigo', 'Salvador', 'Tomas', 'Vicente',
];

const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza',
  'Torres', 'Tomas', 'Andrada', 'Castillo', 'Flores', 'Villanueva', 'Ramos',
  'Aquino', 'Domingo', 'Gonzales', 'Rivera', 'Aguilar', 'Pascual', 'Salazar',
  // particle surnames — these collapse under normalizeNameKey
  'dela Cruz', 'de la Cruz', 'Dela Cruz', 'del Rosario', 'de los Santos',
];

const PROVINCES = ['Metro Manila', 'Cavite', 'Laguna', 'Bulacan', 'Pampanga', 'Cebu', 'Davao'];
const CITIES = ['Quezon City', 'Makati', 'Caloocan', 'Pasig', 'Taguig', 'Bacoor', 'Santa Rosa'];

// ─── Config / distribution knobs ──────────────────────────────────────────────

export type SeedOptions = {
  /** Total distinct persons to create. Roles are carved out of this pool. */
  persons: number;
  /** PRNG seed for reproducibility. */
  seed?: number;
};

// ─── Needles — known values the correctness assertions key on ─────────────────

export type SeedNeedles = {
  /** A surname guaranteed to appear many times — drives search latency tests. */
  searchSurname: string;
  /** The hot date the big cluster shares (PH "unknown birthday" → Jan 1). */
  hotDob: string;
  /** Cluster size actually planted on hotDob. */
  hotDobClusterSize: number;
  /** A uniquely-named person planted INSIDE the hot cluster — findPossibleDuplicates
   *  for this name must return ~1 despite hundreds sharing the DOB. */
  hotDobUniqueName: { firstName: string; lastName: string; dateOfBirth: string };

  activeEmp: { personId: string; firstName: string; lastName: string; sss: string };
  terminatedEmp: { personId: string; firstName: string; lastName: string; sss: string };
  concurrentApplicant: { applicantId: string; personId: string; firstName: string; lastName: string; sss: string };
  anchoredApplicant: { applicantId: string; personId: string };
  provisionalApplicant: { applicantId: string; personId: string };

  blacklistByPersonId: { personId: string; firstName: string; lastName: string };
  blacklistBySssSnapshot: { sss: string; firstName: string; lastName: string; dateOfBirth: string };

  quarantined: { personId: string; sss: string };
  fuzzyPair: { firstName: string; lastName: string; dateOfBirth: string };

  anchoredPersonId: string;
  provisionalPersonId: string;
};

export type SeedResult = {
  counts: { persons: number; employees: number; applicants: number; blacklist: number };
  needles: SeedNeedles;
};

// Reserved DOBs kept OUT of the random pool so needle assertions are unambiguous.
const FUZZY_DOB = '1977-07-07';
const HOT_DOB = '1990-01-01';

const ACTIVE_STATUSES = ['hired', 'deployed', 'reliever', 'floating', 'on_leave'] as const;
const INFLIGHT_STAGES = ['applied', 'contacted', 'documents'] as const;
const TERMINAL_STAGES = ['hired', 'rejected', 'withdrawn'] as const;
const EMPLOYMENT_TYPES = ['GUARD', 'OFFICE_STAFF', 'SUPERVISOR', 'DRIVER', 'JANITOR', 'OTHER'] as const;
const SOURCES = ['walk_in', 'referral', 'agency', 'job_board', 'social_media', 'provincial', 'training_school', 'other'] as const;

const CHUNK = 1000;

// Row accumulators (built fully in memory, then bulk-inserted in chunks).
type PersonRow = typeof persons.$inferInsert;
type EmployeeRow = typeof employees.$inferInsert;
type ApplicantRow = typeof applicants.$inferInsert;
type BlacklistRow = typeof blacklist.$inferInsert;

/**
 * Seeds the throwaway DB. Returns counts + the planted needles.
 * Assumes the schema is already migrated and the tables are empty.
 */
export async function seedStress(db: Db, opts: SeedOptions): Promise<SeedResult> {
  const total = Math.max(opts.persons, 500);
  const rng = mulberry32(opts.seed ?? 0x5e_57_7e_57);

  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const chance = (p: number): boolean => rng() < p;
  // Unique 10-digit SSS generator — sequential so it never collides with itself.
  let sssCounter = 1_000_000_00; // 9 digits; we prefix to 10
  const nextSss = (): string => String(1_000_000_000 + sssCounter++);

  const personRows: PersonRow[] = [];
  const employeeRows: EmployeeRow[] = [];
  const applicantRows: ApplicantRow[] = [];
  const blacklistRows: BlacklistRow[] = [];

  let empCodeSeq = 0;
  const nextEmpCode = (): string => `CG-${String(++empCodeSeq).padStart(6, '0')}`;

  // Random DOB in the working-age range, avoiding the reserved needle dates.
  const randomDob = (): string => {
    for (;;) {
      const year = 1960 + Math.floor(rng() * 46); // 1960–2005
      const month = 1 + Math.floor(rng() * 12);
      const day = 1 + Math.floor(rng() * 28);
      const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (d !== FUZZY_DOB && !(month === 1 && day === 1)) return d; // keep Jan-1 for the deliberate cluster
    }
  };

  const makePerson = (over: Partial<PersonRow> = {}): PersonRow => {
    const id = over.id ?? randomUUID();
    return {
      id,
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      dateOfBirth: randomDob(),
      sex: chance(0.5) ? 'male' : 'female',
      province: pick(PROVINCES),
      city: pick(CITIES),
      addressLine1: `${1 + Math.floor(rng() * 999)} Rizal St`,
      phone: `09${Math.floor(rng() * 1_000_000_000).toString().padStart(9, '0')}`,
      anchorIdType: 'none',
      ...over,
    };
  };

  // Helper: create an SSS-anchored person.
  const anchoredPerson = (over: Partial<PersonRow> = {}): PersonRow =>
    makePerson({ sssNumber: nextSss(), anchorIdType: 'sss', ...over });

  // ── 1. The bulk population ──────────────────────────────────────────────────
  // Split: ~70% become employees, ~25% applicants, ~5% are persons with no role
  // yet (still valid — provisional intake that hasn't been turned into a role).
  // Within employees: ~15% terminated. Within applicants: ~55% in-flight.

  const N_EMP = Math.floor(total * 0.7);
  const N_APP = Math.floor(total * 0.25);
  // remainder → roleless persons

  for (let i = 0; i < total; i++) {
    const isProvisional = chance(0.1); // 10% have no anchor ID (anchorIdType 'none')
    const onHotDob = chance(0.06); // ~6% land on the Jan-1 hot cluster
    const p = isProvisional
      ? makePerson(onHotDob ? { dateOfBirth: HOT_DOB } : {})
      : anchoredPerson(onHotDob ? { dateOfBirth: HOT_DOB } : {});
    personRows.push(p);

    if (i < N_EMP) {
      const terminated = chance(0.15);
      employeeRows.push({
        employeeCode: nextEmpCode(),
        basicSalary: '610.00',
        payFrequency: chance(0.5) ? 'SEMI_MONTHLY' : 'MONTHLY',
        employmentType: pick(EMPLOYMENT_TYPES),
        status: terminated ? 'terminated' : pick(ACTIVE_STATUSES),
        hiredOn: `${2018 + Math.floor(rng() * 7)}-0${1 + Math.floor(rng() * 9)}-15`,
        terminatedOn: terminated ? '2025-01-15' : null,
        personId: p.id!,
        isArmedPost: chance(0.5),
      });
    } else if (i < N_EMP + N_APP) {
      const inflight = chance(0.55);
      const stage = inflight ? pick(INFLIGHT_STAGES) : pick(TERMINAL_STAGES);
      applicantRows.push({
        source: pick(SOURCES),
        positionAppliedFor: pick(EMPLOYMENT_TYPES),
        isArmedPost: chance(0.4),
        pipelineStage: stage,
        appliedOn: `${2024 + Math.floor(rng() * 2)}-0${1 + Math.floor(rng() * 9)}-10`,
        personId: p.id!,
        idPending: p.anchorIdType === 'none',
      });
    }
  }

  const hotDobClusterSize = personRows.filter((p) => p.dateOfBirth === HOT_DOB).length;

  // ── 2. Quarantined-SSS persons (duplicate-SSS backfill output) ───────────────
  // Person A holds the anchor SSS; person Q holds the SAME value in quarantinedIds
  // with their own sssNumber NULL. findPersonByAnyId('sss', value) must surface Q.
  const QUARANTINE_PAIRS = 60;
  for (let i = 0; i < QUARANTINE_PAIRS; i++) {
    const dupSss = nextSss();
    const anchor = anchoredPerson({ sssNumber: dupSss });
    const quar = makePerson({ sssNumber: null, anchorIdType: 'none', quarantinedIds: `sss:${dupSss}`, suspectedDuplicateOf: anchor.id });
    personRows.push(anchor, quar);
  }
  // Isolated quarantine needle: a value preserved ONLY in quarantinedIds, with NO
  // competing anchor holding it in sss_number. findPersonByAnyId must surface THIS
  // person via the line-anchored LIKE branch alone — proving the quarantine path
  // in isolation (the collision pairs above would otherwise return the anchor).
  const isolatedQuarSss = nextSss();
  const quarOnly = makePerson({ sssNumber: null, anchorIdType: 'none', quarantinedIds: `sss:${isolatedQuarSss}` });
  personRows.push(quarOnly);
  const quarantinedNeedle: SeedNeedles['quarantined'] = { personId: quarOnly.id!, sss: isolatedQuarSss };

  // ── 3. Fuzzy particle-variant pair (same person, two spellings) ──────────────
  const fuzzyA = makePerson({ firstName: 'Juan', lastName: 'dela Cruz', dateOfBirth: FUZZY_DOB, sssNumber: nextSss(), anchorIdType: 'sss' });
  const fuzzyB = makePerson({ firstName: 'Juan', lastName: 'de la Cruz', dateOfBirth: FUZZY_DOB, sssNumber: nextSss(), anchorIdType: 'sss' });
  personRows.push(fuzzyA, fuzzyB);
  // fuzzyB carries an in-flight applicant so the matcher's fuzzy backstop has a
  // role to surface (checkMatches only emits a match for a fuzzy person who has
  // an employee or in-flight applicant role).
  applicantRows.push({
    source: 'walk_in', positionAppliedFor: 'GUARD', isArmedPost: false,
    pipelineStage: 'documents', appliedOn: '2025-01-20', personId: fuzzyB.id!, idPending: false,
  });

  // ── 4. A uniquely-named person planted IN the hot cluster ────────────────────
  // Hundreds share HOT_DOB; this one's name is unique, so findPossibleDuplicates
  // must return ~1 for it — proving DOB clustering does not false-flag.
  const hotUnique = anchoredPerson({ firstName: 'Zacarias', lastName: 'Uytengsu', dateOfBirth: HOT_DOB });
  personRows.push(hotUnique);

  // ── 5. Explicit needle role rows ─────────────────────────────────────────────
  // Active employee (possible double-hire on re-application).
  const activeEmpPerson = anchoredPerson({ firstName: 'Bonifacio', lastName: 'Magsaysay' });
  personRows.push(activeEmpPerson);
  employeeRows.push({
    employeeCode: nextEmpCode(), basicSalary: '700.00', payFrequency: 'SEMI_MONTHLY',
    employmentType: 'GUARD', status: 'deployed', hiredOn: '2022-03-01',
    personId: activeEmpPerson.id!, isArmedPost: true,
  });

  // Terminated employee.
  const terminatedEmpPerson = anchoredPerson({ firstName: 'Gregorio', lastName: 'Aglipay' });
  personRows.push(terminatedEmpPerson);
  employeeRows.push({
    employeeCode: nextEmpCode(), basicSalary: '650.00', payFrequency: 'SEMI_MONTHLY',
    employmentType: 'GUARD', status: 'terminated', hiredOn: '2020-05-01', terminatedOn: '2024-09-30',
    personId: terminatedEmpPerson.id!, isArmedPost: false,
  });

  // Concurrent (in-flight) applicant.
  const concurrentPerson = anchoredPerson({ firstName: 'Apolinario', lastName: 'Mabini' });
  personRows.push(concurrentPerson);
  const concurrentApplicantId = randomUUID();
  applicantRows.push({
    id: concurrentApplicantId, source: 'walk_in', positionAppliedFor: 'GUARD', isArmedPost: false,
    pipelineStage: 'documents', appliedOn: '2025-02-01', personId: concurrentPerson.id!, idPending: false,
  });

  // Anchored in-flight applicant (advanceStage → idPending false; assertAnchored resolves).
  const anchoredAppPerson = anchoredPerson({ firstName: 'Melchora', lastName: 'Aquino' });
  personRows.push(anchoredAppPerson);
  const anchoredApplicantId = randomUUID();
  applicantRows.push({
    id: anchoredApplicantId, source: 'referral', positionAppliedFor: 'GUARD', isArmedPost: false,
    pipelineStage: 'contacted', appliedOn: '2025-03-01', personId: anchoredAppPerson.id!, idPending: false,
  });

  // Provisional in-flight applicant (advanceStage → idPending true; assertAnchored throws).
  const provisionalAppPerson = makePerson({ firstName: 'Diego', lastName: 'Silang', anchorIdType: 'none', sssNumber: null });
  personRows.push(provisionalAppPerson);
  const provisionalApplicantId = randomUUID();
  applicantRows.push({
    id: provisionalApplicantId, source: 'walk_in', positionAppliedFor: 'GUARD', isArmedPost: false,
    pipelineStage: 'applied', appliedOn: '2025-04-01', personId: provisionalAppPerson.id!, idPending: true,
  });

  // ── 6. Blacklist needles ─────────────────────────────────────────────────────
  // (a) linked by personId.
  const blacklistedPerson = anchoredPerson({ firstName: 'Andres', lastName: 'Novales' });
  personRows.push(blacklistedPerson);
  blacklistRows.push({
    firstName: blacklistedPerson.firstName!, lastName: blacklistedPerson.lastName!,
    dateOfBirth: blacklistedPerson.dateOfBirth ?? null, sssNumber: blacklistedPerson.sssNumber ?? null,
    reason: 'Theft of company property', active: true, personId: blacklistedPerson.id!,
  });
  // (b) snapshot-only: blacklist row carries an SSS that equals an anchored person's
  //     SSS, but personId is NULL — the matcher must still flag via the snapshot.
  const snapshotSss = nextSss();
  const snapshotPerson = anchoredPerson({ firstName: 'Crisostomo', lastName: 'Ibarra', sssNumber: snapshotSss });
  personRows.push(snapshotPerson);
  blacklistRows.push({
    firstName: 'Crisostomo', lastName: 'Ibarra', dateOfBirth: snapshotPerson.dateOfBirth ?? null,
    sssNumber: snapshotSss, reason: 'AWOL — abandoned post', active: true, personId: null,
  });

  // Plus some bulk blacklist noise linked to random terminated-employee persons.
  const BL_NOISE = 350;
  for (let i = 0; i < BL_NOISE; i++) {
    const p = makePerson();
    personRows.push(p);
    blacklistRows.push({
      firstName: p.firstName!, lastName: p.lastName!, dateOfBirth: p.dateOfBirth ?? null,
      sssNumber: null, reason: 'Disciplinary', active: chance(0.8), personId: chance(0.5) ? p.id! : null,
    });
  }

  // ── 7. Bulk insert (chunked) ─────────────────────────────────────────────────
  await insertChunked(db, persons, personRows);
  await insertChunked(db, employees, employeeRows);
  await insertChunked(db, applicants, applicantRows);
  await insertChunked(db, blacklist, blacklistRows);

  // ── 8. ANALYZE so the planner has real stats (EXPLAIN is meaningless without). ─
  await db.execute(sql`ANALYZE`);

  return {
    counts: {
      persons: personRows.length,
      employees: employeeRows.length,
      applicants: applicantRows.length,
      blacklist: blacklistRows.length,
    },
    needles: {
      searchSurname: 'Santos',
      hotDob: HOT_DOB,
      hotDobClusterSize,
      hotDobUniqueName: { firstName: 'Zacarias', lastName: 'Uytengsu', dateOfBirth: HOT_DOB },
      activeEmp: { personId: activeEmpPerson.id!, firstName: 'Bonifacio', lastName: 'Magsaysay', sss: activeEmpPerson.sssNumber! },
      terminatedEmp: { personId: terminatedEmpPerson.id!, firstName: 'Gregorio', lastName: 'Aglipay', sss: terminatedEmpPerson.sssNumber! },
      concurrentApplicant: { applicantId: concurrentApplicantId, personId: concurrentPerson.id!, firstName: 'Apolinario', lastName: 'Mabini', sss: concurrentPerson.sssNumber! },
      anchoredApplicant: { applicantId: anchoredApplicantId, personId: anchoredAppPerson.id! },
      provisionalApplicant: { applicantId: provisionalApplicantId, personId: provisionalAppPerson.id! },
      blacklistByPersonId: { personId: blacklistedPerson.id!, firstName: 'Andres', lastName: 'Novales' },
      blacklistBySssSnapshot: { sss: snapshotSss, firstName: 'Crisostomo', lastName: 'Ibarra', dateOfBirth: snapshotPerson.dateOfBirth! },
      quarantined: quarantinedNeedle!,
      fuzzyPair: { firstName: 'Juan', lastName: 'dela Cruz', dateOfBirth: FUZZY_DOB },
      anchoredPersonId: anchoredAppPerson.id!,
      provisionalPersonId: provisionalAppPerson.id!,
    },
  };
}

// ─── chunked bulk insert ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertChunked(db: Db, table: any, rows: any[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(table).values(rows.slice(i, i + CHUNK));
  }
}
