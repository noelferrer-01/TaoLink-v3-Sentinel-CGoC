'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assignments } from '@/modules/assignments';
import { getSessionFromCookie } from '@/modules/auth';

const assignSchema = z.object({
  employeeId: z.string().uuid('Pick an employee from the dropdown.'),
  detachmentId: z.string().uuid('Pick a detachment from the dropdown.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
});

export type FormState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

export async function assignAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = assignSchema.safeParse({
    employeeId: formData.get('employeeId'),
    detachmentId: formData.get('detachmentId'),
    startDate: formData.get('startDate'),
  });

  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  try {
    await assignments.assign({
      employeeId: parsed.data.employeeId,
      detachmentId: parsed.data.detachmentId,
      startDate: parsed.data.startDate,
      actorUserId: session.user.id,
    });
    revalidatePath('/assignments');
    return { kind: 'success', message: 'Employee assigned.' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't assign the employee: ${message}` };
  }
}

// ─── Bulk actions ────────────────────────────────────────────────────────────

const bulkTransferSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1, 'Select at least one row.'),
  toDetachmentId: z.string().uuid('Pick a detachment from the dropdown.'),
  transferDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a transfer date.'),
});

const bulkEndSchema = z.object({
  assignmentIds: z.array(z.string().uuid()).min(1, 'Select at least one row.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date.'),
  reason: z
    .string()
    .trim()
    .min(3, 'Add a short reason so the audit log makes sense later.'),
});

export type BulkActionResult =
  | { kind: 'ok'; succeeded: number; errors: { id: string; reason: string }[] }
  | { kind: 'error'; message: string };

export async function bulkTransferAction(
  employeeIds: string[],
  toDetachmentId: string,
  transferDate: string,
): Promise<BulkActionResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return { kind: 'error', message: 'Your session expired. Please sign in again.' };
  }

  const parsed = bulkTransferSchema.safeParse({ employeeIds, toDetachmentId, transferDate });
  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  try {
    const result = await assignments.bulkTransfer(
      parsed.data.employeeIds,
      parsed.data.toDetachmentId,
      parsed.data.transferDate,
      session.user.id,
    );
    revalidatePath('/assignments');
    return {
      kind: 'ok',
      succeeded: result.transferred.length,
      errors: result.errors.map((e) => ({ id: e.employeeId, reason: e.reason })),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't transfer: ${message}` };
  }
}

export async function bulkEndAssignmentsAction(
  assignmentIds: string[],
  endDate: string,
  reason: string,
): Promise<BulkActionResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return { kind: 'error', message: 'Your session expired. Please sign in again.' };
  }

  const parsed = bulkEndSchema.safeParse({ assignmentIds, endDate, reason });
  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  try {
    const result = await assignments.bulkEndAssignments(
      parsed.data.assignmentIds,
      parsed.data.endDate,
      parsed.data.reason,
      session.user.id,
    );
    revalidatePath('/assignments');
    return {
      kind: 'ok',
      succeeded: result.ended.length,
      errors: result.errors.map((e) => ({ id: e.assignmentId, reason: e.reason })),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't end assignments: ${message}` };
  }
}

