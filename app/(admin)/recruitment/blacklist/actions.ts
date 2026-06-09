'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { recruitment } from '@/modules/recruitment';
import { getSessionFromCookie } from '@/modules/auth';

export type FormState = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'ok' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (v: FormDataEntryValue | null): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

const schema = z.object({
  firstName: z.string().trim().min(1, 'Please enter the first name.'),
  lastName: z.string().trim().min(1, 'Please enter the last name.'),
  reason: z.string().trim().min(1, 'Please give a reason.'),
  dateOfBirth: z.string().trim().optional().or(z.literal('')).refine((v) => !v || DATE_RE.test(v), 'Date of birth must be YYYY-MM-DD.'),
  sssNumber: z.string().trim().optional().or(z.literal('')),
});

export async function addToBlacklistAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = schema.safeParse({
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    reason: formData.get('reason') ?? '',
    dateOfBirth: formData.get('dateOfBirth') ?? '',
    sssNumber: formData.get('sssNumber') ?? '',
  });
  if (!parsed.success) return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const d = parsed.data;

  try {
    await recruitment.addToBlacklist({
      firstName: d.firstName,
      lastName: d.lastName,
      reason: d.reason,
      dateOfBirth: blank(d.dateOfBirth ?? null),
      sssNumber: blank(d.sssNumber ?? null),
      addedByUserId: session.user.id,
    });
  } catch (e) {
    return { kind: 'error', message: `Couldn't add to blacklist: ${e instanceof Error ? e.message : String(e)}` };
  }
  revalidatePath('/recruitment/blacklist');
  return { kind: 'ok' };
}

export async function removeFromBlacklistAction(formData: FormData): Promise<void> {
  const session = await getSessionFromCookie();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  await recruitment.removeFromBlacklist(id, { actorUserId: session.user.id });
  revalidatePath('/recruitment/blacklist');
}
