import { eq, inArray, and, lte, gte, or, isNull, count } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { isWithinUndoWindow } from '@/core/time';
import { clients, detachments, type Client, type Detachment, type NewClient, type NewDetachment } from './schema';
import { assignments } from '@/modules/assignments/schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';

export async function createClient(
  input: Omit<NewClient, 'id' | 'createdAt'> & { actorUserId?: string | null },
): Promise<Client> {
  const db = getDb();
  const { actorUserId, ...row } = input;
  const [created] = await db.insert(clients).values(row).returning();
  if (!created) throw new Error('[clients/createClient] insert returned no row');
  await audit.record({
    actor: actorUserId ?? null,
    action: 'clients.client.created',
    target: { kind: 'client', id: created.id },
    payload: { name: created.name },
  });
  await events.publish('clients.client.created', { id: created.id, name: created.name });
  return created;
}

export async function createDetachment(
  input: Omit<NewDetachment, 'id' | 'createdAt'> & { actorUserId?: string | null },
): Promise<Detachment> {
  const db = getDb();
  const { actorUserId, ...row } = input;
  try {
    const [created] = await db.insert(detachments).values(row).returning();
    if (!created) throw new Error('[clients/createDetachment] insert returned no row');
    await audit.record({
      actor: actorUserId ?? null,
      action: 'clients.detachment.created',
      target: { kind: 'detachment', id: created.id },
      payload: { clientId: created.clientId, name: created.name },
    });
    await events.publish('clients.detachment.created', {
      id: created.id,
      clientId: created.clientId,
      name: created.name,
    });
    return created;
  } catch (e: any) {
    // Postgres FK violation on detachments_client_id_clients_id_fk → plain-language wrapper
    if (e.code === '23503' && /client_id/.test(e.detail ?? '')) {
      throw new Error(
        `Can't create the detachment — the client doesn't exist. (clientId: ${row.clientId})`,
      );
    }
    throw new Error(`[clients/createDetachment] ${e.message ?? e}`);
  }
}

export async function getClient(id: string): Promise<Client | null> {
  const db = getDb();
  const rows = await db.select().from(clients).where(eq(clients.id, id));
  return rows[0] ?? null;
}

export async function listClients(): Promise<Client[]> {
  const db = getDb();
  return db.select().from(clients).orderBy(clients.name);
}

export type ClientWithDetachments = {
  id: string;
  name: string;
  detachments: { id: string; name: string }[];
};

// Used by /assignments to populate the detachment dropdown (grouped under
// client via <optgroup>). Single query + in-memory grouping.
export async function listClientsWithDetachments(): Promise<ClientWithDetachments[]> {
  const db = getDb();
  const rows = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      detachmentId: detachments.id,
      detachmentName: detachments.name,
    })
    .from(clients)
    .leftJoin(detachments, eq(detachments.clientId, clients.id))
    .orderBy(clients.name, detachments.name);

  const grouped = new Map<string, ClientWithDetachments>();
  for (const r of rows) {
    let entry = grouped.get(r.clientId);
    if (!entry) {
      entry = { id: r.clientId, name: r.clientName, detachments: [] };
      grouped.set(r.clientId, entry);
    }
    if (r.detachmentId && r.detachmentName) {
      entry.detachments.push({ id: r.detachmentId, name: r.detachmentName });
    }
  }
  return Array.from(grouped.values());
}

// ─── Update client ────────────────────────────────────────────────────────────

/** Fields that must never change after creation. Stripped silently from the patch. */
const CLIENT_IMMUTABLE = ['id', 'createdAt'] as const;

type UpdateClientPatch = Partial<Omit<Client, 'id' | 'createdAt'>>;

export async function updateClient(
  id: string,
  patch: UpdateClientPatch,
  actorUserId?: string | null,
): Promise<Client> {
  const db = getDb();

  // Sanitise: strip immutable keys
  const safePatch = { ...patch } as Record<string, unknown>;
  for (const field of CLIENT_IMMUTABLE) {
    delete safePatch[field];
  }

  const before = await getClient(id);
  if (!before) throw new Error(`[clients/updateClient] client ${id} not found`);

  const [updated] = await db
    .update(clients)
    .set(safePatch)
    .where(eq(clients.id, id))
    .returning();
  if (!updated) throw new Error(`[clients/updateClient] update returned no row for ${id}`);

  const changedFields = Object.keys(safePatch).filter(
    (k) => (before as Record<string, unknown>)[k] !== (updated as Record<string, unknown>)[k],
  );

  await audit.record({
    actor: actorUserId ?? null,
    action: 'clients.client.updated',
    target: { kind: 'client', id },
    payload: {
      before: Object.fromEntries(changedFields.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after:  Object.fromEntries(changedFields.map((k) => [k, (updated as Record<string, unknown>)[k]])),
      changedFields,
    },
  });
  await events.publish('clients.client.updated', { id, changedFields });
  return updated;
}

// ─── Update detachment ────────────────────────────────────────────────────────

/** Fields that must never change after creation. Stripped silently from the patch. */
const DETACHMENT_IMMUTABLE = ['id', 'createdAt'] as const;

type UpdateDetachmentPatch = Partial<Omit<Detachment, 'id' | 'createdAt'>>;

export async function updateDetachment(
  id: string,
  patch: UpdateDetachmentPatch,
  actorUserId?: string | null,
): Promise<Detachment> {
  const db = getDb();

  // Sanitise: strip immutable keys
  const safePatch = { ...patch } as Record<string, unknown>;
  for (const field of DETACHMENT_IMMUTABLE) {
    delete safePatch[field];
  }

  const before = await getDetachment(id);
  if (!before) throw new Error(`[clients/updateDetachment] detachment ${id} not found`);

  const [updated] = await db
    .update(detachments)
    .set(safePatch)
    .where(eq(detachments.id, id))
    .returning();
  if (!updated) throw new Error(`[clients/updateDetachment] update returned no row for ${id}`);

  const changedFields = Object.keys(safePatch).filter(
    (k) => (before as Record<string, unknown>)[k] !== (updated as Record<string, unknown>)[k],
  );

  await audit.record({
    actor: actorUserId ?? null,
    action: 'clients.detachment.updated',
    target: { kind: 'detachment', id },
    payload: {
      before: Object.fromEntries(changedFields.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after:  Object.fromEntries(changedFields.map((k) => [k, (updated as Record<string, unknown>)[k]])),
      changedFields,
    },
  });
  await events.publish('clients.detachment.updated', { id, changedFields });
  return updated;
}

export async function getDetachment(id: string): Promise<Detachment | null> {
  const db = getDb();
  const rows = await db.select().from(detachments).where(eq(detachments.id, id));
  return rows[0] ?? null;
}

export async function listDetachments(clientId: string): Promise<Detachment[]> {
  const db = getDb();
  return db
    .select()
    .from(detachments)
    .where(eq(detachments.clientId, clientId))
    .orderBy(detachments.createdAt);
}

// ─── Delete client (5-minute window) ──────────────────────────────────────────

/**
 * Hard-deletes a client and any (still-empty) detachments under it. Only
 * allowed within 5 minutes of `createdAt` — older clients should be archived
 * instead (Slice 3+). Wraps detachment + client deletion in a transaction so
 * either both succeed or neither does.
 *
 * Throws plain-language errors for:
 *   - not-found
 *   - outside-window (5 min since createdAt)
 *   - any detachment under this client has an assignment
 */
export async function deleteClient(
  id: string,
  opts: { actorUserId?: string | null } = {},
): Promise<void> {
  const db = getDb();
  const [before, childDetachments] = await Promise.all([
    getClient(id),
    listDetachments(id),
  ]);
  if (!before) throw new Error(`[clients/deleteClient] client ${id} not found`);

  if (!isWithinUndoWindow(before.createdAt)) {
    throw new Error(
      'The 5-minute delete window has passed. Use Archive instead (coming in a later slice).',
    );
  }

  const detachmentIds = childDetachments.map((d) => d.id);

  if (detachmentIds.length > 0) {
    const rows = await db
      .select({ assignmentCount: count() })
      .from(assignments)
      .where(inArray(assignments.detachmentId, detachmentIds));
    const assignmentCount = Number(rows[0]?.assignmentCount ?? 0);
    if (assignmentCount > 0) {
      throw new Error(
        "Can't delete this client — one of its detachments already has employees assigned. " +
          "(This shouldn't happen within 5 minutes of creation — let support know.)",
      );
    }
  }

  await db.transaction(async (tx) => {
    if (detachmentIds.length > 0) {
      await tx.delete(detachments).where(eq(detachments.clientId, id));
    }
    await tx.delete(clients).where(eq(clients.id, id));
  });

  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'clients.client.deleted',
    target: { kind: 'client', id },
    payload: {
      before: {
        id: before.id,
        name: before.name,
        contactEmail: before.contactEmail,
        contactPhone: before.contactPhone,
        defaultPayrollCalendarId: before.defaultPayrollCalendarId,
        createdAt: before.createdAt.toISOString(),
      },
      deletedDetachmentIds: detachmentIds,
    },
  });
  await events.publish('clients.client.deleted', { id, name: before.name });
}

// ─── Deployment summary ───────────────────────────────────────────────────────

export type DeploymentSummary = {
  required: number | null;  // requiredHeadcount from the detachment row; null = not set
  deployed: number;         // active assignments for this detachment as of today
  gap: number | null;       // deployed - required; null if required is null
};

/**
 * Returns a point-in-time (today) deployment summary for a single detachment.
 * Two DB round-trips: one for the detachment row, one for the active-assignment count.
 * "Today" is the server's UTC date at call time.
 */
export async function getDetachmentDeploymentSummary(
  detachmentId: string,
): Promise<DeploymentSummary> {
  const db = getDb();

  const det = await getDetachment(detachmentId);
  if (!det) throw new Error(`[clients/getDetachmentDeploymentSummary] detachment ${detachmentId} not found`);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [row] = await db
    .select({ deployed: count() })
    .from(assignments)
    .where(
      and(
        eq(assignments.detachmentId, detachmentId),
        lte(assignments.startDate, today),
        or(isNull(assignments.endDate), gte(assignments.endDate, today)),
      ),
    );

  const deployed = Number(row?.deployed ?? 0);
  const required = det.requiredHeadcount ?? null;
  return {
    required,
    deployed,
    gap: required !== null ? deployed - required : null,
  };
}

// ─── List detachments with deployment counts (single query, no N+1) ───────────

export type DetachmentWithDeployment = Detachment & {
  deployed: number;
  gap: number | null;
};

/**
 * Returns all detachments (optionally filtered to one client) with their
 * active-assignment count and gap vs requiredHeadcount. Single JOIN query —
 * no N+1 regardless of detachment count.
 *
 * "Active" means: startDate <= today AND (endDate IS NULL OR endDate >= today).
 * This is a point-in-time snapshot; historical as-of queries are deferred to a later slice.
 */
export async function listDetachmentsWithDeployment(
  clientId?: string,
): Promise<DetachmentWithDeployment[]> {
  const db = getDb();

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Sub-select: count active assignments per detachment as of today
  const activeCountsSq = db
    .select({
      detachmentId: assignments.detachmentId,
      deployedCount: count().as('deployed_count'),
    })
    .from(assignments)
    .where(
      and(
        lte(assignments.startDate, today),
        or(isNull(assignments.endDate), gte(assignments.endDate, today)),
      ),
    )
    .groupBy(assignments.detachmentId)
    .as('active_counts');

  const rows = await db
    .select({
      id: detachments.id,
      clientId: detachments.clientId,
      name: detachments.name,
      address: detachments.address,
      requiredHeadcount: detachments.requiredHeadcount,
      createdAt: detachments.createdAt,
      deployedCount: activeCountsSq.deployedCount,
    })
    .from(detachments)
    .leftJoin(activeCountsSq, eq(activeCountsSq.detachmentId, detachments.id))
    .where(clientId ? eq(detachments.clientId, clientId) : undefined)
    .orderBy(detachments.createdAt);

  return rows.map((r) => {
    const deployed = Number(r.deployedCount ?? 0);
    const required = r.requiredHeadcount ?? null;
    return {
      id: r.id,
      clientId: r.clientId,
      name: r.name,
      address: r.address,
      requiredHeadcount: r.requiredHeadcount,
      createdAt: r.createdAt,
      deployed,
      gap: required !== null ? deployed - required : null,
    };
  });
}
