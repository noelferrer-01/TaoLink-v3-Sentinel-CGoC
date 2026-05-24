'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clients } from '@/modules/clients';
import { getSessionFromCookie } from '@/modules/auth';

const clientSchema = z.object({
  name: z.string().trim().min(1, 'Please enter the client name.'),
  contactEmail: z
    .string()
    .trim()
    .email('That email address looks wrong — check for typos.')
    .optional()
    .or(z.literal('')),
  contactPhone: z.string().trim().optional(),
});

const detachmentSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a name for the detachment.'),
  address: z.string().trim().optional(),
});

export type FormState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

const blank = (v: string | undefined): string | null => (v && v.trim() !== '' ? v.trim() : null);

export async function createClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = clientSchema.safeParse({
    name: formData.get('name'),
    contactEmail: formData.get('contactEmail') ?? '',
    contactPhone: formData.get('contactPhone') ?? '',
  });

  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  try {
    const created = await clients.createClient({
      name: parsed.data.name,
      contactEmail: blank(parsed.data.contactEmail),
      contactPhone: blank(parsed.data.contactPhone),
      actorUserId: session.user.id,
    });
    revalidatePath('/clients');
    redirect(`/clients/${created.id}`);
  } catch (e) {
    // Next.js redirect() throws a special error we must let pass through.
    if (e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: unknown }).digest === 'string'
        && (e as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't add the client: ${message}` };
  }
}

export async function createDetachmentAction(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = detachmentSchema.safeParse({
    name: formData.get('name'),
    address: formData.get('address') ?? '',
  });

  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  try {
    await clients.createDetachment({
      clientId,
      name: parsed.data.name,
      address: blank(parsed.data.address),
      actorUserId: session.user.id,
    });
    revalidatePath(`/clients/${clientId}`);
    return { kind: 'success', message: 'Detachment added.' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `Couldn't add the detachment: ${message}` };
  }
}
