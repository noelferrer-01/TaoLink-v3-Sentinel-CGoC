import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/core/db';
import {
  clientBillingConfig,
  billingInvoices,
  billingInvoiceLines,
  billingSoaCounters,
  type ClientBillingConfig,
  type BillingInvoice,
  type BillingInvoiceLine,
} from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { payRuns, payslips } from '@/modules/payroll/schema';
import { billedDaysByEmployeeDetachment, listUnattributedWorkedDays as dtrListUnattributed } from '@/modules/dtr';
import { employees } from '@/modules/hr/schema';

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

// ─── finalizeInvoice ─────────────────────────────────────────────────────────

/**
 * Finalize a draft invoice: assign a gapless, concurrency-safe SOA number
 * (format YYYY-NNNN where YYYY = year of periodEnd) and flip status to
 * 'finalized'. The counter increment and the status update commit together
 * in a transaction — if the transaction rolls back, the counter rolls back
 * too, preserving the gapless invariant.
 *
 * Guards:
 *   - Invoice must be a draft (throws "already finalized" otherwise).
 *   - Invoice must have at least one line (throws "no lines" otherwise).
 *
 * Audit: records `billing.invoice.finalized` with { soaNumber, totalDue }.
 */
export async function finalizeInvoice(
  invoiceId: string,
  opts: { actorUserId?: string | null } = {},
): Promise<BillingInvoice> {
  return getDb().transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(billingInvoices)
      .where(eq(billingInvoices.id, invoiceId))
      .limit(1);

    if (!inv) {
      throw new Error(`[billing/finalizeInvoice] no invoice ${invoiceId}`);
    }
    if (inv.status !== 'draft') {
      // Status-aware so a paid invoice doesn't report "already finalized".
      throw new Error(
        `[billing/finalizeInvoice] invoice is already ${inv.status} — only a draft can be finalized`,
      );
    }

    const lineCountRows = await tx
      .select({ n: count() })
      .from(billingInvoiceLines)
      .where(eq(billingInvoiceLines.invoiceId, invoiceId));

    if (Number(lineCountRows[0]?.n ?? 0) === 0) {
      throw new Error(
        '[billing/finalizeInvoice] invoice has no lines — generate it first',
      );
    }

    // Extract year from periodEnd (YYYY-MM-DD string).
    const year = Number(inv.periodEnd.slice(0, 4));

    // Atomically allocate the next sequence number for this year.
    // INSERT path: first invoice of the year → inserts (year, 2), returns seq=1
    // CONFLICT path: subsequent invoices → increments next_value by 1, returns (old next_value)
    // Because the counter row is locked for this transaction, concurrent
    // transactions queue behind it — gapless under rollback too.
    const counterRows = await tx.execute<{ seq: number }>(sql`
      INSERT INTO billing_soa_counters (year, next_value)
        VALUES (${year}, 2)
      ON CONFLICT (year) DO UPDATE
        SET next_value = billing_soa_counters.next_value + 1
      RETURNING next_value - 1 AS seq
    `);

    const seq = Number((counterRows as unknown as Array<{ seq: number }>)[0]!.seq);
    const soaNumber = `${year}-${String(seq).padStart(4, '0')}`;

    const [done] = await tx
      .update(billingInvoices)
      .set({ status: 'finalized', soaNumber, finalizedAt: new Date() })
      .where(eq(billingInvoices.id, invoiceId))
      .returning();

    await audit.record({
      actor: opts.actorUserId ?? null,
      action: 'billing.invoice.finalized',
      target: { kind: 'billing_invoice', id: invoiceId },
      payload: { soaNumber, totalDue: done!.totalDue },
    });

    return done!;
  });
}

// ─── reconcilePeriod ─────────────────────────────────────────────────────────

/**
 * Period-wide billing↔payroll reconciliation.
 *
 * Identity: for each guard paid in the period,
 *   (Σ billed days across ALL period invoices) + (unattributed worked days) === payslip.daysWorked
 *
 * A mismatch means the DTR changed after payroll ran (or billing lines haven't
 * been generated yet). Returns only the rows that fail — guards that balance
 * are omitted. Returns [] if no pay run exists for the period (caller decides
 * what that means; nothing was paid so there's nothing to check against).
 *
 * @param period - { start, end } matching the pay run's periodStart/periodEnd (YYYY-MM-DD)
 */
export type ReconcileMismatch = {
  employeeId: string;
  employeeCode: string;
  billed: number;
  unattributed: number;
  payslipDays: number;
};

export async function reconcilePeriod(
  period: { start: string; end: string },
): Promise<ReconcileMismatch[]> {
  try {
    const db = getDb();

    // 1. Find the pay run for this period; if none, return [] — nothing was paid
    //    to reconcile against.
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

    if (!run) return [];

    // 2. Payslip days per employee for that run — these employees are the universe to check.
    const slipRows = await db
      .select({ employeeId: payslips.employeeId, daysWorked: payslips.daysWorked })
      .from(payslips)
      .where(eq(payslips.payRunId, run.id));

    if (slipRows.length === 0) return [];

    const employeeIds = slipRows.map(r => r.employeeId);

    // 3. Billed days per employee across ALL invoices for the period.
    //    Join lines → invoices; filter by period dates; sum days per employee.
    const billedRows = await db
      .select({
        employeeId: billingInvoiceLines.employeeId,
        totalBilled: sql<number>`COALESCE(SUM(${billingInvoiceLines.daysWorked}), 0)::int`,
      })
      .from(billingInvoiceLines)
      .innerJoin(billingInvoices, eq(billingInvoices.id, billingInvoiceLines.invoiceId))
      .where(
        and(
          eq(billingInvoices.periodStart, period.start),
          eq(billingInvoices.periodEnd, period.end),
          inArray(billingInvoiceLines.employeeId, employeeIds),
        ),
      )
      .groupBy(billingInvoiceLines.employeeId);

    const billedMap = new Map(billedRows.map(r => [r.employeeId, Number(r.totalBilled)]));

    // 4. Unattributed worked days per employee in the period.
    //    Call the dtr reader and tally per employeeId in JS (simple, correct at this scale).
    const unattributedRows = await dtrListUnattributed(period.start, period.end);
    const unattributedMap = new Map<string, number>();
    for (const row of unattributedRows) {
      unattributedMap.set(row.employeeId, (unattributedMap.get(row.employeeId) ?? 0) + 1);
    }

    // 5. Fetch employeeCode for mismatch rows — only pull codes for employees
    //    that actually appear in the payslip set.
    const codeRows = await db
      .select({ id: employees.id, employeeCode: employees.employeeCode })
      .from(employees)
      .where(inArray(employees.id, employeeIds));
    const codeMap = new Map(codeRows.map(r => [r.id, r.employeeCode]));

    // 6. For each employee in the payslip set, check if billed+unattributed === payslipDays.
    const mismatches: ReconcileMismatch[] = [];
    for (const slip of slipRows) {
      const payslipDays = Number(slip.daysWorked);
      const billed = billedMap.get(slip.employeeId) ?? 0;
      const unattributed = unattributedMap.get(slip.employeeId) ?? 0;
      if (billed + unattributed !== payslipDays) {
        mismatches.push({
          employeeId: slip.employeeId,
          employeeCode: codeMap.get(slip.employeeId) ?? '',
          billed,
          unattributed,
          payslipDays,
        });
      }
    }

    return mismatches;
  } catch (err) {
    throw new Error(
      `[billing/reconcilePeriod] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

// ─── listUnattributedWorkedDays ───────────────────────────────────────────────

/**
 * Return worked DTR rows with no billing attribution (assignmentId IS NULL)
 * for the given period. Delegates to the dtr reader unchanged.
 */
export async function listUnattributedWorkedDays(
  period: { start: string; end: string },
) {
  return dtrListUnattributed(period.start, period.end);
}

// ─── listInvoices ─────────────────────────────────────────────────────────────

/**
 * Return billing invoices, optionally filtered by clientId and/or status.
 * Ordered newest period first (periodStart DESC, createdAt DESC).
 */
export async function listInvoices(
  filter: { clientId?: string; status?: 'draft' | 'finalized' | 'paid' } = {},
): Promise<BillingInvoice[]> {
  try {
    const db = getDb();

    const conditions = [];
    if (filter.clientId) {
      conditions.push(eq(billingInvoices.clientId, filter.clientId));
    }
    if (filter.status) {
      conditions.push(eq(billingInvoices.status, filter.status));
    }

    return db
      .select()
      .from(billingInvoices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(billingInvoices.periodStart), desc(billingInvoices.createdAt));
  } catch (err) {
    throw new Error(
      `[billing/listInvoices] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

// ─── markPaid ────────────────────────────────────────────────────────────────

/**
 * Mark a finalized invoice as paid. Draft invoices are rejected — callers
 * must finalize first.
 *
 * Audit: records `billing.invoice.paid` with { soaNumber }.
 */
export async function markPaid(
  invoiceId: string,
  opts: { actorUserId?: string | null } = {},
): Promise<BillingInvoice> {
  try {
    const db = getDb();

    const [inv] = await db
      .select()
      .from(billingInvoices)
      .where(eq(billingInvoices.id, invoiceId))
      .limit(1);

    if (!inv) {
      throw new Error(`[billing/markPaid] no invoice ${invoiceId}`);
    }
    if (inv.status === 'paid') {
      throw new Error('[billing/markPaid] this invoice is already marked paid');
    }
    if (inv.status !== 'finalized') {
      throw new Error('[billing/markPaid] finalize the invoice before marking it paid');
    }

    const [done] = await db
      .update(billingInvoices)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(billingInvoices.id, invoiceId))
      .returning();

    await audit.record({
      actor: opts.actorUserId ?? null,
      action: 'billing.invoice.paid',
      target: { kind: 'billing_invoice', id: invoiceId },
      payload: { soaNumber: done!.soaNumber },
    });

    return done!;
  } catch (err) {
    // Pass-through our own explicit guard errors (they already carry the correct
    // prefix and message that test regexes match against).
    if (err instanceof Error && err.message.startsWith('[billing/markPaid]')) {
      throw err;
    }
    // Wrap unexpected errors with module context.
    throw new Error(
      `[billing/markPaid] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
