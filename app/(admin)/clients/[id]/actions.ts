'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clients } from '@/modules/clients';
import { billing } from '@/modules/billing';
import { getSessionFromCookie } from '@/modules/auth';
import { plainMessage } from '../../_action-error';

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

// ─── Billing config action (Slice 4) ─────────────────────────────────────────

/**
 * Zod schema for the billing config form. ratePerManday is validated as a
 * string because Postgres numeric columns are returned as strings by Drizzle —
 * we keep it a string all the way through to avoid float rounding.
 */
const billingConfigSchema = z.object({
  ratePerManday: z
    .string()
    .trim()
    .min(1, 'Please enter the billing rate.')
    .regex(
      /^\d+(\.\d{1,2})?$/,
      'Rate must be a number with up to 2 decimal places (e.g. 500 or 1250.50).',
    )
    .refine((v) => parseFloat(v) > 0, 'Rate must be greater than zero.'),
  paymentTermsDays: z.coerce
    .number({ invalid_type_error: 'Payment terms must be a whole number of days.' })
    .int('Payment terms must be a whole number of days.')
    .positive('Payment terms must be at least 1 day.'),
  chargesVat: z.coerce.boolean(),
  clientWithholdsEwt: z.coerce.boolean(),
});

export type SaveBillingConfigResult =
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export async function saveBillingConfigAction(
  clientId: string,
  formData: FormData,
): Promise<SaveBillingConfigResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  const parsed = billingConfigSchema.safeParse({
    ratePerManday: formData.get('ratePerManday'),
    paymentTermsDays: formData.get('paymentTermsDays'),
    // Checkbox inputs are absent from FormData when unchecked — treat absence as false.
    chargesVat: formData.get('chargesVat') === 'on',
    clientWithholdsEwt: formData.get('clientWithholdsEwt') === 'on',
  });

  if (!parsed.success) {
    return {
      kind: 'error',
      message: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  try {
    await billing.setClientBillingConfig({
      clientId,
      ratePerManday: parsed.data.ratePerManday,
      paymentTermsDays: parsed.data.paymentTermsDays,
      chargesVat: parsed.data.chargesVat,
      clientWithholdsEwt: parsed.data.clientWithholdsEwt,
      actorUserId: session.user.id,
    });
    revalidatePath(`/clients/${clientId}`);
    return { kind: 'ok' };
  } catch (e) {
    return {
      kind: 'error',
      message: `We couldn't save the billing config. ${plainMessage(e)}`,
    };
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
