import { eq, and, desc, sql, count } from 'drizzle-orm';
import Papa from 'papaparse';
import { z } from 'zod';
import { getDb } from '@/core/db';
import { isWithinUndoWindow } from '@/core/time';
import { employees, type Employee, type NewEmployee } from './schema';
import { persons, type Person } from '@/modules/persons/schema';
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

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const db = getDb();
  const { actorUserId, ...row } = input;
  try {
    const [created] = await db
      .insert(employees)
      .values({ ...row, basicSalary: String(row.basicSalary) })
      .returning();
    if (!created) throw new Error('[hr/createEmployee] insert returned no row');
    await audit.record({
      actor: actorUserId ?? null,
      action: 'hr.employee.created',
      target: { kind: 'hr_employee', id: created.id },
      payload: { employeeCode: created.employeeCode, name: `${created.firstName} ${created.lastName}` },
    });
    await events.publish('hr.employee.created', { id: created.id, employeeCode: created.employeeCode });
    return created;
  } catch (e: any) {
    if (e.code === '23505' && /email/.test(e.detail ?? '')) {
      throw new Error(`Email already in use: ${row.email}`);
    }
    // Re-throw if it's already a clean error (e.g. from the narrowing guard above)
    if (e.message?.startsWith('[hr/')) throw e;
    throw new Error(`[hr/createEmployee] ${e.message ?? e}`);
  }
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
  return (rows[0] as EmployeeWithIdentity) ?? null;
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
 * (query/employmentType/status/limit/offset). Name search still operates on the
 * legacy hr_employees columns during the transition; T10 will move it to persons.
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

  const conditions: ReturnType<typeof eq>[] = [];

  if (trimmedQuery.length > 0) {
    conditions.push(
      sql`(
        similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${trimmedQuery}) > 0.2
        OR ${employees.employeeCode} ILIKE ${'%' + trimmedQuery + '%'}
      )` as unknown as ReturnType<typeof eq>,
    );
  }
  if (opts.employmentType) {
    conditions.push(eq(employees.employmentType, opts.employmentType));
  }
  if (opts.status) {
    conditions.push(eq(employees.status, opts.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = trimmedQuery.length > 0
    ? (sql`similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${trimmedQuery}) DESC NULLS LAST` as unknown as ReturnType<typeof eq>)
    : employees.lastName;

  const [rows, countResult] = await Promise.all([
    db
      .select(employeeWithIdentityColumns)
      .from(employees)
      .leftJoin(persons, eq(employees.personId, persons.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(employees).where(where),
  ]);

  return { rows: rows as EmployeeWithIdentity[], total: countResult[0]?.total ?? 0 };
}

export type EmployeeListItem = Pick<
  Employee,
  | 'id'
  | 'employeeCode'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'status'
  | 'payFrequency'
  | 'basicSalary'
  | 'hiredOn'
>;

export async function listEmployees(): Promise<EmployeeListItem[]> {
  const db = getDb();
  return db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      status: employees.status,
      payFrequency: employees.payFrequency,
      basicSalary: employees.basicSalary,
      hiredOn: employees.hiredOn,
    })
    .from(employees)
    .orderBy(employees.lastName, employees.firstName);
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

type UpdateEmployeePatch = Partial<Omit<Employee, 'id' | 'employeeCode' | 'createdAt'>>;

export async function updateEmployee(
  id: string,
  patch: UpdateEmployeePatch,
  actorUserId?: string | null,
): Promise<Employee> {
  const db = getDb();
  // Sanitise: strip immutable keys the caller should not touch
  const safePatch = { ...patch } as Record<string, unknown>;
  for (const field of IMMUTABLE_FIELDS) {
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

export type SearchEmployeeOptions = {
  limit?: number;
  employmentType?: Employee['employmentType'];
  status?: Employee['status'];
};

export async function searchEmployees(
  query: string,
  opts: SearchEmployeeOptions = {},
): Promise<Employee[]> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? 20, 100);
  const trimmedQuery = query.trim();

  const conditions: ReturnType<typeof eq>[] = [];

  if (trimmedQuery.length > 0) {
    conditions.push(
      sql`(
        similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${trimmedQuery}) > 0.2
        OR ${employees.employeeCode} ILIKE ${'%' + trimmedQuery + '%'}
      )` as unknown as ReturnType<typeof eq>,
    );
  }
  if (opts.employmentType) {
    conditions.push(eq(employees.employmentType, opts.employmentType));
  }
  if (opts.status) {
    conditions.push(eq(employees.status, opts.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(employees)
    .where(where)
    .orderBy(
      trimmedQuery.length > 0
        ? (sql`similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${trimmedQuery}) DESC NULLS LAST` as unknown as ReturnType<typeof eq>)
        : employees.lastName,
    )
    .limit(limit);
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

export type ListEmployeesPageOptions = {
  query?: string;
  employmentType?: Employee['employmentType'];
  status?: Employee['status'];
  limit?: number;
  offset?: number;
};

export type ListEmployeesPageResult = {
  rows: Employee[];
  total: number;
};

export async function listEmployeesPage(
  opts: ListEmployeesPageOptions = {},
): Promise<ListEmployeesPageResult> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const trimmedQuery = (opts.query ?? '').trim();

  const conditions: ReturnType<typeof eq>[] = [];

  if (trimmedQuery.length > 0) {
    conditions.push(
      sql`(
        similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${trimmedQuery}) > 0.2
        OR ${employees.employeeCode} ILIKE ${'%' + trimmedQuery + '%'}
      )` as unknown as ReturnType<typeof eq>,
    );
  }
  if (opts.employmentType) {
    conditions.push(eq(employees.employmentType, opts.employmentType));
  }
  if (opts.status) {
    conditions.push(eq(employees.status, opts.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = trimmedQuery.length > 0
    ? (sql`similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${trimmedQuery}) DESC NULLS LAST` as unknown as ReturnType<typeof eq>)
    : employees.lastName;

  const [rows, countResult] = await Promise.all([
    db.select().from(employees).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(employees).where(where),
  ]);

  return { rows, total: countResult[0]?.total ?? 0 };
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
  const existingEmailRows = await db.select({ email: employees.email }).from(employees);
  const existingEmails = new Set<string>(
    existingEmailRows.map((r) => r.email).filter((e): e is string => typeof e === 'string'),
  );

  const seenInBatch = new Set<string>();
  const toInsert: NewEmployee[] = [];

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
    toInsert.push({
      employeeCode: r.employee_code,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email || null,
      basicSalary: String(parseFloat(r.basic_salary)),
      payFrequency: r.pay_frequency,
      employmentType: r.employment_type,
      hiredOn: r.hired_on,
      sssNumber: blankToNull(r.sss_number),
      philhealthNumber: blankToNull(r.philhealth_number),
      pagibigNumber: blankToNull(r.pagibig_number),
      tinNumber: blankToNull(r.tin_number),
      rdoCode: blankToNull(r.rdo_code),
      dateOfBirth: blankToNull(r.date_of_birth),
      addressLine1: blankToNull(r.address_line1),
      addressLine2: blankToNull(r.address_line2),
      city: blankToNull(r.city),
      province: blankToNull(r.province),
      postalCode: blankToNull(r.postal_code),
    });
  });

  let imported = 0;
  if (toInsert.length > 0) {
    const created = await db.insert(employees).values(toInsert).returning();
    imported = created.length;
    for (const e of created) {
      await audit.record({
        actor: opts.actorUserId ?? null,
        action: 'hr.employee.created',
        target: { kind: 'hr_employee', id: e.id },
        payload: { employeeCode: e.employeeCode, viaBulkImport: true },
      });
      await events.publish('hr.employee.created', { id: e.id, employeeCode: e.employeeCode });
    }
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
