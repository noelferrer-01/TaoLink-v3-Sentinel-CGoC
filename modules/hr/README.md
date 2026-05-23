# modules/hr

## Purpose

Employee master + status state machine + CSV bulk import. The foundation HR layer per [ADR 0009](../../wiki/decisions/0009-hr-starter-and-recruitment-as-entry-point.md): minimal in Slice 1, owned by Recruitment from Slice 3 onwards.

## Public API

Import from the module entry point only — never reach into `service.ts` directly.

```ts
import { hr, type BulkImportResult } from '@/modules/hr';
```

| Function | Signature | What it does |
|---|---|---|
| `hr.createEmployee` | `(input: CreateEmployeeInput) => Promise<Employee>` | Insert one employee. Auto-audits + publishes `hr.employee.created`. Throws plain-language error on duplicate email. |
| `hr.getEmployee` | `(id: string) => Promise<Employee \| null>` | Read by id. |
| `hr.changeStatus` | `(id, next, reason, opts?) => Promise<Employee>` | Move through the state machine. Sets `terminatedOn` when `next === 'terminated'`. Audits + publishes `hr.employee.status_changed`. Throws on disallowed transitions. |
| `hr.bulkImportEmployees` | `(csvText: string, opts?) => Promise<BulkImportResult>` | Parse a CSV (columns: `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on`), validate per row, insert valid rows in one batch, return `{ imported, errors }`. Per-row failures do NOT abort the batch — they are reported in `errors`. Plain-language error messages per the UX rule. |

`Employee`, `NewEmployee`, and `BulkImportResult` types are re-exported from the entry point.

### Status state machine

```
applicant   → hired | terminated
hired       → deployed | reliever | floating | on_leave | terminated
deployed    → floating | reliever | on_leave | terminated
reliever    → deployed | floating | on_leave | terminated
floating    → deployed | reliever | on_leave | terminated
on_leave    → deployed | reliever | floating | terminated
terminated  → (terminal)
```

Transitions enforced by `ALLOWED_TRANSITIONS` in `service.ts`. A disallowed move throws `[hr/changeStatus] disallowed transition <from> → <to>`.

### CSV import — column contract

The bulk-import CSV requires these headers (case-sensitive, in any order):

| Header | Required | Notes |
|---|---|---|
| `employee_code` | yes | CGoC-facing ID, e.g. `CG-00001`. Must be unique. |
| `first_name` | yes | |
| `last_name` | yes | |
| `email` | no | Blank allowed (many guards have no email). Must be unique if present. |
| `basic_salary` | yes | Positive number. Stored as `numeric(12,2)`. |
| `pay_frequency` | no | `MONTHLY` or `SEMI_MONTHLY`. Defaults to `SEMI_MONTHLY` if blank or column missing. |
| `hired_on` | yes | `YYYY-MM-DD`. |

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** `@/modules/audit` (writes audit rows on every mutation), `@/modules/events` (publishes `hr.employee.created` and `hr.employee.status_changed`). Both are non-fatal — a failure in audit or events does NOT roll back the HR insert.
- **External:** `papaparse` (CSV parsing), `zod` (per-row validation).
- **Tables:** `hr_employees`. Enums: `hr_employee_status`, `hr_pay_frequency`.

## Known failure modes

### Duplicate email on single create
**Error:** `Email already in use: <email>`
**Trigger:** `createEmployee` with an `email` already in `hr_employees` (Postgres `23505` on `hr_employees_email_uq`).
**Fix:** caller chooses a different email or omits it (NULL emails are allowed; uniqueness only kicks in on non-NULL values).

### Duplicate employee_code on create or bulk import
**Error:** `[hr/createEmployee] duplicate key value violates unique constraint "hr_employees_code_uq"` (no plain-language wrapper yet)
**Trigger:** Two employees sharing `employee_code`.
**Fix:** caller must assign unique codes. The bulk-import path does NOT pre-check `employee_code` collisions today; the DB constraint catches them but aborts the whole batch insert. Follow-up: pre-fetch existing codes the same way emails are pre-fetched. Tracked in todos.

### Disallowed status transition
**Error:** `[hr/changeStatus] disallowed transition <from> → <to>`
**Trigger:** Any transition not in the matrix above. Most common: trying to move a `terminated` employee back to `deployed`.
**Fix:** terminated is terminal by design. If the termination was a mistake, the right move is to re-`createEmployee` (or, eventually, a re-hire flow not yet built).

### CSV row with duplicate email already in DB
**Error per row:** `email <addr> already exists in HR — pick a different one or remove this row.`
**Trigger:** `bulkImportEmployees` row whose `email` matches a row already in `hr_employees`.
**Fix:** the row is skipped; other rows continue. Caller surfaces the error to the user.

### CSV row with duplicate email inside the same batch
**Error per row:** `email <addr> appears twice in the same file — keep one row.`
**Trigger:** Two rows in the same CSV with the same `email`.
**Fix:** the first row wins, the second is reported. Caller removes the dup.

### CSV with malformed parsing (unbalanced quotes etc.)
**Trigger:** Papa.parse reports errors in `parsed.errors`, which the current implementation ignores. Partial-row data may pass through to Zod and fail with a less-helpful message.
**Fix:** surface `parsed.errors` to the caller. Tracked in todos.

### Partial state if `audit.record` or `events.publish` fails mid-loop
**Trigger:** `bulkImportEmployees` inserts succeed but a downstream audit/publish call throws.
**Fix:** the employees are in the DB; the audit trail is incomplete. Today this mirrors the single-create path. Wrapping `insert + audit + publish` in a `db.transaction` is tracked as a follow-up.
