# modules/assignments

## Purpose

Tracks which employee is assigned to which detachment, when it started, when (if ever) it ended, and why. Per [ADR 0009](../../wiki/decisions/0009-hr-starter-and-recruitment-as-entry-point.md), this is the binding between `modules/hr` (the who) and `modules/clients` (the where).

**Caller, Slice 1:** super-admin via the assignments UI (Phase 8 of Slice 1). **Caller, Slice 3 onwards:** Recruitment owns these calls — same API, different UI. The API contract stays stable across the handoff.

## Public API

Import from the module entry point only — never reach into `service.ts` directly.

```ts
import { assignments, type Assignment } from '@/modules/assignments';
```

Note: the namespace export is called `assignments` (lowercase), the same name as the schema's table object. They live in different files (`./index.ts` vs `./schema.ts`) so there's no collision at import time.

| Function | Signature | What it does |
|---|---|---|
| `assignments.assign` | `(input: { employeeId, detachmentId, startDate, actorUserId? }) => Promise<Assignment>` | Create a new assignment. Throws plain-language error if the employee already has an active assignment covering `startDate`. Audits `assignments.assignment.created`. |
| `assignments.endAssignment` | `(id, endDate, endReason, opts?) => Promise<Assignment>` | Set `endDate` + `endReason`. Audits `assignments.assignment.ended`. |
| `assignments.getActiveAssignment` | `(employeeId, asOf) => Promise<Assignment \| null>` | Returns the assignment where `startDate ≤ asOf AND (endDate IS NULL OR endDate ≥ asOf)`. Used by `modules/dtr` to resolve the assignment for a clock-in. |

`Assignment` and `NewAssignment` types re-exported from the entry point.

## Overlap rule

`assign` rejects if `getActiveAssignment(employeeId, newStartDate)` finds an existing row. Because the active-window predicate is `endDate ≥ asOf` (inclusive), the check is **conservative** — a new assignment whose `startDate` equals the previous `endDate` is rejected.

If a clerk needs to chain assignments end-to-end on the same employee, they must first end the previous one with `endDate = newStart - 1 day` so the windows don't touch.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** `@/modules/audit` (writes audit rows on every mutation), `@/modules/events` (publishes `assignments.assignment.created` and `assignments.assignment.ended`). Both fire after the DB insert/update succeeds.
- **Tables:** `assignments`. FKs:
  - `employee_id → hr_employees(id) ON DELETE RESTRICT`
  - `detachment_id → detachments(id) ON DELETE RESTRICT`

## Known failure modes

### Overlap rejection
**Error:** `this guard already has an active assignment — end the previous one first`
**Trigger:** `assign` for an employee who already has an unended assignment covering the new `startDate`.
**Fix:** call `endAssignment(<oldId>, endDate, reason)` on the existing assignment first.

### `endAssignment` on unknown id
**Error:** `[assignments/endAssignment] no assignment <uuid>`
**Trigger:** `endAssignment` with an id that doesn't exist.
**Fix:** verify the id; check whether the assignment was already deleted (shouldn't happen — there's no delete API).

### FK violation on `employeeId` or `detachmentId`
**Error:** raw Postgres `23503` (no plain-language wrapper yet)
**Trigger:** `assign` with an employee id or detachment id that doesn't exist (e.g., stale UI state, copy-paste error).
**Fix:** validate ids before calling. Follow-up: wrap with plain-language errors matching the clients module pattern.

### Test isolation: assignments must be cleaned before parent tables
**Trigger:** any test suite that deletes from `hr_employees` or `detachments` without first deleting from `assignments` will hit a PG FK violation.
**Fix:** include `db.delete(assignments)` first in `beforeEach`. The cross-suite `beforeEach` hooks in `hr.test.ts` and `clients.test.ts` were updated when this module landed.
