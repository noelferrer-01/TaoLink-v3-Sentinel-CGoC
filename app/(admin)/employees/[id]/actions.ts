'use server';

import { revalidatePath } from 'next/cache';
import { hr } from '@/modules/hr';
import { updatePerson } from '@/modules/persons';
import { getSessionFromCookie } from '@/modules/auth';
import { getDb } from '@/core/db';
import { employees } from '@/modules/hr/schema';
import { eq } from 'drizzle-orm';

/**
 * Editable patch shape — only the fields the detail/edit form is allowed to
 * change. Status is intentionally NOT here: it has its own state-machine flow
 * via `changeStatusAction`. Immutable fields (id, employeeCode, createdAt) are
 * stripped server-side by `hr.updateEmployee` anyway, but we don't accept them
 * at the action boundary either.
 *
 * T11: the action splits the patch server-side — identity fields (name, contact,
 * IDs, address) → `persons.updatePerson`; employment fields → `hr.updateEmployee`.
 * No form or component changes are needed (that's T13).
 */
export interface EmployeePatchInput {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  employmentType?: 'GUARD' | 'OFFICE_STAFF' | 'SUPERVISOR' | 'DRIVER' | 'JANITOR' | 'OTHER';
  basicSalary?: string; // numeric stored as string by drizzle
  payFrequency?: 'MONTHLY' | 'SEMI_MONTHLY';
  hiredOn?: string; // YYYY-MM-DD
  rdoCode?: string | null;
  dateOfBirth?: string | null; // YYYY-MM-DD
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

/** Identity keys that belong on the Person (not on the employee row). */
const IDENTITY_KEYS: ReadonlyArray<keyof EmployeePatchInput> = [
  'firstName', 'lastName',
  'email',
  'dateOfBirth',
  'addressLine1', 'addressLine2', 'city', 'province', 'postalCode',
];

export type UpdateResult =
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export async function updateEmployeeAction(
  id: string,
  patch: EmployeePatchInput,
): Promise<UpdateResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  // Split the patch into identity keys (→ Person) and employment keys (→ Employee).
  const identityPatch: Record<string, unknown> = {};
  const employmentPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (IDENTITY_KEYS.includes(key as keyof EmployeePatchInput)) {
      identityPatch[key] = value;
    } else {
      employmentPatch[key] = value;
    }
  }

  try {
    // If the patch contains identity keys, look up the personId and route to persons.updatePerson.
    if (Object.keys(identityPatch).length > 0) {
      const db = getDb();
      const [row] = await db.select({ personId: employees.personId }).from(employees).where(eq(employees.id, id));
      if (!row) {
        return { kind: 'error', message: "We couldn't find that employee — they may have been removed. Try refreshing the list." };
      }
      if (!row.personId) {
        return {
          kind: 'error',
          message: "This employee's identity record hasn't been migrated yet — run the identity backfill first.",
        };
      }
      await updatePerson(row.personId, identityPatch, session.user.id);
    }

    // Route employment fields to hr.updateEmployee (identity keys are stripped there too, as a safety belt).
    if (Object.keys(employmentPatch).length > 0) {
      await hr.updateEmployee(id, employmentPatch as Parameters<typeof hr.updateEmployee>[1], session.user.id);
    }

    revalidatePath(`/employees/${id}`);
    revalidatePath('/employees');
    return { kind: 'ok' };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // Plain-language wrapper for common DB errors
    let message = raw;
    if (raw.includes('hr_employees_email_uq') || (raw.includes('duplicate key') && raw.includes('email'))) {
      message = "That email is already used by another employee. Pick a different one or leave it blank.";
    } else if (raw.startsWith('[hr/updateEmployee]')) {
      message = "We couldn't find that employee — they may have been removed. Try refreshing the list.";
    } else {
      message = `We couldn't save those changes. ${raw}`;
    }
    return { kind: 'error', message };
  }
}

export type ChangeStatusResult =
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

const ALLOWED_STATUSES = [
  'applicant',
  'hired',
  'deployed',
  'reliever',
  'floating',
  'on_leave',
  'terminated',
] as const;
type EmployeeStatus = (typeof ALLOWED_STATUSES)[number];

function isEmployeeStatus(v: string): v is EmployeeStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(v);
}

export async function changeStatusAction(
  id: string,
  next: string,
  reason: string,
): Promise<ChangeStatusResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  if (!isEmployeeStatus(next)) {
    return {
      kind: 'error',
      message: 'Pick a status from the list.',
    };
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    return {
      kind: 'error',
      message: 'Add a short reason (at least a few words) so the audit log makes sense later.',
    };
  }

  try {
    await hr.changeStatus(id, next, trimmedReason, { actorUserId: session.user.id });
    revalidatePath(`/employees/${id}`);
    revalidatePath('/employees');
    return { kind: 'ok' };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let message = raw;
    if (raw.includes('disallowed transition')) {
      message = "That status change isn't allowed from the current status. Once an employee is terminated, the status is final.";
    } else {
      message = `We couldn't change the status. ${raw}`;
    }
    return { kind: 'error', message };
  }
}

/**
 * Reverts a termination back to "hired" within the 5-minute undo window.
 * The window check runs server-side in `hr.undoTermination` — the UI just
 * hides the button after 5 minutes for clerk UX. If the user trips the
 * server-side guard (e.g. clock skew, slow click), we surface a plain-language
 * error.
 */
export async function undoTerminationAction(
  id: string,
  reason: string,
): Promise<UpdateResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  const trimmedReason = reason.trim().length > 0
    ? reason.trim()
    : 'Termination undone within 5-minute window';

  try {
    await hr.undoTermination(id, trimmedReason, { actorUserId: session.user.id });
    revalidatePath(`/employees/${id}`);
    revalidatePath('/employees');
    return { kind: 'ok' };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let message = raw;
    if (raw.startsWith('[hr/undoTermination]')) {
      message = "We couldn't find that employee — they may have been removed. Try refreshing the page.";
    } else {
      // Service errors are already plain-language ("The 5-minute undo window
      // has passed.", "This employee isn't terminated — ...", etc.)
      message = raw;
    }
    return { kind: 'error', message };
  }
}
