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
| `clients.createClient` | `(input: { name; contactEmail?; contactPhone?; defaultPayrollCalendarId?; actorUserId? }) => Promise<Client>` | Insert one client. Audits `clients.client.created` and publishes the same event. |
| `clients.getClient` | `(id) => Promise<Client \| null>` | Read by id. Returns `defaultPayrollCalendarId` if set. |
| `clients.updateClient` | `(id, patch, actorUserId?) => Promise<Client>` | Update mutable fields on a client. Immutable fields (`id`, `createdAt`) are silently stripped from the patch. Audits `clients.client.updated` with before/after snapshot and publishes the same event. Throws if `id` not found. |
| `clients.deleteClient` | `(id, opts?) => Promise<void>` | Hard-delete a client and its (empty) detachments within 5 minutes of `createdAt`. Detachments are deleted in the same transaction (FK is `ON DELETE RESTRICT`). Refuses to delete when any detachment under the client has an assignment. Audits `clients.client.deleted` with a `before` snapshot and `deletedDetachmentIds`, and publishes `clients.client.deleted`. Throws plain-language errors when the client doesn't exist, the window has passed, or the cascade would leave dangling assignments. |
| `clients.listClients` | `() => Promise<Client[]>` | All clients sorted by name. |
| `clients.listClientsWithDetachments` | `() => Promise<ClientWithDetachments[]>` | All clients with their detachments grouped in, sorted by name. Single query + in-memory grouping. |
| `clients.createDetachment` | `(input: { clientId; name; address?; requiredHeadcount?; actorUserId? }) => Promise<Detachment>` | Insert a detachment under a client. Audits `clients.detachment.created`. Throws plain-language error if `clientId` doesn't exist. |
| `clients.getDetachment` | `(id) => Promise<Detachment \| null>` | Read by id. |
| `clients.updateDetachment` | `(id, patch, actorUserId?) => Promise<Detachment>` | Update mutable fields on a detachment. Immutable fields (`id`, `createdAt`) are silently stripped from the patch. Audits `clients.detachment.updated` with before/after snapshot and publishes the same event. Throws if `id` not found. |
| `clients.listDetachments` | `(clientId) => Promise<Detachment[]>` | All detachments for a client, ordered by `createdAt`. |
| `clients.getDetachmentDeploymentSummary` | `(detachmentId) => Promise<DeploymentSummary>` | Point-in-time deployment summary for one detachment: `{ required, deployed, gap }`. `required` = `requiredHeadcount` (null if not set). `deployed` = active assignment count as of today. `gap` = `deployed - required` (null if required is null). Throws if detachment not found. |
| `clients.listDetachmentsWithDeployment` | `(clientId?) => Promise<DetachmentWithDeployment[]>` | All detachments (optionally filtered to one client) with `deployed` and `gap` fields appended. Single JOIN query — no N+1 regardless of detachment count. |

`Client`, `Detachment`, `NewClient`, `NewDetachment`, `DeploymentSummary`, `DetachmentWithDeployment`, `ClientWithDetachments` types are re-exported from the entry point.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** `@/modules/audit` (writes audit rows on every mutation), `@/modules/events` (publishes `clients.client.created`, `clients.client.updated`, `clients.detachment.created`, `clients.detachment.updated`).
- **Schema imports:** `@/modules/assignments/schema` (assignments table, for deployment count queries). This is a schema-only import — no circular service dependency.
- **Tables:** `clients`, `detachments`, `assignments` (read-only for deployment counts).
- **FKs:**
  - `detachments.client_id → clients.id ON DELETE RESTRICT`
  - `clients.default_payroll_calendar_id → payroll_calendars.id` — FK exists in SQL only. The Drizzle schema column deliberately omits `.references()` to avoid a forward-reference cycle (`payroll_calendars/schema.ts` already imports `clients`). The DB enforces the constraint; Drizzle does not.

## Known failure modes

### Detachment with non-existent `clientId`
**Error:** `Can't create the detachment — the client doesn't exist. (clientId: <uuid>)`
**Trigger:** `createDetachment` called with a `clientId` that has no matching `clients.id` (Postgres `23503` on the FK).
**Fix:** caller must create the client first, or pass an existing client id.

### Deleting a client that has detachments
**Error:** `ERROR: update or delete on table "clients" violates foreign key constraint "detachments_client_id_..." on table "detachments"` (raw Postgres error — only surfaces if a caller bypasses `deleteClient` and runs a raw SQL DELETE).
**Trigger:** raw `DELETE FROM clients WHERE id = …` while detachments exist (FK is `ON DELETE RESTRICT`).
**Fix:** use `clients.deleteClient` — it deletes detachments first in the same transaction. Outside the 5-minute window, deletion isn't supported (Archive comes in Slice 3+).

### deleteClient: outside the 5-minute window
**Error:** `The 5-minute delete window has passed. Use Archive instead (coming in a later slice).`
**Trigger:** `deleteClient` called more than 5 minutes after the client's `createdAt`.
**Fix:** this is the contract. Archive (soft-delete) is deferred to Slice 3+.

### deleteClient: detachment has assignments
**Error:** `Can't delete this client — one of its detachments already has employees assigned. (This shouldn't happen within 5 minutes of creation — let support know.)`
**Trigger:** any assignment row exists pointing at one of the client's detachments. The transaction is *not* started in this path — both client and detachment remain intact.
**Fix:** investigate how the assignment was created so quickly. Likely a bulk-import or test fixture race.

### deleteClient: client not found
**Error:** `[clients/deleteClient] client <id> not found`
**Trigger:** the UUID doesn't match any row.
**Fix:** the client may have already been deleted. Refresh the list.

### `updateClient` / `updateDetachment` on a missing id
**Error:** `[clients/updateClient] client <id> not found` / `[clients/updateDetachment] detachment <id> not found`
**Trigger:** `id` passed to an update function doesn't match any row.
**Fix:** verify the id exists (via `getClient` / `getDetachment`) before patching.

### `defaultPayrollCalendarId` FK violation
**Error:** `insert or update on table "clients" violates foreign key constraint "clients_default_payroll_calendar_id_fkey"`
**Trigger:** `updateClient` (or `createClient`) called with a `defaultPayrollCalendarId` that doesn't exist in `payroll_calendars`.
**Fix:** create the payroll calendar first (via `modules/payroll-calendars`), then link it to the client.
**Note in tests:** clean payroll_calendars *after* clients in `beforeEach` (FK order: assignments → detachments → clients → payroll_calendars → employees).

### Deployment count is point-in-time (today)
**Trigger:** `getDetachmentDeploymentSummary` and `listDetachmentsWithDeployment` both use the server's UTC date at call time as "today". They do not accept an `asOf` parameter.
**Historical queries:** "deployed count as of date X" is deferred to a later slice. For now, callers needing historical data must query `modules/assignments` directly.
