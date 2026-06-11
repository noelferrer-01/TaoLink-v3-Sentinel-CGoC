import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import {
  clientBillingConfig,
  billingInvoices,
  billingInvoiceLines,
  type ClientBillingConfig,
  type BillingInvoice,
  type BillingInvoiceLine,
} from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { payRuns, payslips } from '@/modules/payroll/schema';
import { billedDaysByEmployeeDetachment } from '@/modules/dtr';

// Placeholder-grade money rounding (contract §7.11).
// Uses standard banker-adjacent rounding; replace with a money library before go-live.
const round2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillingInvoiceWithLines = BillingInvoice & { lines: BillingInvoiceLine[] };

// ─── setClientBillingConfig ───────────────────────────────────────────────────

export type SetClientBillingConfigInput = {
  clientId: string;
  ratePerManday: string;
  paymentTermsDays?: number;
  chargesVat?: boolean;
  clientWithholdsEwt?: boolean;
  actorUserId?: string | null;
};

/**
 * Upsert billing configuration for a client. If no row exists for the client,
 * one is inserted; if one already exists, rate/terms/flags and updatedAt are
 * updated. Returns the persisted row.
 *
 * Audit: records `billing.config.updated` with `{ clientId }` only — no PII
 * (client names, rates are not sensitive but names must not appear here).
 */
export async function setClientBillingConfig(
  input: SetClientBillingConfigInput,
): Promise<ClientBillingConfig> {
  const {
    clientId,
    ratePerManday,
    paymentTermsDays,
    chargesVat,
    clientWithholdsEwt,
    actorUserId,
  } = input;

  try {
    const db = getDb();
    const now = new Date();

    const values: typeof clientBillingConfig.$inferInsert = {
      clientId,
      ratePerManday,
      ...(paymentTermsDays !== undefined && { paymentTermsDays }),
      ...(chargesVat !== undefined && { chargesVat }),
      ...(clientWithholdsEwt !== undefined && { clientWithholdsEwt }),
    };

    const [row] = await db
      .insert(clientBillingConfig)
      .values(values)
      .onConflictDoUpdate({
        target: clientBillingConfig.clientId,
        set: {
          ratePerManday,
          ...(paymentTermsDays !== undefined && { paymentTermsDays }),
          ...(chargesVat !== undefined && { chargesVat }),
          ...(clientWithholdsEwt !== undefined && { clientWithholdsEwt }),
          updatedAt: now,
        },
      })
      .returning();

    // Audit: payload contains only the target identifier — no client name or
    // financial PII that would outlive a potential client redaction.
    await audit.record({
      actor: actorUserId ?? null,
      action: 'billing.config.updated',
      target: { kind: 'client_billing_config', id: clientId },
      payload: { clientId },
    });

    return row!;
  } catch (err) {
    // Re-throw with module context prefix so the caller can locate the failure.
    throw new Error(
      `[billing/setClientBillingConfig] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

// ─── getClientBillingConfig ───────────────────────────────────────────────────

/**
 * Return the billing configuration for a client, or null if none has been set.
 */
export async function getClientBillingConfig(
  clientId: string,
): Promise<ClientBillingConfig | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(clientBillingConfig)
    .where(eq(clientBillingConfig.clientId, clientId))
    .limit(1);

  return rows[0] ?? null;
}

// ─── getInvoiceWithLines ──────────────────────────────────────────────────────

/**
 * Return an invoice with its lines (ordered by employeeCodeSnapshot ascending),
 * or null if the invoice does not exist.
 */
export async function getInvoiceWithLines(
  invoiceId: string,
): Promise<BillingInvoiceWithLines | null> {
  const db = getDb();

  const [invoice] = await db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.id, invoiceId))
    .limit(1);

  if (!invoice) return null;

  const lines = await db
    .select()
    .from(billingInvoiceLines)
    .where(eq(billingInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(billingInvoiceLines.employeeCodeSnapshot));

  return { ...invoice, lines };
}

// ─── generateInvoice ─────────────────────────────────────────────────────────

/**
 * Turn a client + billing period into a draft Statement of Account.
 *
 * Prerequisites (enforced by hard throws):
 *   1. A pay run for the period must exist (reconciliation baseline).
 *   2. A billing rate must be configured for the client.
 *
 * Guards:
 *   - If a draft invoice already exists it is wiped and recomputed (idempotent).
 *   - If the invoice is finalized the function refuses (cannot regenerate).
 *   - If any guard's billed days at this client exceed their payslip daysWorked
 *     the function refuses with a local-check error.
 *
 * Audit: records `billing.invoice.generated` with { clientId, periodStart,
 * periodEnd, subtotal, totalDue } — no guard names or PII in the payload.
 *
 * VAT: 12% on subtotal when chargesVat=true (placeholder, contract §7.9).
 * EWT: 2% on subtotal when clientWithholdsEwt=true (placeholder, contract §7.9).
 * Total = subtotal + vat - ewt.
 */
export async function generateInvoice(
  clientId: string,
  period: { start: string; end: string },
  opts: { actorUserId?: string | null } = {},
): Promise<BillingInvoiceWithLines> {
  try {
    const db = getDb();

    // ── Guard 1: period's payroll must have run ───────────────────────────────
    const [run] = await db
      .select()
      .from(payRuns)
      .where(
        and(
          eq(payRuns.periodStart, period.start),
          eq(payRuns.periodEnd, period.end),
        ),
      )
      .limit(1);

    if (!run) {
      throw new Error(
        '[billing/generateInvoice] no pay run for this period — run payroll first',
      );
    }

    // ── Guard 2: billing rate must be configured ──────────────────────────────
    const cfg = await getClientBillingConfig(clientId);
    if (!cfg) {
      throw new Error(
        '[billing/generateInvoice] set a billing rate for this client first',
      );
    }

    // ── Existing invoice check ────────────────────────────────────────────────
    const [existing] = await db
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.clientId, clientId),
          eq(billingInvoices.periodStart, period.start),
          eq(billingInvoices.periodEnd, period.end),
        ),
      )
      .limit(1);

    if (existing && existing.status !== 'draft') {
      throw new Error(
        '[billing/generateInvoice] invoice already finalized — cannot regenerate',
      );
    }

    // Upsert the invoice row; wipe prior lines if re-generating.
    const invoice =
      existing ??
      (
        await db
          .insert(billingInvoices)
          .values({ clientId, periodStart: period.start, periodEnd: period.end })
          .returning()
      )[0]!;

    if (existing) {
      await db
        .delete(billingInvoiceLines)
        .where(eq(billingInvoiceLines.invoiceId, invoice.id));
    }

    // ── Pull billed days from DTR (frozen assignment stamp) ───────────────────
    const billed = await billedDaysByEmployeeDetachment(
      clientId,
      period.start,
      period.end,
    );

    // ── Local sanity check: billed days per guard ≤ payslip daysWorked ────────
    const slipRows = await db
      .select({ employeeId: payslips.employeeId, d: payslips.daysWorked })
      .from(payslips)
      .where(eq(payslips.payRunId, run.id));

    const slipDays = new Map(slipRows.map((r) => [r.employeeId, Number(r.d)]));

    // Aggregate total billed days across all detachments for each guard.
    const perGuard = new Map<string, number>();
    for (const b of billed) {
      perGuard.set(b.employeeId, (perGuard.get(b.employeeId) ?? 0) + b.days);
    }

    for (const [empId, days] of perGuard) {
      if (days > (slipDays.get(empId) ?? 0)) {
        throw new Error(
          '[billing/generateInvoice] billed days exceeds payroll for a guard — re-run payroll for this period',
        );
      }
    }

    // ── Insert invoice lines ──────────────────────────────────────────────────
    const rate = Number(cfg.ratePerManday);
    let subtotalNum = 0;

    for (const b of billed) {
      const amount = b.days * rate;
      subtotalNum += amount;
      await db.insert(billingInvoiceLines).values({
        invoiceId: invoice.id,
        employeeId: b.employeeId,
        employeeCodeSnapshot: b.employeeCode,
        employeeNameSnapshot: `${b.lastName}, ${b.firstName}`,
        detachmentId: b.detachmentId,
        detachmentNameSnapshot: b.detachmentName,
        daysWorked: b.days,
        ratePerManday: cfg.ratePerManday,
        amount: round2(amount),
      });
    }

    // ── Compute totals ────────────────────────────────────────────────────────
    // VAT 12% on subtotal (placeholder — contract §7.9)
    const vat = cfg.chargesVat ? Number(round2(subtotalNum * 0.12)) : 0;
    // EWT 2% on subtotal (placeholder — contract §7.9)
    const ewt = cfg.clientWithholdsEwt ? Number(round2(subtotalNum * 0.02)) : 0;
    const totalDue = subtotalNum + vat - ewt;

    const [updated] = await db
      .update(billingInvoices)
      .set({
        subtotal: round2(subtotalNum),
        vatAmount: round2(vat),
        ewtAmount: round2(ewt),
        totalDue: round2(totalDue),
        generatedAt: new Date(),
      })
      .where(eq(billingInvoices.id, invoice.id))
      .returning();

    // ── Audit (no PII) ────────────────────────────────────────────────────────
    await audit.record({
      actor: opts.actorUserId ?? null,
      action: 'billing.invoice.generated',
      target: { kind: 'billing_invoice', id: invoice.id },
      payload: {
        clientId,
        periodStart: period.start,
        periodEnd: period.end,
        subtotal: updated!.subtotal,
        totalDue: updated!.totalDue,
      },
    });

    // ── Event ─────────────────────────────────────────────────────────────────
    await events.publish('billing.invoice.generated', {
      invoiceId: invoice.id,
      clientId,
    });

    return getInvoiceWithLines(invoice.id) as Promise<BillingInvoiceWithLines>;
  } catch (err) {
    // Pass-through our own explicit guard errors (they already have correct
    // prefixes and messages that the test regexes match).
    if (err instanceof Error && err.message.startsWith('[billing/generateInvoice]')) {
      throw err;
    }
    // Wrap unexpected errors with module context.
    throw new Error(
      `[billing/generateInvoice] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
