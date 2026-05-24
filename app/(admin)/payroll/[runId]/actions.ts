'use server';

import { revalidatePath } from 'next/cache';
import { payroll } from '@/modules/payroll';
import { getSessionFromCookie } from '@/modules/auth';

export type FormState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

export async function lockPayRunAction(
  payRunId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  try {
    await payroll.lockPayRun(payRunId, { actorUserId: session.user.id });
    revalidatePath('/payroll');
    revalidatePath(`/payroll/${payRunId}`);
    return { kind: 'success', message: 'Pay run locked.' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't lock the pay run: ${message}` };
  }
}
