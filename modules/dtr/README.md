# modules/dtr

## Purpose

Daily Time Record — the bridge between operational reality (who showed up, when, where) and payroll math. Each row in `dtr_entries` is one guard's clock-in/out for one day. Closed periods (`dtr_period_closes`) are append-only locks: after a period is closed, payroll for that period is the source of truth and DTR rows in the range are frozen.

Slice 1 records DTR manually via the UI (Phase 8). Later slices will add device-driven capture, but the schema is intentionally flat enough to support either.

## Public API

```ts
import { dtr, type DtrEntry } from '@/modules/dtr';
```

| Function | Signature | What it does |
|---|---|---|
| `dtr.recordDTR` | `(input: { employeeId, date, timeIn?, timeOut?, status?, notes?, actorUserId? }) => Promise<DtrEntry>` | Insert one DTR row. Auto-resolves `assignmentId` via `assignments.getActiveAssignment(employeeId, date)`. Defaults `status` to `'worked'`. Audits `dtr.recorded`. |
| `dtr.getDTR` | `(employeeId, start, end) => Promise<DtrEntry[]>` | Inclusive range read for one employee between two `YYYY-MM-DD` dates. Used by payroll to compute days-worked. |
| `dtr.closePeriod` | `(periodStart, periodEnd, opts?) => Promise<void>` | Insert a period-close marker. Returns void. Audits `dtr.period.closed`. Throws plain-language error if the period is already closed. |

`DtrEntry`, `NewDtrEntry`, `DtrPeriodClose`, `NewDtrPeriodClose` types are re-exported.

> The module also exposes Slice-2 period helpers (`isPeriodClosed`, `summarizePeriod`, `bulkFillWorked`) and the Slice-4 billing readers below. All are re-exported from `@/modules/dtr`.

### Billing readers + the worked-day definition (Slice 4)

DTR owns the canonical definition of a *worked day* and the readers billing prices off. Both payroll and billing consume these so "what counts as worked" can never drift between what's paid and what's billed.

| Export | Signature | What it does |
|---|---|---|
| `WORKED_DTR_STATUSES` | `readonly ['worked','holiday_worked','restday_worked']` | The canonical worked (billable / payable) day set. Owned here because DTR owns `dtr_status`. Payroll and billing both import it. |
| `billedDaysByEmployeeDetachment` | `(clientId, start, end) => Promise<BilledDays[]>` | Worked man-days per `(employee, detachment)` for ONE client in `[start, end]`, attributed by the **frozen** `dtr_entries.assignment_id` → detachment → client join. Never calls `getActiveAssignment` — so editing assignment history later can't rewrite an issued invoice. The line source for `billing.generateInvoice`. |
| `listUnattributedWorkedDays` | `(start, end) => Promise<UnattributedDay[]>` | Period-level, **all clients**: worked days whose `assignment_id IS NULL` (unbillable until re-attached). Catches guards with zero postings the entire period — a per-client view would miss them. |
| `reattributeDtrDay` | `(dtrEntryId, opts?: { actorUserId? }) => Promise<DtrEntry>` | Re-resolve the active assignment for an existing DTR row's date and stamp it, so a day recorded before its posting existed isn't stuck unbillable. Throws if the guard still has no active posting on that date. Audits `dtr.reattributed`. |

Types `BilledDays` and `UnattributedDay` are re-exported.

### Status values

`dtr_status` enum: `'worked' | 'absent' | 'leave' | 'holiday_worked' | 'restday_worked'`. Defaults to `'worked'` if not specified. The worked-day subset used by payroll and billing is `WORKED_DTR_STATUSES` (above).

### Auto-assignment resolution

`recordDTR` calls `assignments.getActiveAssignment(employeeId, date)` and stores the resolved id in `assignment_id`. If the guard has no active assignment on that date, `assignment_id` is `NULL` and the DTR row still records (a guard might be present without a deployment — e.g., training day). Downstream payroll decides how to handle NULL-assignment DTR rows.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:**
  - `@/modules/assignments` — `getActiveAssignment` is called on every `recordDTR`.
  - `@/modules/audit` — writes audit rows on every mutation.
  - `@/modules/events` — publishes `dtr.recorded` and `dtr.period.closed`.
- **Tables:** `dtr_entries`, `dtr_period_closes`. Enum: `dtr_status`.

## Known failure modes

### Duplicate (employee, date)
**Error:** `A DTR entry already exists for this guard on <date>. Edit the existing entry instead of adding a new one.`
**Trigger:** `recordDTR` called twice for the same `employeeId` + `date` (Postgres `23505` on `dtr_emp_date_uq`).
**Fix:** caller uses an edit flow rather than re-recording.

### Period already closed
**Error:** `This period (<start> to <end>) is already closed.`
**Trigger:** `closePeriod` called twice with the same `(periodStart, periodEnd)` (Postgres `23505` on `dtr_period_close_uq`).
**Fix:** the period is already locked. To re-open, manual DB intervention is required (no `reopenPeriod` API in Slice 1).

### FK violation on `employeeId` or `assignmentId`
**Trigger:** `recordDTR` with a non-existent employee or stale assignment id.
**Fix:** caller validates ids first. Currently surfaces as raw Postgres `23503` — plain-language wrapping is a follow-up.

### NULL `assignmentId` is intentional
The `assignment_id` column is **nullable** because:
- A guard may clock in on a training day with no detachment.
- Backfill from paper records may not know which assignment applied.
- Status values like `'absent'` and `'leave'` don't require an assignment.

Payroll math (Phase 6) must handle NULL `assignmentId` rows explicitly — typically by treating them as "headquarters / overhead" hours or flagging them for review. Billing surfaces these via `listUnattributedWorkedDays` and never bills them silently.

### "Still no active posting on that date — assign the guard first"
**Trigger:** `reattributeDtrDay` called on a DTR row whose guard has no active assignment covering that row's date. There is nothing to re-resolve to.
**Fix:** create/extend the guard's assignment so it covers the date, then re-attach. (Re-attach re-resolves via `getActiveAssignment`, the same lookup `recordDTR` uses.)
