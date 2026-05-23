# modules/clients

## Purpose

Client + Detachment master. CGoC clients (e.g. SM Megamall) have one or more detachments (e.g. SM Megamall Gate 1, Gate 2). Guards are assigned to detachments via `modules/assignments`.

## Public API

Import from the module entry point only — never reach into `service.ts` directly.

```ts
import { clients, type Client, type Detachment } from '@/modules/clients';
```

| Function | Signature | What it does |
|---|---|---|
| `clients.createClient` | `(input: { name; contactEmail?; contactPhone?; actorUserId? }) => Promise<Client>` | Insert one client. Audits `clients.client.created` and publishes the same event. |
| `clients.createDetachment` | `(input: { clientId; name; address?; actorUserId? }) => Promise<Detachment>` | Insert a detachment under a client. Audits `clients.detachment.created`. Throws plain-language error if `clientId` doesn't exist. |
| `clients.getDetachment` | `(id) => Promise<Detachment \| null>` | Read by id. |
| `clients.listDetachments` | `(clientId) => Promise<Detachment[]>` | All detachments for a client, ordered by `createdAt`. |

`Client`, `Detachment`, `NewClient`, `NewDetachment` types are re-exported from the entry point.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** `@/modules/audit` (writes audit rows on every mutation), `@/modules/events` (publishes `clients.client.created` and `clients.detachment.created`).
- **Tables:** `clients`, `detachments` (FK `detachments.client_id → clients.id ON DELETE RESTRICT`).

## Known failure modes

### Detachment with non-existent `clientId`
**Error:** `Can't create the detachment — the client doesn't exist. (clientId: <uuid>)`
**Trigger:** `createDetachment` called with a `clientId` that has no matching `clients.id` (Postgres `23503` on the FK).
**Fix:** caller must create the client first, or pass an existing client id.

### Deleting a client that has detachments
**Error:** `ERROR: update or delete on table "clients" violates foreign key constraint "detachments_client_id_..." on table "detachments"` (raw Postgres error — no wrapper yet)
**Trigger:** attempt to `DELETE` a client row while detachments exist (FK is `ON DELETE RESTRICT` by design — clients with detachments cannot be casually deleted).
**Fix:** delete or reassign detachments first. There is no `deleteClient` API in Slice 1; deletion is a future workflow.
