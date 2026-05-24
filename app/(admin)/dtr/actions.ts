'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dtr } from '@/modules/dtr';
import { runPayroll } from '@/modules/payroll';
import { getSessionFromCookie } from '@/modules/auth';

const periodSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const bulkSchema = periodSchema.extend({
  employeeId: z.string().uuid(),
});

export type FormState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

export async function bulkFillWorkedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = bulkSchema.safeParse({
    start: formData.get('start'),
    end: formData.get('end'),
    employeeId: formData.get('employeeId'),
  });
  if (!parsed.success) {
    return { kind: 'error', message: 'Bad form data — refresh and try again.' };
  }

  try {
    const { recorded, skipped } = await dtr.bulkFillWorked(
      parsed.data.employeeId,
      parsed.data.start,
      parsed.data.end,
      { actorUserId: session.user.id },
    );
    revalidatePath('/dtr');
    return {
      kind: 'success',
      message: `Recorded ${recorded} day${recorded === 1 ? '' : 's'} as worked${
        skipped > 0 ? `, ${skipped} already had entries.` : '.'
      }`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Quick-fill failed: ${message}` };
  }
}

export async function fillAllAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = periodSchema.safeParse({
    start: formData.get('start'),
    end: formData.get('end'),
  });
  if (!parsed.success) {
    return { kind: 'error', message: 'Bad form data — refresh and try again.' };
  }

  const ids = formData.getAll('employeeId').map(String);
  if (ids.length === 0) {
    return { kind: 'error', message: 'No guards to fill — assign at least one guard first.' };
  }

  let totalRecorded = 0;
  let totalSkipped = 0;
  for (const id of ids) {
    const r = await dtr.bulkFillWorked(id, parsed.data.start, parsed.data.end, {
      actorUserId: session.user.id,
    });
    totalRecorded += r.recorded;
    totalSkipped += r.skipped;
  }
  revalidatePath('/dtr');
  return {
    kind: 'success',
    message: `Recorded ${totalRecorded} new day${
      totalRecorded === 1 ? '' : 's'
    } across ${ids.length} guard${ids.length === 1 ? '' : 's'}${
      totalSkipped > 0 ? `; ${totalSkipped} day${totalSkipped === 1 ? '' : 's'} already had entries.` : '.'
    }`,
  };
}

export async function closePeriodAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = periodSchema.safeParse({
    start: formData.get('start'),
    end: formData.get('end'),
  });
  if (!parsed.success) {
    return { kind: 'error', message: 'Bad form data — refresh and try again.' };
  }

  try {
    await dtr.closePeriod(parsed.data.start, parsed.data.end, {
      actorUserId: session.user.id,
    });
    // Run payroll inline so the demo's "close period → payslips appear" flow
    // works without depending on background event subscriptions.
    await runPayroll(parsed.data.start, parsed.data.end);
    revalidatePath('/dtr');
    revalidatePath('/payroll');
    return {
      kind: 'success',
      message: 'Period closed and payroll computed. Open the Pay runs page to see payslips.',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't close the period: ${message}` };
  }
}
