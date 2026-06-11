import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { clientBillingConfig, type ClientBillingConfig } from './schema';
import { audit } from '@/modules/audit';

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
