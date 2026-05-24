import { eq } from 'drizzle-orm';
import Papa from 'papaparse';
import { z } from 'zod';
import { getDb } from '@/core/db';
import { employees, type Employee, type NewEmployee } from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';

type Status = Employee['status'];

const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  applicant:  ['hired', 'terminated'],
  hired:      ['deployed', 'reliever', 'floating', 'on_leave', 'terminated'],
  deployed:   ['floating', 'reliever', 'on_leave', 'terminated'],
  reliever:   ['deployed', 'floating', 'on_leave', 'terminated'],
  floating:   ['deployed', 'reliever', 'on_leave', 'terminated'],
  on_leave:   ['deployed', 'reliever', 'floating', 'terminated'],
  terminated: [], // terminal
};

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
  pay_frequency: z.enum(['MONTHLY', 'SEMI_MONTHLY']).default('SEMI_MONTHLY'),
  hired_on:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'hired_on must be YYYY-MM-DD'),
  sss_number:        z.string().optional(),
  philhealth_number: z.string().optional(),
  pagibig_number:    z.string().optional(),
  tin_number:        z.string().optional(),
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
      hiredOn: r.hired_on,
      sssNumber: blankToNull(r.sss_number),
      philhealthNumber: blankToNull(r.philhealth_number),
      pagibigNumber: blankToNull(r.pagibig_number),
      tinNumber: blankToNull(r.tin_number),
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
