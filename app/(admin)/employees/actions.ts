'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assignments } from '@/modules/assignments';
import { getSessionFromCookie } from '@/modules/auth';

const bulkAssignSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1, 'Select at least one row.'),
  detachmentId: z.string().uuid('Pick a detachment from the dropdown.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
});

export type BulkAssignActionResult =
  | { kind: 'ok'; succeeded: number; errors: { id: string; reason: string }[] }
  | { kind: 'error'; message: string };

/**
 * Bulk-assign the selected employees to one detachment starting on a given
 * date. Per-row failures (e.g. employee already has an active assignment)
 * are returned in `errors` — they do not abort the batch. Mirrors the
 * bulkTransferAction shape on /assignments so the result panel can be
 * shared between the two flows.
 */
export async function bulkAssignAction(
  employeeIds: string[],
  detachmentId: string,
  startDate: string,
): Promise<BulkAssignActionResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return { kind: 'error', message: 'Your session expired. Please sign in again.' };
  }

  const parsed = bulkAssignSchema.safeParse({ employeeIds, detachmentId, startDate });
  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  try {
    const result = await assignments.bulkAssign(
      parsed.data.employeeIds,
      parsed.data.detachmentId,
      parsed.data.startDate,
      session.user.id,
    );
    revalidatePath('/employees');
    revalidatePath('/assignments');
    return {
      kind: 'ok',
      succeeded: result.assigned.length,
      errors: result.errors.map((e) => ({ id: e.employeeId, reason: e.reason })),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't bulk-assign: ${message}` };
  }
}
