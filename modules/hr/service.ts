import { eq } from 'drizzle-orm';
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
