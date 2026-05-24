'use server';

import { revalidatePath } from 'next/cache';
import { clients } from '@/modules/clients';
import { getSessionFromCookie } from '@/modules/auth';

/**
 * Editable patch for the detachment detail/edit form. `requiredHeadcount`
 * accepts `null` to clear the contract value (back to "not set"). Immutable
 * fields (`id`, `clientId`, `createdAt`) are stripped server-side.
 */
export interface DetachmentPatchInput {
  name?: string;
  address?: string | null;
  requiredHeadcount?: number | null;
}

export type UpdateDetachmentResult =
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export async function updateDetachmentAction(
  clientId: string,
  detachmentId: string,
  patch: DetachmentPatchInput,
): Promise<UpdateDetachmentResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  try {
    await clients.updateDetachment(detachmentId, patch, session.user.id);
    revalidatePath(`/clients/${clientId}/detachments/${detachmentId}`);
    revalidatePath(`/clients/${clientId}`);
    return { kind: 'ok' };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let message = raw;
    if (raw.startsWith('[clients/updateDetachment]')) {
      message =
        "We couldn't find that detachment — it may have been removed. Try refreshing the list.";
    } else {
      message = `We couldn't save those changes. ${raw}`;
    }
    return { kind: 'error', message };
  }
}
