import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { clients, detachments, type Client, type Detachment, type NewClient, type NewDetachment } from './schema';
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
