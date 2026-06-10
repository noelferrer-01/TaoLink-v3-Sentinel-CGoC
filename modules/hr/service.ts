import { eq, and, desc, sql, count } from 'drizzle-orm';
import Papa from 'papaparse';
import { z } from 'zod';
import { getDb, type DbOrTx } from '@/core/db';
import { isWithinUndoWindow } from '@/core/time';
import { employees, type Employee, type NewEmployee } from './schema';
import { persons, type Person, createPerson, ID_TYPE_LADDER } from '@/modules/persons';
import { auditLog } from '@/modules/audit/schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { ALLOWED_TRANSITIONS, type Status } from './labels';

// Drizzle types `numeric` columns as `string`, but callers reasonably pass numbers.
// We widen basicSalary to accept both and stringify before insert.
type CreateEmployeeInput = Omit<NewEmployee, 'id' | 'createdAt' | 'updatedAt' | 'basicSalary'> & {
  basicSalary: number | string;
  actorUserId?: string | null;
};

/**
 * Derives the best anchorIdType for a new Person from the available ID fields,
 * following the ID_TYPE_LADDER preference. Employees have no philsys input today,
 * so philsys is skipped. Returns 'none' if no ID is present.
 */
function deriveAnchorIdType(input: {
  sssNumber?: string | null;
  tinNumber?: string | null;
  philhealthNumber?: string | null;
  pagibigNumber?: string | null;
}): typeof ID_TYPE_LADDER[number] | 'none' {
  // Only sss and tin are unique anchor IDs for employees (no philsys input today).
  if (input.sssNumber) return 'sss';
  if (input.tinNumber) return 'tin';
  return 'none';
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const db = getDb();
  const { actorUserId, ...row } = input;

  // ── T7 transitional dual-write: create or link a Person ──────────────────
  // If a personId is passed, link it (no new Person minted — used by hireApplicant
  // to share the applicant's existing Person). Otherwise, mint one from the
  // identity fields in the input, atomically with the employee row.
  //
  // Atomicity approach: db.transaction() wraps both the Person INSERT and the
  // employee INSERT so a duplicate-employeeCode (or any other role-insert
  // failure) rolls back the Person in the same transaction — no orphaned Person.
  // Audit/events calls run AFTER the transaction commits so they aren't rolled
  // back on their own failures.
  let personId: string | null = row.personId ?? null;
  let created: Employee;

  try {
    created = await db.transaction(async (tx) => {
      // Only mint a Person when no personId was supplied.
      if (!personId) {
        const anchorIdType = deriveAnchorIdType({
          sssNumber: row.sssNumber,
          tinNumber: row.tinNumber,
        });
        const person = await createPerson({
          firstName: row.firstName,
          lastName: row.lastName,
          middleName: row.middleName ?? null,
          dateOfBirth: row.dateOfBirth ?? null,
          sssNumber: row.sssNumber ?? null,
          philhealthNumber: row.philhealthNumber ?? null,
          pagibigNumber: row.pagibigNumber ?? null,
          tinNumber: row.tinNumber ?? null,
          email: row.email ?? null,
          phone: row.phone ?? null,
          addressLine1: row.addressLine1 ?? null,
          addressLine2: row.addressLine2 ?? null,
          city: row.city ?? null,
          province: row.province ?? null,
          postalCode: row.postalCode ?? null,
          anchorIdType,
          actorUserId: actorUserId ?? null,
        }, { tx });
        personId = person.id;
      }

      const [emp] = await tx
        .insert(employees)
        .values({ ...row, personId, basicSalary: String(row.basicSalary) })
        .returning();
      if (!emp) throw new Error('[hr/createEmployee] insert returned no row');
      return emp;
    });
  } catch (e: any) {
    if (e.code === '23505' && /email/.test(e.detail ?? '')) {
      throw new Error(`Email already in use: ${row.email}`);
    }
    // Re-throw if it's already a clean error (e.g. from the narrowing guard above)
    if (e.message?.startsWith('[hr/')) throw e;
    throw new Error(`[hr/createEmployee] ${e.message ?? e}`);
  }

  // Audit + events run after commit — not inside the transaction.
  await audit.record({
    actor: actorUserId ?? null,
    action: 'hr.employee.created',
    target: { kind: 'hr_employee', id: created.id },
    payload: { employeeCode: created.employeeCode, name: `${created.firstName} ${created.lastName}` },
  });
  await events.publish('hr.employee.created', { id: created.id, employeeCode: created.employeeCode });
  return created;
}

export async function getEmployee(id: string): Promise<Employee | null> {
  const db = getDb();
  const rows = await db.select().from(employees).where(eq(employees.id, id));
  return rows[0] ?? null;
}

export async function getEmployeeByCode(code: string): Promise<Employee | null> {
  const db = getDb();
  const rows = await db.select().from(employees).where(eq(employees.employeeCode, code));
  return rows[0] ?? null;
}

// ─── Employee + Person identity accessor ─────────────────────────────────────
//
// These accessors merge employment fields (from hr_employees) with identity
// fields (from persons) into one flat shape. The property names for identity
// match the historic Employee column names exactly — callers switch their data
// SOURCE (from employees table to persons table), not their field names.
//
// LEFT JOIN: if personId is NULL (during the T3→T12 transition), the employee
// row is still returned; all identity fields come back as null. This avoids
// breaking any reader during the gradual migration.

/**
 * The merged shape: all employment-specific fields from hr_employees, plus all
 * identity fields from persons (using the same property names as the legacy
 * hr_employees columns so callers need zero rename changes).
 *
 * Identity fields are nullable even where Person has NOT NULL — they become
 * null when personId is NULL (no linked Person yet).
 */
export type EmployeeWithIdentity = {
  // ── Employment fields (hr_employees) ────────────────────────────────────────
  id:             Employee['id'];
  employeeCode:   Employee['employeeCode'];
  basicSalary:    Employee['basicSalary'];
  payFrequency:   Employee['payFrequency'];
  employmentType: Employee['employmentType'];
  status:         Employee['status'];
  hiredOn:        Employee['hiredOn'];
  terminatedOn:   Employee['terminatedOn'];
  rdoCode:        Employee['rdoCode'];
  isArmedPost:    Employee['isArmedPost'];
  personId:       Employee['personId'];
  createdAt:      Employee['createdAt'];
  updatedAt:      Employee['updatedAt'];

  // ── Identity fields (persons) — same names as the legacy hr_employees cols ──
  firstName:            Person['firstName']            | null;
  lastName:             Person['lastName']             | null;
  middleName:           Person['middleName']           | null;
  suffix:               Person['suffix']               | null;
  dateOfBirth:          Person['dateOfBirth']          | null;
  sex:                  Person['sex']                  | null;
  philsysNumber:        Person['philsysNumber']        | null;
  sssNumber:            Person['sssNumber']            | null;
  tinNumber:            Person['tinNumber']            | null;
  philhealthNumber:     Person['philhealthNumber']     | null;
  pagibigNumber:        Person['pagibigNumber']        | null;
  umidNumber:           Person['umidNumber']           | null;
  passportNumber:       Person['passportNumber']       | null;
  driversLicenseNumber: Person['driversLicenseNumber'] | null;
  addressLine1:         Person['addressLine1']         | null;
  addressLine2:         Person['addressLine2']         | null;
  city:                 Person['city']                 | null;
  province:             Person['province']             | null;
  postalCode:           Person['postalCode']           | null;
  phone:                Person['phone']                | null;
  email:                Person['email']                | null;
};

/** Reusable Drizzle column selection object for the merged shape. */
const employeeWithIdentityColumns = {
  // employment
  id:             employees.id,
  employeeCode:   employees.employeeCode,
  basicSalary:    employees.basicSalary,
  payFrequency:   employees.payFrequency,
  employmentType: employees.employmentType,
  status:         employees.status,
  hiredOn:        employees.hiredOn,
  terminatedOn:   employees.terminatedOn,
  rdoCode:        employees.rdoCode,
  isArmedPost:    employees.isArmedPost,
  personId:       employees.personId,
  createdAt:      employees.createdAt,
  updatedAt:      employees.updatedAt,
  // identity — sourced from persons
  firstName:            persons.firstName,
  lastName:             persons.lastName,
  middleName:           persons.middleName,
  suffix:               persons.suffix,
  dateOfBirth:          persons.dateOfBirth,
  sex:                  persons.sex,
  philsysNumber:        persons.philsysNumber,
  sssNumber:            persons.sssNumber,
  tinNumber:            persons.tinNumber,
  philhealthNumber:     persons.philhealthNumber,
  pagibigNumber:        persons.pagibigNumber,
  umidNumber:           persons.umidNumber,
  passportNumber:       persons.passportNumber,
  driversLicenseNumber: persons.driversLicenseNumber,
  addressLine1:         persons.addressLine1,
  addressLine2:         persons.addressLine2,
  city:                 persons.city,
  province:             persons.province,
  postalCode:           persons.postalCode,
  phone:                persons.phone,
  email:                persons.email,
} as const;

/**
 * Returns the employee's employment fields merged with the linked Person's
 * identity. Uses LEFT JOIN so employees without a linked Person are still
 * returned (identity fields will be null during the T3→T12 migration window).
 *
 * Returns null when no employee row exists for the given id.
 */
export async function getEmployeeWithIdentity(id: string): Promise<EmployeeWithIdentity | null> {
  const db = getDb();
  const rows = await db
    .select(employeeWithIdentityColumns)
    .from(employees)
    .leftJoin(persons, eq(employees.personId, persons.id))
    .where(eq(employees.id, id));
  return rows[0] ?? null;
}

export type GetEmployeesWithIdentityPageOptions = {
  query?: string;
  employmentType?: Employee['employmentType'];
  status?: Employee['status'];
  limit?: number;
  offset?: number;
};

export type GetEmployeesWithIdentityPageResult = {
  rows: EmployeeWithIdentity[];
  total: number;
};

/**
 * Paginated variant of getEmployeeWithIdentity. Options mirror listEmployeesPage
 * (query/employmentType/status/limit/offset).
 *
 * T10: name search and ORDER BY now operate on persons.first_name/last_name via
 * LEFT JOIN. The `%` operator form replaces similarity() > 0.2 so the
 * persons_fullname_trgm GIN index can accelerate the predicate. Threshold is
 * set to 0.2 via SET LOCAL inside a transaction (pool-safe — reverts on commit).
 *
 * Returns { rows, total } where total is the count of the full filtered set.
 */
export async function getEmployeesWithIdentityPage(
  opts: GetEmployeesWithIdentityPageOptions = {},
): Promise<GetEmployeesWithIdentityPageResult> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const trimmedQuery = (opts.query ?? '').trim();

  const buildConditions = (): ReturnType<typeof eq>[] => {
    const conditions: ReturnType<typeof eq>[] = [];
    if (trimmedQuery.length > 0) {
      conditions.push(personNameMatchesPredicate(trimmedQuery));
    }
    if (opts.employmentType) {
      conditions.push(eq(employees.employmentType, opts.employmentType));
    }
    if (opts.status) {
      conditions.push(eq(employees.status, opts.status));
    }
    return conditions;
  };

  const primaryOrder = trimmedQuery.length > 0
    ? personNameSimilarityDesc(trimmedQuery)
    : persons.lastName;

  const runQueries = async (runner: DbOrTx): Promise<GetEmployeesWithIdentityPageResult> => {
    const conditions = buildConditions();
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, countResult] = await Promise.all([
      runner
        .select(employeeWithIdentityColumns)
        .from(employees)
        .leftJoin(persons, eq(employees.personId, persons.id))
        .where(where)
        .orderBy(primaryOrder, employees.id)
        .limit(limit)
        .offset(offset),
      runner
        .select({ total: count() })
        .from(employees)
        .leftJoin(persons, eq(employees.personId, persons.id))
        .where(where),
    ]);
    return { rows, total: countResult[0]?.total ?? 0 };
  };

  if (trimmedQuery.length > 0) {
    return withNameSearchThreshold(db, runQueries);
  }

  return runQueries(db);
}

export type EmployeeListItem = {
  id:             Employee['id'];
  employeeCode:   Employee['employeeCode'];
  // T9: firstName/lastName come from the linked Person, not the legacy columns.
  // Nullable because a missing Person (pre-backfill) yields null via LEFT JOIN.
  firstName:      Person['firstName']  | null;
  lastName:       Person['lastName']   | null;
  email:          Person['email']      | null;
  status:         Employee['status'];
  employmentType: Employee['employmentType'];
  payFrequency:   Employee['payFrequency'];
  basicSalary:    Employee['basicSalary'];
  hiredOn:        Employee['hiredOn'];
};

export async function listEmployees(): Promise<EmployeeListItem[]> {
  const db = getDb();
  // T9: name is sourced from persons via LEFT JOIN so employees without a linked
  // Person (pre-backfill rows) are still returned (firstName/lastName will be null).
  const rows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      status: employees.status,
      employmentType: employees.employmentType,
      payFrequency: employees.payFrequency,
      basicSalary: employees.basicSalary,
      hiredOn: employees.hiredOn,
    })
    .from(employees)
    .leftJoin(persons, eq(employees.personId, persons.id))
    .orderBy(persons.lastName, persons.firstName);

  return rows;
}

export async function changeStatus(
  id: string,
  next: Status,
  reason: string,
  opts: { actorUserId?: string | null } = {},
): Promise<Employee> {
  const db = getDb();
  const current = await getEmployee(id);
  if (!current) throw new Error(`[hr/changeStatus] no employee ${id}`);
  if (!ALLOWED_TRANSITIONS[current.status].includes(next)) {
    throw new Error(`[hr/changeStatus] disallowed transition ${current.status} → ${next}`);
  }
  const [updated] = await db
    .update(employees)
    .set({
      status: next,
      updatedAt: new Date(),
      ...(next === 'terminated' ? { terminatedOn: new Date().toISOString().slice(0, 10) } : {}),
    })
    .where(eq(employees.id, id))
    .returning();
  if (!updated) throw new Error(`[hr/changeStatus] update returned no row for ${id}`);
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'hr.employee.status_changed',
    target: { kind: 'hr_employee', id },
    payload: { from: current.status, to: next, reason },
  });
  await events.publish('hr.employee.status_changed', { id, from: current.status, to: next });
  return updated;
}

// ─── Undo termination (5-minute window) ──────────────────────────────────────

/**
 * Looks up the precise timestamp of the most recent `terminated` transition
 * for an employee by inspecting the audit log. The `hr_employees.terminated_on`
 * column is a `date` (day-resolution), so it can't drive a 5-minute window —
 * we use the audit row's `createdAt` instead.
 *
 * Returns `null` when no termination audit row exists for this employee.
 */
export async function getLatestTerminationTimestamp(id: string): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, 'hr.employee.status_changed'),
        eq(auditLog.targetKind, 'hr_employee'),
        eq(auditLog.targetId, id),
        sql`${auditLog.payload}->>'to' = 'terminated'`,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}

/**
 * Reverts a recent termination back to `hired`. Only allowed within 5 minutes
 * of the termination event (sourced from the audit log, not the
 * day-resolution `terminatedOn` column). After that window, terminations are
 * final — re-hires create a new employee record (deferred to Slice 3+).
 *
 * Bypasses `ALLOWED_TRANSITIONS` on purpose: the state machine treats
 * `terminated` as terminal; this is the only escape hatch.
 *
 * Throws plain-language errors for: not-terminated, no termination on file,
 * outside-window, not-found.
 */
export async function undoTermination(
  id: string,
  reason: string,
  opts: { actorUserId?: string | null } = {},
): Promise<Employee> {
  const db = getDb();
  const current = await getEmployee(id);
  if (!current) throw new Error(`[hr/undoTermination] employee ${id} not found`);

  if (current.status !== 'terminated') {
    throw new Error("This employee isn't terminated — there's nothing to undo.");
  }

  const terminatedAt = await getLatestTerminationTimestamp(id);
  if (!terminatedAt) {
    throw new Error("We don't have a termination timestamp on file — can't undo.");
  }

  if (!isWithinUndoWindow(terminatedAt)) {
    throw new Error('The 5-minute undo window has passed. Termination is final.');
  }

  const [updated] = await db
    .update(employees)
    .set({ status: 'hired', terminatedOn: null, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();
  if (!updated) throw new Error(`[hr/undoTermination] update returned no row for ${id}`);

  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'hr.employee.status_changed',
    target: { kind: 'hr_employee', id },
    payload: { from: 'terminated', to: 'hired', reason, undo: true },
  });
  await events.publish('hr.employee.status_changed', { id, from: 'terminated', to: 'hired' });
  return updated;
}

// ─── Update employee ─────────────────────────────────────────────────────────

/** Fields that must never change after creation. The patch is sanitised by deleting these keys. */
const IMMUTABLE_FIELDS = ['id', 'employeeCode', 'createdAt'] as const;

/**
 * Identity columns that have moved to the `persons` table (Slice 3a, T11).
 * These are silently stripped from any `updateEmployee` patch — identity edits
 * MUST go through `persons.updatePerson` instead. The strip is silent (no error)
 * so legacy callers that still pass mixed patches don't break at the API level;
 * they just won't see identity changes until they call `persons.updatePerson`.
 *
 * `rdoCode` is intentionally NOT here — it is a BIR compliance field that stays
 * on the employee row (per T8 design decision).
 */
export const IDENTITY_FIELDS = [
  'firstName', 'middleName', 'lastName',
  'email', 'phone',
  'dateOfBirth',
  'sssNumber', 'philhealthNumber', 'pagibigNumber', 'tinNumber',
  'addressLine1', 'addressLine2', 'city', 'province', 'postalCode',
] as const;

/** All fields stripped from an update patch: immutable + identity. */
const ALL_STRIP_FIELDS = [...IMMUTABLE_FIELDS, ...IDENTITY_FIELDS] as const;

/**
 * Employment-only patch type: excludes identity fields (name, contact, IDs,
 * address — all on the Person) and immutable fields.
 *
 * Identity edits go through `persons.updatePerson`.
 */
type UpdateEmployeePatch = Partial<Omit<Employee,
  | 'id' | 'employeeCode' | 'createdAt'
  | 'firstName' | 'middleName' | 'lastName'
  | 'email' | 'phone'
  | 'dateOfBirth'
  | 'sssNumber' | 'philhealthNumber' | 'pagibigNumber' | 'tinNumber'
  | 'addressLine1' | 'addressLine2' | 'city' | 'province' | 'postalCode'
>>;

export async function updateEmployee(
  id: string,
  patch: UpdateEmployeePatch,
  actorUserId?: string | null,
): Promise<Employee> {
  const db = getDb();
  // Sanitise: strip immutable keys AND identity keys the caller should not touch
  const safePatch = { ...patch } as Record<string, unknown>;
  for (const field of ALL_STRIP_FIELDS) {
    delete safePatch[field];
  }

  const before = await getEmployee(id);
  if (!before) throw new Error(`[hr/updateEmployee] employee ${id} not found`);

  const [updated] = await db
    .update(employees)
    .set({ ...safePatch, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();
  if (!updated) throw new Error(`[hr/updateEmployee] update returned no row for ${id}`);

  const changedFields = Object.keys(safePatch).filter(
    (k) => (before as Record<string, unknown>)[k] !== (updated as Record<string, unknown>)[k],
  );

  await audit.record({
    actor: actorUserId ?? null,
    action: 'hr.employee.updated',
    target: { kind: 'hr_employee', id },
    payload: {
      before: Object.fromEntries(changedFields.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after:  Object.fromEntries(changedFields.map((k) => [k, (updated as Record<string, unknown>)[k]])),
      changedFields,
    },
  });
  await events.publish('hr.employee.updated', { id, changedFields });
  return updated;
}

// ─── Search employees ─────────────────────────────────────────────────────────
//
// Private helpers shared by searchEmployees, listEmployeesPage, and
// getEmployeesWithIdentityPage. Not exported — module-internal only.

/** pg_trgm similarity threshold applied per-transaction via SET LOCAL. */
const NAME_SEARCH_THRESHOLD = 0.2;

/**
 * SQL fragment: true when the persons full name fuzzy-matches `query`
 * OR the employee code contains `query` (ILIKE). Cast required because
 * Drizzle's typed condition stack doesn't know about the `%` operator.
 */
function personNameMatchesPredicate(query: string) {
  return sql`(
    (${persons.firstName} || ' ' || ${persons.lastName}) % ${query}
    OR ${employees.employeeCode} ILIKE ${'%' + query + '%'}
  )` as unknown as ReturnType<typeof eq>;
}

/**
 * SQL fragment: ORDER BY trigram similarity DESC, NULLs last.
 * Used as the primary sort key when a name-search query is active.
 */
function personNameSimilarityDesc(query: string) {
  return sql`similarity(${persons.firstName} || ' ' || ${persons.lastName}, ${query}) DESC NULLS LAST` as unknown as ReturnType<typeof eq>;
}

/**
 * Wraps `fn` in a transaction with `pg_trgm.similarity_threshold` set to
 * NAME_SEARCH_THRESHOLD for the duration of that transaction only (SET LOCAL
 * is pool-safe — reverts automatically on commit/rollback).
 *
 * Typed as the full DB client (not DbOrTx) because `.transaction()` is only
 * available on the top-level client. Every caller passes `getDb()` directly.
 */
async function withNameSearchThreshold<T>(
  db: ReturnType<typeof getDb>,
  fn: (tx: DbOrTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL pg_trgm.similarity_threshold = ${sql.raw(String(NAME_SEARCH_THRESHOLD))}`);
    return fn(tx);
  });
}

export type SearchEmployeeOptions = {
  limit?: number;
  employmentType?: Employee['employmentType'];
  status?: Employee['status'];
};

/**
 * Result type for searchEmployees.
 * T10: name fields come from the linked Person (nullable — null when no Person
 * is linked yet, i.e. pre-backfill rows). All other fields are employment-role
 * fields from hr_employees.
 */
export type SearchEmployeeResult = {
  id:             Employee['id'];
  employeeCode:   Employee['employeeCode'];
  // T10: sourced from persons via LEFT JOIN; null if personId is null.
  firstName:      Person['firstName']  | null;
  lastName:       Person['lastName']   | null;
  email:          Person['email']      | null;
  status:         Employee['status'];
  employmentType: Employee['employmentType'];
  payFrequency:   Employee['payFrequency'];
  basicSalary:    Employee['basicSalary'];
  hiredOn:        Employee['hiredOn'];
  personId:       Employee['personId'];
};

/**
 * T10: name search operates on persons.first_name/last_name via LEFT JOIN.
 * The `%` operator (GIN-accelerated) replaces the old similarity() > 0.2 form;
 * pg_trgm.similarity_threshold is set to 0.2 per-transaction via SET LOCAL so
 * the threshold is pool-safe (reverts automatically at transaction end).
 *
 * An employee with personId = null cannot match by name (similarity against
 * NULL is NULL, so the `%` predicate is false) but is still findable via the
 * employeeCode ILIKE branch — expected transitional behaviour until T12 backfill.
 */
export async function searchEmployees(
  query: string,
  opts: SearchEmployeeOptions = {},
): Promise<SearchEmployeeResult[]> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? 20, 100);
  const trimmedQuery = query.trim();

  const selectColumns = {
    id:             employees.id,
    employeeCode:   employees.employeeCode,
    firstName:      persons.firstName,
    lastName:       persons.lastName,
    email:          persons.email,
    status:         employees.status,
    employmentType: employees.employmentType,
    payFrequency:   employees.payFrequency,
    basicSalary:    employees.basicSalary,
    hiredOn:        employees.hiredOn,
    personId:       employees.personId,
  };

  const buildConditions = (): ReturnType<typeof eq>[] => {
    const conditions: ReturnType<typeof eq>[] = [];
    if (trimmedQuery.length > 0) {
      conditions.push(personNameMatchesPredicate(trimmedQuery));
    }
    if (opts.employmentType) {
      conditions.push(eq(employees.employmentType, opts.employmentType));
    }
    if (opts.status) {
      conditions.push(eq(employees.status, opts.status));
    }
    return conditions;
  };

  const primaryOrder = trimmedQuery.length > 0
    ? personNameSimilarityDesc(trimmedQuery)
    : persons.lastName;

  const run = async (runner: DbOrTx) => {
    const conditions = buildConditions();
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return runner
      .select(selectColumns)
      .from(employees)
      .leftJoin(persons, eq(employees.personId, persons.id))
      .where(where)
      .orderBy(primaryOrder, employees.id)
      .limit(limit);
  };

  if (trimmedQuery.length > 0) {
    return withNameSearchThreshold(db, run);
  }

  return run(db);
}

// ─── List employees (paginated, list-page-shaped) ────────────────────────────
//
// Sibling of `searchEmployees`. `searchEmployees` returns a flat array shaped
// for the typeahead component (Slice 2 contract: typeahead-backing endpoint).
// `listEmployeesPage` returns `{ rows, total }` so the /employees list page
// can render real pagination controls (criterion #2 at 10k scale).
//
// Same matching rules (similarity + ILIKE code + optional type/status), just
// adds offset + total count for the page.
//
// T10: name search operates on persons (LEFT JOIN). Result rows use EmployeeListItem
// shape (names nullable, sourced from persons). The /employees page maps nullable
// names to a display fallback on the way to EmployeeRow.

export type ListEmployeesPageOptions = {
  query?: string;
  employmentType?: Employee['employmentType'];
  status?: Employee['status'];
  limit?: number;
  offset?: number;
};

export type ListEmployeesPageResult = {
  rows: EmployeeListItem[];
  total: number;
};

export async function listEmployeesPage(
  opts: ListEmployeesPageOptions = {},
): Promise<ListEmployeesPageResult> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const trimmedQuery = (opts.query ?? '').trim();

  const listColumns = {
    id:           employees.id,
    employeeCode: employees.employeeCode,
    firstName:    persons.firstName,
    lastName:     persons.lastName,
    email:        persons.email,
    status:       employees.status,
    employmentType: employees.employmentType,
    payFrequency: employees.payFrequency,
    basicSalary:  employees.basicSalary,
    hiredOn:      employees.hiredOn,
  };

  const buildConditions = (): ReturnType<typeof eq>[] => {
    const conditions: ReturnType<typeof eq>[] = [];
    if (trimmedQuery.length > 0) {
      conditions.push(personNameMatchesPredicate(trimmedQuery));
    }
    if (opts.employmentType) {
      conditions.push(eq(employees.employmentType, opts.employmentType));
    }
    if (opts.status) {
      conditions.push(eq(employees.status, opts.status));
    }
    return conditions;
  };

  const primaryOrder = trimmedQuery.length > 0
    ? personNameSimilarityDesc(trimmedQuery)
    : persons.lastName;

  const runQueries = async (runner: DbOrTx): Promise<ListEmployeesPageResult> => {
    const conditions = buildConditions();
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, countResult] = await Promise.all([
      runner
        .select(listColumns)
        .from(employees)
        .leftJoin(persons, eq(employees.personId, persons.id))
        .where(where)
        .orderBy(primaryOrder, employees.id)
        .limit(limit)
        .offset(offset),
      runner
        .select({ total: count() })
        .from(employees)
        .leftJoin(persons, eq(employees.personId, persons.id))
        .where(where),
    ]);
    return { rows, total: countResult[0]?.total ?? 0 };
  };

  if (trimmedQuery.length > 0) {
    return withNameSearchThreshold(db, runQueries);
  }

  return runQueries(db);
}

// ─── Bulk import ─────────────────────────────────────────────────────────────

const csvRowSchema = z.object({
  employee_code: z.string().min(1, 'employee_code is required'),
  first_name:    z.string().min(1, 'first name is required'),
  last_name:     z.string().min(1, 'last name is required'),
  email:         z.string().email('the email address looks wrong — check for typos').optional().or(z.literal('')),
  basic_salary:  z.string().refine(
    (v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0,
    'basic salary must be a positive number',
  ),
  pay_frequency:   z.enum(['MONTHLY', 'SEMI_MONTHLY']).default('SEMI_MONTHLY'),
  hired_on:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'hired_on must be YYYY-MM-DD'),
  employment_type: z.enum(['GUARD', 'OFFICE_STAFF', 'SUPERVISOR', 'DRIVER', 'JANITOR', 'OTHER']).default('GUARD'),
  sss_number:        z.string().optional(),
  philhealth_number: z.string().optional(),
  pagibig_number:    z.string().optional(),
  tin_number:        z.string().optional(),
  // BIR 2316 fields — optional in CSV
  rdo_code:      z.string().max(3).optional().or(z.literal('')),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_of_birth must be YYYY-MM-DD').optional().or(z.literal('')),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city:          z.string().optional(),
  province:      z.string().optional(),
  postal_code:   z.string().max(4).optional().or(z.literal('')),
});

const blankToNull = (v: string | undefined): string | null => (v && v.trim() !== '' ? v.trim() : null);

export type BulkImportResult = {
  imported: number;
  errors: Array<{ row: number; reason: string }>;
};

export async function bulkImportEmployees(
  csvText: string,
  opts: { actorUserId?: string | null } = {},
): Promise<BulkImportResult> {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const errors: BulkImportResult['errors'] = [];

  const db = getDb();
  // Email-dedup block: intentionally retained until T9/T11 while the legacy
  // hr_employees.email column is still in use. Removed at T12 when email
  // uniqueness enforcement moves entirely to persons.email.
  const existingEmailRows = await db.select({ email: employees.email }).from(employees);
  const existingEmails = new Set<string>(
    existingEmailRows.map((r) => r.email).filter((e): e is string => typeof e === 'string'),
  );

  const seenInBatch = new Set<string>();
  // Collect validated rows for processing. We process row-by-row so that each
  // Person can be minted individually and SSS dups can be caught as row errors.
  type ValidatedRow = {
    csvRow: number;
    data: z.infer<typeof csvRowSchema>;
  };
  const validRows: ValidatedRow[] = [];

  parsed.data.forEach((raw, idx) => {
    const row = idx + 1;
    const parse = csvRowSchema.safeParse(raw);
    if (!parse.success) {
      errors.push({ row, reason: parse.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const r = parse.data;
    if (r.email && existingEmails.has(r.email)) {
      errors.push({ row, reason: `email ${r.email} already exists in HR — pick a different one or remove this row.` });
      return;
    }
    if (r.email && seenInBatch.has(r.email)) {
      errors.push({ row, reason: `email ${r.email} appears twice in the same file — keep one row.` });
      return;
    }
    if (r.email) seenInBatch.add(r.email);
    validRows.push({ csvRow: row, data: r });
  });

  // ── T7 transitional dual-write: create a Person per row then the employee ──
  // Each row is wrapped in its own transaction so a failed employee insert
  // (e.g. duplicate employeeCode) rolls back the Person that was just minted —
  // no orphaned Person rows. SSS/TIN collisions from createPerson still surface
  // as per-row errors so the rest of the import can continue.
  let imported = 0;
  for (const { csvRow, data: r } of validRows) {
    const sssNumber = blankToNull(r.sss_number);
    const tinNumber = blankToNull(r.tin_number);
    const anchorIdType = deriveAnchorIdType({ sssNumber, tinNumber });

    let created: Employee | undefined;
    try {
      created = await db.transaction(async (tx) => {
        const person = await createPerson({
          firstName: r.first_name,
          lastName: r.last_name,
          dateOfBirth: blankToNull(r.date_of_birth),
          sssNumber,
          philhealthNumber: blankToNull(r.philhealth_number),
          pagibigNumber: blankToNull(r.pagibig_number),
          tinNumber,
          addressLine1: blankToNull(r.address_line1),
          addressLine2: blankToNull(r.address_line2),
          city: blankToNull(r.city),
          province: blankToNull(r.province),
          postalCode: blankToNull(r.postal_code),
          anchorIdType,
          actorUserId: opts.actorUserId ?? null,
        }, { tx });

        const [emp] = await tx
          .insert(employees)
          .values({
            employeeCode: r.employee_code,
            firstName: r.first_name,
            lastName: r.last_name,
            email: r.email || null,
            basicSalary: String(parseFloat(r.basic_salary)),
            payFrequency: r.pay_frequency,
            employmentType: r.employment_type,
            hiredOn: r.hired_on,
            sssNumber,
            philhealthNumber: blankToNull(r.philhealth_number),
            pagibigNumber: blankToNull(r.pagibig_number),
            tinNumber,
            rdoCode: blankToNull(r.rdo_code),
            dateOfBirth: blankToNull(r.date_of_birth),
            addressLine1: blankToNull(r.address_line1),
            addressLine2: blankToNull(r.address_line2),
            city: blankToNull(r.city),
            province: blankToNull(r.province),
            postalCode: blankToNull(r.postal_code),
            personId: person.id,
          })
          .returning();
        if (!emp) throw new Error('[hr/bulkImportEmployees] insert returned no row');
        return emp;
      });
    } catch (e: any) {
      // "already on file" from createPerson means duplicate SSS/TIN — the
      // transaction rolled back so no orphaned Person was left behind.
      if (e.code === '23505' && /email/.test(e.detail ?? '')) {
        errors.push({ row: csvRow, reason: `email ${r.email} already exists in HR — pick a different one or remove this row.` });
      } else {
        errors.push({ row: csvRow, reason: e.message ?? String(e) });
      }
      continue;
    }

    // Audit + events run after commit — not inside the transaction.
    imported++;
    await audit.record({
      actor: opts.actorUserId ?? null,
      action: 'hr.employee.created',
      target: { kind: 'hr_employee', id: created.id },
      payload: { employeeCode: created.employeeCode, viaBulkImport: true },
    });
    await events.publish('hr.employee.created', { id: created.id, employeeCode: created.employeeCode });
  }
  return { imported, errors };
}

/**
 * Returns the next employee code for a prefix by finding the max numeric suffix
 * among existing codes and incrementing, padded to 5 digits (matching the
 * CG-10001 seed convention). Recruitment's hire flow uses this so recruiters
 * don't hand-type unique codes; the value remains overridable at hire time.
 */
export async function generateNextEmployeeCode(prefix = 'CG-'): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ code: employees.employeeCode })
    .from(employees)
    .where(sql`${employees.employeeCode} LIKE ${prefix + '%'}`);
  let max = 10000; // so the first generated code is <prefix>10001
  for (const { code } of rows) {
    const suffix = Number(code.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > max) max = suffix;
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}
