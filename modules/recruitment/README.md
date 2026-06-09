# Recruitment module

## Purpose

The HRIS front door: track applicants through a hiring pipeline (Applied →
Contacted → Documents complete → Hired), keep a permanent searchable database of
every applicant, flag terminated/blacklisted guards on re-apply, and — on hire —
create the employee record in HR. Applicants are **not** employees (ADR 0004):
no `hr_employees` row, no payroll, until hired.

## Public API

Import from `@/modules/recruitment` (the `recruitment` object or named exports).

| Function | Signature | Notes |
| --- | --- | --- |
| `createApplicant` | `(CreateApplicantInput) => Promise<Applicant>` | Inserts the applicant (stage `applied`) and seeds the required-doc checklist. Audits + emits `recruitment.applicant.created`. |
| `getApplicant` | `(id) => Promise<{ applicant, documents } \| null>` | Applicant + its document rows. |
| `listApplicantsPage` | `({ query?, stage?, limit, offset }) => Promise<{ rows, total }>` | Paginated/searchable across ALL applicants (incl. rejected/withdrawn). |
| `advanceStage` | `(id, next, opts?) => Promise<Applicant>` | Enforces `ALLOWED_TRANSITIONS`. Audits + emits `recruitment.applicant.stage_changed`. Throws on illegal transitions. |
| `setDocument` | `(applicantId, docType, { status, expiresOn?, notes?, verifiedByUserId? }) => Promise<void>` | Updates one checklist row; stamps `verifiedOn` when status becomes `verified`. |
| `rejectApplicant` / `withdrawApplicant` | `(id, reason, opts?) => Promise<Applicant>` | Terminal; records `outcomeReason`. |
| `checkMatches` | `({ firstName, lastName, dateOfBirth?, sssNumber? }) => Promise<Match[]>` | Terminated employees + active blacklist. SSS-exact first, name+DOB possible. |
| `addToBlacklist` / `listBlacklist` / `removeFromBlacklist` | see types | `remove` is a soft deactivate (`active=false`). |
| `hireApplicant` | `(applicantId, HireMeta) => Promise<Employee>` | **ADR 0009 handoff.** Requires stage `documents`. Calls `hr.createEmployee` (auto-generates `CG-#####` unless overridden), back-links `hiredEmployeeId`, sets stage `hired`. Audits + emits `recruitment.applicant.hired`. |

Labels/constants also exported: `STAGE_LABELS`, `SOURCE_LABELS`, `DOC_TYPE_LABELS`,
`DOC_STATUS_LABELS`, `ALLOWED_TRANSITIONS`, `requiredDocsFor(isArmedPost)`.

## Dependencies

- `@/core/db` — Drizzle handle (`getDb`).
- `@/modules/hr` — `createEmployee`, `generateNextEmployeeCode` (the hire handoff).
- `@/modules/audit` — `audit.record` (note: arg is `actor`, not `actorUserId`).
- `@/modules/events` — `events.publish`.
- Tables: `recruitment_applicants`, `recruitment_applicant_documents`,
  `recruitment_blacklist` (migrations 0019, 0020).

## Known failure modes

- **`Cannot move an applicant from X to Y.`** — illegal stage transition. Valid
  next stages live in `ALLOWED_TRANSITIONS` (labels.ts).
- **`Only applicants with completed documents can be hired.`** — `hireApplicant`
  called before the applicant reached the `documents` stage.
- **FK violation deleting `hr_employees` in a test** — a recruitment row
  referenced the employee. The recruitment→employee FKs are `ON DELETE SET NULL`
  (migration 0020) so this should not happen; if it reappears, a NEW reference
  column was added without `onDelete: 'set null'`.
- **Blacklist false positives** — name+DOB matching (no stable national ID yet)
  can flag two different people with the same name/birthday. SSS-number matching
  is exact; capture `sssNumber` to reduce noise. See spec §5.
- **No document file storage** — `setDocument` tracks status only; scanned PDFs
  are a deferred fast-follow (no blob storage configured).
- **Duplicate Person minted for legacy applicant hired before T4 backfill** — A
  pre-T7 applicant whose `person_id` is `NULL` (i.e., created before the T7
  dual-write landed) will have a fresh Person minted at hire time via
  `createEmployee`, because `hireApplicant` passes `personId: a.personId ?? undefined`
  and `undefined` is treated as "no personId supplied — mint one." The
  `db:backfill:persons` script (Task 4) should be run **before** hiring any
  legacy applicants so their `person_id` is populated and the hire path skips
  minting. Mitigation: run `pnpm db:backfill:persons` before the first hire
  wave after deploying T7.
