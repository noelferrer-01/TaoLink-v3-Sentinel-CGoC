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
| `assignments.listActiveAssignments` | `(asOf: string) => Promise<ActiveAssignmentRow[]>` | Returns currently-active assignments joined with employee + detachment + client, ordered by last name. |
| `assignments.listAssignmentsOverlappingPeriod` | `(periodStart, periodEnd) => Promise<ActiveAssignmentRow[]>` | Returns assignments that overlap a payroll period at any point (used by DTR). |
| `assignments.listAssignableEmployees` | `(asOf: string) => Promise<AssignableEmployee[]>` | Returns employees without an active assignment who are not terminated. |
| `assignments.bulkAssign` | `(employeeIds[], detachmentId, startDate, actorUserId?) => Promise<BulkAssignResult>` | Assigns multiple employees to one detachment. One failure does not abort the batch. Returns `{ assigned: Assignment[], errors: { employeeId, reason }[] }`. |
| `assignments.bulkEndAssignments` | `(assignmentIds[], endDate, reason, actorUserId?) => Promise<BulkEndResult>` | Ends multiple assignments by id. One failure does not abort the batch. Returns `{ ended: Assignment[], errors: { assignmentId, reason }[] }`. |
| `assignments.bulkTransfer` | `(employeeIds[], toDetachmentId, transferDate, actorUserId?) => Promise<BulkTransferResult>` | Transfers employees to a new detachment. Per-employee atomic (one TX per employee: end old at transferDate−1d, start new at transferDate). Returns `{ transferred: Assignment[], errors: { employeeId, reason }[] }`. |
| `assignments.updateAssignment` | `(id, patch: UpdateAssignmentPatch, actorUserId?) => Promise<Assignment>` | Updates mutable fields (`startDate`, `endDate`, `reason`). Immutable fields (`id`, `employeeId`, `detachmentId`, `createdAt`) are not in the patch type and are never touched. Audits `assignments.assignment.updated`. |
| `assignments.list` | `(opts?: { limit?, offset? }) => Promise<{ rows: Assignment[], total: number }>` | Paginated list of all assignments, ordered by `startDate` desc. Default `limit=50`, `offset=0`. |

`Assignment`, `NewAssignment`, `ActiveAssignmentRow`, `AssignableEmployee`, `BulkAssignResult`, `BulkEndResult`, `BulkTransferResult`, `UpdateAssignmentPatch`, `ListAssignmentsOptions`, `ListAssignmentsResult` types re-exported from the entry point.

## Overlap rule

`assign` rejects if `getActiveAssignment(employeeId, newStartDate)` finds an existing row. Because the active-window predicate is `endDate ≥ asOf` (inclusive), the check is **conservative** — a new assignment whose `startDate` equals the previous `endDate` is rejected.

If a clerk needs to chain assignments end-to-end on the same employee, they must first end the previous one with `endDate = newStart - 1 day` so the windows don't touch.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** `@/modules/audit` (writes audit rows on every mutation), `@/modules/events` (publishes `assignments.assignment.created`, `assignments.assignment.ended`, and `assignments.assignment.updated`). Both fire after the DB insert/update succeeds.
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

### Bulk operations: partial success
**Trigger:** `bulkAssign`, `bulkEndAssignments`, or `bulkTransfer` — one or more inputs are invalid.
**Behavior:** one bad row does NOT abort the batch. The function returns normally. The caller **MUST inspect the `errors` array** — a non-empty errors array means partial failure.
**Fix:** examine each `errors[n].reason` to diagnose and retry individual failures.

### bulkTransfer: per-employee atomicity only
**Trigger:** `bulkTransfer` for multiple employees where one fails mid-batch.
**Behavior:** per-employee atomic — each employee's end+create runs in a single DB transaction. If one employee's TX fails, it is rolled back and the error is recorded. The next employee is still attempted. Cross-employee atomicity is NOT provided — if you need all-or-nothing, wrap callers in your own transaction (not currently supported by this API).

### list returns `{ rows, total }` — not a bare array
**Trigger:** code written before Phase 5 that calls `assignments.list()` and expects a plain array.
**Behavior:** `list()` always returns `{ rows: Assignment[], total: number }`. Bare-array access like `list()[0]` will be `undefined`.
**Fix:** update callers to destructure: `const { rows, total } = await assignments.list(...)`.
**Note:** `listActiveAssignments` and `listAssignmentsOverlappingPeriod` still return bare arrays — those APIs are unchanged.

### `updateAssignment` on unknown id
**Error:** `[assignments/updateAssignment] no assignment <uuid>`
**Trigger:** `updateAssignment` with an id that doesn't exist.
**Fix:** verify the id before calling.
