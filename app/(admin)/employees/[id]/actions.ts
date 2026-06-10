'use server';

import { revalidatePath } from 'next/cache';
import { hr, IDENTITY_FIELDS } from '@/modules/hr';
import { updatePerson } from '@/modules/persons';
import { getSessionFromCookie } from '@/modules/auth';

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

/**
 * Identity keys that belong on the Person (not on the employee row).
 *
 * This list is the intersection of hr's IDENTITY_FIELDS and the fields exposed
 * by EmployeePatchInput. The `satisfies` annotation ensures every entry is a
 * valid key of EmployeePatchInput — if a field is added to EmployeePatchInput
 * and is also an identity field, the compiler will flag it as unhandled here,
 * preventing silent strips in hr.updateEmployee.
 *
 * Note: IDENTITY_FIELDS may contain more fields (e.g. phone, sssNumber) that
 * are not yet in EmployeePatchInput. Those are handled by the hr.updateEmployee
 * strip safety-belt when/if they are ever added.
 */
const IDENTITY_KEYS = [
  'firstName', 'lastName',
  'email',
  'dateOfBirth',
  'addressLine1', 'addressLine2', 'city', 'province', 'postalCode',
] as const satisfies ReadonlyArray<keyof EmployeePatchInput & typeof IDENTITY_FIELDS[number]>;

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
    if ((IDENTITY_KEYS as readonly string[]).includes(key)) {
      identityPatch[key] = value;
    } else {
      employmentPatch[key] = value;
    }
  }

  try {
    // If the patch contains identity keys, diff against the current merged identity
    // before routing to persons.updatePerson.
    //
    // Why diff first:
    //   (a) pre-backfill employees (personId=null) can still save employment-only
    //       edits — if no identity field actually changed, we skip updatePerson
    //       entirely and never hit the "not migrated" error.
    //   (b) avoids writing a person.updated audit row with empty changedFields
    //       every time the form is saved (audit noise).
    //
    // Normalization: toPatch() in the form converts empty strings → null, so we
    // treat null and '' as equivalent when comparing.
    if (Object.keys(identityPatch).length > 0) {
      // Load current merged identity to compute actual diff.
      const current = await hr.getEmployeeWithIdentity(id);
      if (!current) {
        return { kind: 'error', message: "We couldn't find that employee — they may have been removed. Try refreshing the list." };
      }

      const normalize = (v: unknown): string | null =>
        v === null || v === undefined || v === '' ? null : String(v).trim();

      const reallyChanged: Record<string, unknown> = {};
      for (const [key, submitted] of Object.entries(identityPatch)) {
        const existing = (current as Record<string, unknown>)[key];
        if (normalize(submitted) !== normalize(existing)) {
          reallyChanged[key] = submitted;
        }
      }

      if (Object.keys(reallyChanged).length > 0) {
        // Identity DID change — require a linked Person.
        if (!current.personId) {
          return {
            kind: 'error',
            message: "This employee's identity record hasn't been migrated yet — run the identity backfill first.",
          };
        }
        await updatePerson(current.personId, reallyChanged, session.user.id);
      }
      // If reallyChanged is empty, skip updatePerson entirely — employment patch
      // (if any) can still proceed below.
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
