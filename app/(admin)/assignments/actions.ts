'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assignments } from '@/modules/assignments';
import { getSessionFromCookie } from '@/modules/auth';

const assignSchema = z.object({
  employeeId: z.string().uuid('Pick a guard from the dropdown.'),
  detachmentId: z.string().uuid('Pick a detachment from the dropdown.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
});

const endSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date.'),
  endReason: z.string().trim().min(1, 'Please write a short reason for ending this assignment.'),
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
    return { kind: 'success', message: 'Guard assigned.' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't assign the guard: ${message}` };
  }
}

export async function endAssignmentAction(
  assignmentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = endSchema.safeParse({
    endDate: formData.get('endDate'),
    endReason: formData.get('endReason'),
  });

  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  try {
    await assignments.endAssignment(
      assignmentId,
      parsed.data.endDate,
      parsed.data.endReason,
      { actorUserId: session.user.id },
    );
    revalidatePath('/assignments');
    return { kind: 'success', message: 'Assignment ended.' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't end the assignment: ${message}` };
  }
}
