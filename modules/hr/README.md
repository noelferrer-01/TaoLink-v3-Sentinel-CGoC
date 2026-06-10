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
| `hr.createEmployee` | `(input: CreateEmployeeInput) => Promise<Employee>` | Insert one employee, atomically **minting** the Person that holds its identity — or **linking** an existing one when `input.personId` is supplied (the `hireApplicant` path). Identity fields (name, contact, DOB, gov-IDs, address) are split out and written to `persons`; they never land on `hr_employees`. `rdoCode` is the exception — a BIR field that stays on the employee row. Auto-audits + publishes `hr.employee.created`. Accepts `employmentType` (defaults to `'GUARD'`). |
| `hr.getEmployee` | `(id: string) => Promise<Employee \| null>` | Read by id. |
| `hr.getEmployeeByCode` | `(code: string) => Promise<Employee \| null>` | Read by `employeeCode`. Useful for post-import lookups and tests. |
| `hr.updateEmployee` | `(id: string, patch: UpdateEmployeePatch, actorUserId?) => Promise<Employee>` | Partial update of **employment** fields only. Immutable fields (`id`, `employeeCode`, `createdAt`) **and every identity field** (`IDENTITY_FIELDS` — name, contact, DOB, gov-IDs, address) are silently stripped from the patch: identity is edited through `persons.updatePerson`, never here. (`rdoCode` is not an identity field and is editable.) Throws `[hr/updateEmployee] employee <id> not found` if the row doesn't exist. Audits with before/after snapshot + `changedFields` list. Publishes `hr.employee.updated` event. |
| `hr.searchEmployees` | `(query: string, opts?: SearchEmployeeOptions) => Promise<Employee[]>` | Fuzzy search via `pg_trgm` on the Person's full name (joined from `persons`, since names live there now), with OR fallback to `ILIKE` on `employeeCode`. Supports `employmentType` and `status` filters. Default limit 20, hard cap 100. Ordered by similarity score (descending) when a query is given, or by name when no query. |
| `hr.changeStatus` | `(id, next, reason, opts?) => Promise<Employee>` | Move through the state machine. Sets `terminatedOn` when `next === 'terminated'`. Audits + publishes `hr.employee.status_changed`. Throws on disallowed transitions. |
| `hr.undoTermination` | `(id, reason, opts?) => Promise<Employee>` | Revert a `terminated → hired` transition within 5 minutes of the termination event. Bypasses `ALLOWED_TRANSITIONS` on purpose. Clears `terminatedOn`. Audits with `{ from: 'terminated', to: 'hired', reason, undo: true }` and publishes `hr.employee.status_changed`. Throws plain-language errors when the employee isn't terminated, the window has passed, or the employee isn't found. |
| `hr.getLatestTerminationTimestamp` | `(id) => Promise<Date \| null>` | Reads the most recent `to: 'terminated'` audit row's `createdAt` for an employee. Used by `undoTermination` (and the employee detail page) because the `terminated_on` column is day-resolution and can't drive a precise 5-minute window. Returns null when no termination audit row exists. |
| `hr.bulkImportEmployees` | `(csvText: string, opts?) => Promise<BulkImportResult>` | Parse a CSV, validate per row, insert valid rows in one batch, return `{ imported, errors }`. Per-row failures do NOT abort the batch. Accepts new columns: `employment_type`, `rdo_code`, `date_of_birth`, `address_line1`, `address_line2`, `city`, `province`, `postal_code`. All new columns are optional. |

`Employee`, `NewEmployee`, and `BulkImportResult` types — plus the `IDENTITY_FIELDS` constant (the keys `updateEmployee` strips and routes to `persons`) — are re-exported from the entry point.

### Status state machine

```
applicant   → hired | terminated
hired       → deployed | reliever | floating | on_leave | terminated
deployed    → hired | floating | reliever | on_leave | terminated
reliever    → hired | deployed | floating | on_leave | terminated
floating    → hired | deployed | reliever | on_leave | terminated
on_leave    → hired | deployed | reliever | floating | terminated
terminated  → (terminal — except via `undoTermination` within 5 min)
```

`hired` is the neutral employed-but-not-currently-deployed state. Office staff (drivers, supervisors, janitors, OFFICE_STAFF) stay in `hired` as their resting state — they have no deployment lifecycle. Guards return to `hired` when pulled off all detachments.

`terminated` is terminal by design — once an employment chapter is closed, re-hires create a *new* employee record (new code, new hired-on date, fresh audit story). A dedicated re-hire flow is deferred to Slice 3+ when Recruitment takes ownership of the HR module (see ADR 0009).

Transitions enforced by `ALLOWED_TRANSITIONS` in `service.ts`. A disallowed move throws `[hr/changeStatus] disallowed transition <from> → <to>`.

**Mistake-undo window:** `hr.undoTermination` is the one escape hatch from `terminated`. It bypasses `ALLOWED_TRANSITIONS` for a 5-minute window after the termination event (sourced from the audit log, not the day-resolution `terminated_on` column). Beyond that, terminations are final.

### CSV import — column contract

The bulk-import CSV requires these headers (case-sensitive, in any order):

| Header | Required | Notes |
|---|---|---|
| `employee_code` | yes | CGoC-facing ID, e.g. `CG-00001`. Must be unique. |
| `first_name` | yes | |
| `last_name` | yes | |
| `email` | no | Blank allowed (many guards have no email). **Non-unique** — email-uniqueness was retired in migration 0024; `persons.email` is non-unique by design (applicants re-apply, share, or lack an email). Only a format check (Zod `.email()`) is applied. |
| `basic_salary` | yes | Positive number. Stored as `numeric(12,2)`. |
| `pay_frequency` | no | `MONTHLY` or `SEMI_MONTHLY`. Defaults to `SEMI_MONTHLY` if blank or column missing. |
| `hired_on` | yes | `YYYY-MM-DD`. |
| `employment_type` | no | `GUARD`, `OFFICE_STAFF`, `SUPERVISOR`, `DRIVER`, `JANITOR`, or `OTHER`. Defaults to `GUARD`. |
| `rdo_code` | no | Up to 3 characters. BIR Revenue District Office code, e.g. `044`. |
| `date_of_birth` | no | `YYYY-MM-DD`. BIR 2316 field. |
| `address_line1` | no | Street address. |
| `address_line2` | no | Unit / barangay. |
| `city` | no | City or municipality. |
| `province` | no | Province or region (e.g. `Metro Manila`). |
| `postal_code` | no | Up to 4 characters. |

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** `@/modules/persons` (mints/links the Person that owns each employee's identity; `searchEmployees` joins `persons` for the name), `@/modules/audit` (writes audit rows on every mutation), `@/modules/events` (publishes `hr.employee.created`, `hr.employee.status_changed`, and `hr.employee.updated`). Audit/events are non-fatal — a failure there does NOT roll back the HR insert; the Person mint, by contrast, is in the same transaction as the employee insert and DOES roll back together.
- **External:** `papaparse` (CSV parsing), `zod` (per-row validation), `pg_trgm` Postgres extension (required for the `persons` name search behind `searchEmployees`).
- **Tables:** `hr_employees` (its `person_id` is a `NOT NULL` FK to `persons`, `ON DELETE RESTRICT`). Enums: `hr_employee_status`, `hr_pay_frequency`, `hr_employment_type`. `hr/schema.ts` imports the `persons` table object directly to declare that FK — see the persons README's "Architectural exception."

## Known failure modes

> **Email uniqueness was retired in migration 0024.** `createEmployee` no longer
> throws on a duplicate email, and the `hr_employees_email_uq` index is gone —
> `persons.email` is non-unique by design. If you remember an "Email already in
> use" error here, it's gone.

### Employee created without a Person (person_id NOT NULL)
**Error:** `null value in column "person_id" of relation "hr_employees" violates not-null constraint` (Postgres `23502`).
**Trigger:** an `hr_employees` row was inserted without a `person_id` — a writer bypassed `hr.createEmployee`. Since 0024, `person_id` is `NOT NULL`.
**Fix:** all employee creation goes through `hr.createEmployee` (or `recruitment.hireApplicant`, which links the applicant's existing Person). Never `INSERT` into `hr_employees` directly.

### Deleting a Person an employee references (FK RESTRICT)
**Error:** `update or delete on table "persons" violates foreign key constraint "hr_employees_person_id_fkey"` (Postgres `23503`).
**Trigger:** a hard `DELETE` of a `persons` row still referenced by an employee. The FK is `ON DELETE RESTRICT`.
**Fix:** don't hard-delete people. Use `persons.redactPerson` (tombstone) to scrub PII while keeping the row and its FK intact.

### Duplicate government ID when minting a Person
**Error:** `That <PhilSys/SSS/TIN> is already on file for another person.` (Postgres `23505` on `persons_<type>_uq`, re-thrown in plain language by `createPerson`).
**Trigger:** `createEmployee` / `bulkImportEmployees` supplies a government ID already held by another Person.
**Fix:** either it's the same human (link the existing Person instead of minting) or a data-entry slip (correct the ID). In bulk import this surfaces as a per-row error and skips only that row.

### Duplicate employee_code on create or bulk import
**Error:** `[hr/createEmployee] duplicate key value violates unique constraint "hr_employees_code_uq"` (no plain-language wrapper yet)
**Trigger:** Two employees sharing `employee_code`.
**Fix:** caller must assign unique codes. The bulk-import path does NOT pre-check `employee_code` collisions today; the DB constraint catches them but aborts the whole batch insert. Follow-up: pre-fetch existing codes the same way emails are pre-fetched. Tracked in todos.

### Disallowed status transition
**Error:** `[hr/changeStatus] disallowed transition <from> → <to>`
**Trigger:** Any transition not in the matrix above. Most common: trying to move a `terminated` employee back to `deployed`.
**Fix:** terminated is terminal by design. If the termination was a mistake, the right move is to re-`createEmployee` (or, eventually, a re-hire flow not yet built).

### CSV with malformed parsing (unbalanced quotes etc.)
**Trigger:** Papa.parse reports errors in `parsed.errors`, which the current implementation ignores. Partial-row data may pass through to Zod and fail with a less-helpful message.
**Fix:** surface `parsed.errors` to the caller. Tracked in todos.

### Partial state if `audit.record` or `events.publish` fails mid-loop
**Trigger:** `bulkImportEmployees` inserts succeed but a downstream audit/publish call throws.
**Fix:** the employees are in the DB; the audit trail is incomplete. Today this mirrors the single-create path. Wrapping `insert + audit + publish` in a `db.transaction` is tracked as a follow-up.

### pg_trgm extension missing
**Error:** `function similarity(text, text) does not exist` (SQL error from `searchEmployees`).
**Trigger:** the `pg_trgm` extension was not enabled on the database. It is enabled via the Phase 1 migration `0009_slice2_pg_trgm.sql` (or equivalent).
**Fix:** connect to the DB and run `CREATE EXTENSION IF NOT EXISTS pg_trgm;`, then re-run the migration.

### updateEmployee: changes to immutable fields silently ignored
**Trigger:** caller passes `id`, `employeeCode`, or `createdAt` in the patch.
**Fix:** this is by design — the patch is sanitised server-side before the DB write. The returned row will always reflect the original immutable values. No error is thrown; the extra keys are silently dropped.

### updateEmployee: throws on missing id
**Error:** `[hr/updateEmployee] employee <id> not found`
**Trigger:** the UUID passed as `id` does not match any row in `hr_employees`.
**Fix:** verify the id with `getEmployee(id)` before calling `updateEmployee`.

### Bulk import: employment_type defaults to GUARD
**Trigger:** the `employment_type` column is absent or blank in the CSV.
**Fix:** this is by design — guards are the default employment type at CGoC. To assign a different type, include the column with one of `GUARD`, `OFFICE_STAFF`, `SUPERVISOR`, `DRIVER`, `JANITOR`, `OTHER`.

### Bulk import: BIR fields silently skipped when absent
**Trigger:** any of `rdo_code`, `date_of_birth`, `address_*` columns are absent or blank in the CSV.
**Fix:** these fields are nullable; a missing value simply stores `NULL`. They can be added later via `updateEmployee`. The BIR 2316 export warns on missing values but does not block the export.

### undoTermination: not terminated
**Error:** `This employee isn't terminated — there's nothing to undo.`
**Trigger:** `undoTermination` called on an employee whose status is anything but `terminated`.
**Fix:** verify status with `getEmployee` before calling. In the UI, the undo button only renders when status is `terminated`.

### undoTermination: missing termination timestamp
**Error:** `We don't have a termination timestamp on file — can't undo.`
**Trigger:** the employee is `terminated` but no `hr.employee.status_changed` audit row with `to=terminated` exists (defensive; should be impossible via the normal `changeStatus` path).
**Fix:** the employee was likely terminated via a manual SQL update that skipped the audit log. Cannot undo via this API — the audit trail must be repaired manually.

### undoTermination: window closed
**Error:** `The 5-minute undo window has passed. Termination is final.`
**Trigger:** more than 5 minutes have elapsed since the most recent `to: 'terminated'` audit row.
**Fix:** this is the contract. Re-hires create a new employee record (deferred to Slice 3+).

### undoTermination: missing employee
**Error:** `[hr/undoTermination] employee <id> not found`
**Trigger:** the UUID doesn't match any row.
**Fix:** verify the id exists via `getEmployee`.
