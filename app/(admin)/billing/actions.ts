'use server';

import { revalidatePath } from 'next/cache';
import { billing } from '@/modules/billing';
import { dtr } from '@/modules/dtr';
import { getSessionFromCookie } from '@/modules/auth';
import { plainMessage } from '../_action-error';

/**
 * Server actions for the Billing area (Slice 4, Task 9 UI).
 *
 * Every action follows the shipped pattern (see clients/[id]/actions.ts):
 *   1. session guard → typed error result, never an exception that hits the overlay
 *   2. try/catch around the service call, passing actorUserId
 *   3. strip the `[module/fn]` bracket prefix from thrown messages — the remainder
 *      is already clerk-friendly (e.g. "no pay run for this period — run payroll first")
 *   4. revalidatePath so the list/detail re-renders with fresh data
 *
 * The result union is `{ kind: 'ok', ... } | { kind: 'error'; message: string }`;
 * client components render the error inline (no Next error overlay).
 */

const SESSION_EXPIRED = {
  kind: 'error' as const,
  message: 'Your session expired. Please sign in again.',
};

// ─── Generate ─────────────────────────────────────────────────────────────────

export type GenerateInvoiceResult =
  | { kind: 'ok'; invoiceId: string }
  | { kind: 'error'; message: string };

/**
 * Generate a draft SOA for one client + one pay-run period. Returns the
 * invoice id so the client can route to `/billing/[invoiceId]`. If a draft
 * already exists for that client+period the engine wipes its lines and
 * recomputes them from current DTR (idempotent regenerate, same invoice id);
 * a finalized invoice is refused.
 */
export async function generateInvoiceAction(
  clientId: string,
  start: string,
  end: string,
): Promise<GenerateInvoiceResult> {
  const session = await getSessionFromCookie();
  if (!session) return SESSION_EXPIRED;

  try {
    const invoice = await billing.generateInvoice(
      clientId,
      { start, end },
      { actorUserId: session.user.id },
    );
    revalidatePath('/billing');
    return { kind: 'ok', invoiceId: invoice.id };
  } catch (e) {
    return { kind: 'error', message: plainMessage(e) };
  }
}

// ─── Finalize ─────────────────────────────────────────────────────────────────

export type InvoiceActionResult =
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

/** Finalize a draft SOA — assigns the gapless SOA number. Draft-only (engine-enforced). */
export async function finalizeInvoiceAction(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const session = await getSessionFromCookie();
  if (!session) return SESSION_EXPIRED;

  try {
    await billing.finalizeInvoice(invoiceId, { actorUserId: session.user.id });
    revalidatePath('/billing');
    revalidatePath(`/billing/${invoiceId}`);
    return { kind: 'ok' };
  } catch (e) {
    return { kind: 'error', message: plainMessage(e) };
  }
}

// ─── Mark paid ────────────────────────────────────────────────────────────────

/** Mark a finalized SOA as paid. Finalized-only (engine-enforced). */
export async function markPaidAction(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const session = await getSessionFromCookie();
  if (!session) return SESSION_EXPIRED;

  try {
    await billing.markPaid(invoiceId, { actorUserId: session.user.id });
    revalidatePath('/billing');
    revalidatePath(`/billing/${invoiceId}`);
    return { kind: 'ok' };
  } catch (e) {
    return { kind: 'error', message: plainMessage(e) };
  }
}

// ─── Re-attribute an unattributed DTR day ──────────────────────────────────────

/**
 * Re-resolve the active posting for one unattributed worked day and stamp it,
 * making it billable. Throws via dtr when the guard still has no posting on
 * that date — surfaced inline as "still no active posting on that date — assign
 * the guard first".
 */
export async function reattributeDtrDayAction(
  dtrEntryId: string,
): Promise<InvoiceActionResult> {
  const session = await getSessionFromCookie();
  if (!session) return SESSION_EXPIRED;

  try {
    await dtr.reattributeDtrDay(dtrEntryId, { actorUserId: session.user.id });
    revalidatePath('/billing');
    return { kind: 'ok' };
  } catch (e) {
    return { kind: 'error', message: plainMessage(e) };
  }
}
