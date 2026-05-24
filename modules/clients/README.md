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
**Error:** `ERROR: update or delete on table "clients" violates foreign key constraint "detachments_client_id_..." on table "detachments"` (raw Postgres error — no wrapper yet)
**Trigger:** attempt to `DELETE` a client row while detachments exist (FK is `ON DELETE RESTRICT` by design — clients with detachments cannot be casually deleted).
**Fix:** delete or reassign detachments first. There is no `deleteClient` API in Slice 1; deletion is a future workflow.

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
