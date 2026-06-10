'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { clients } from '@/modules/clients';
import { getSessionFromCookie } from '@/modules/auth';

/**
 * Editable patch shape for the client detail/edit form. All fields are optional;
 * nullable fields accept `null` to clear them. Immutable fields (`id`, `createdAt`)
 * are stripped by `clients.updateClient` and not accepted here either.
 */
export interface ClientPatchInput {
  name?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  defaultPayrollCalendarId?: string | null;
}

export type UpdateClientResult =
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export async function updateClientAction(
  id: string,
  patch: ClientPatchInput,
): Promise<UpdateClientResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  try {
    await clients.updateClient(id, patch, session.user.id);
    revalidatePath(`/clients/${id}`);
    revalidatePath('/clients');
    return { kind: 'ok' };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let message = raw;
    if (raw.includes('clients_default_payroll_calendar_id_fkey')) {
      message =
        'That payroll calendar no longer exists. Pick a different one or leave it blank.';
    } else if (raw.startsWith('[clients/updateClient]')) {
      message =
        "We couldn't find that client — it may have been removed. Try refreshing the list.";
    } else {
      message = `We couldn't save those changes. ${raw}`;
    }
    return { kind: 'error', message };
  }
}

export type DeleteClientResult =
  | { kind: 'ok' } // unreachable in practice — the server redirects to /clients first
  | { kind: 'error'; message: string };

/**
 * Hard-deletes a client within the 5-minute creation window. On success,
 * `revalidatePath('/clients')` invalidates the list cache and the action
 * redirects to `/clients`. The Next.js redirect throws a `NEXT_REDIRECT` —
 * we let it propagate so the navigation actually happens.
 */
export async function deleteClientAction(id: string): Promise<DeleteClientResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  try {
    await clients.deleteClient(id, { actorUserId: session.user.id });
    revalidatePath('/clients');
    redirect('/clients');
  } catch (e) {
    // Next.js redirect() throws a special error — let it pass through.
    if (
      e &&
      typeof e === 'object' &&
      'digest' in e &&
      typeof (e as { digest: unknown }).digest === 'string' &&
      (e as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw e;
    }
    const raw = e instanceof Error ? e.message : String(e);
    let message = raw;
    if (raw.startsWith('[clients/deleteClient]')) {
      message =
        "We couldn't find that client — it may have already been removed.";
    } else {
      // Service errors are already plain-language.
      message = raw;
    }
    return { kind: 'error', message };
  }
}
