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
| `createApplicant` | `(CreateApplicantInput) => Promise<Applicant>` | Atomically **mints a Person** (provisional if no government ID) and inserts the applicant (stage `applied`), seeding the required-doc checklist. Accepts the full gov-ID ladder (`sssNumber`, `philsysNumber`, `tinNumber`, `passportNumber`, `umidNumber`, `driversLicenseNumber`); the anchor is the first present by `ID_TYPE_LADDER` preference. Sets the `idPending` flag when no anchor ID was captured (provisional save — never blocks; **service-internal** — the UI derives the nudge from the live Person anchor, not this stored column). Audits + emits `recruitment.applicant.created`. |
| `getApplicant` | `(id) => Promise<{ applicant, documents } \| null>` | Applicant + its document rows. |
| `listApplicantsPage` | `({ query?, stage?, limit, offset }) => Promise<{ rows, total }>` | Paginated/searchable across ALL applicants (incl. rejected/withdrawn). |
| `advanceStage` | `(id, next, opts?) => Promise<Applicant>` | Enforces `ALLOWED_TRANSITIONS`. Audits + emits `recruitment.applicant.stage_changed`. Throws on illegal transitions. |
| `setDocument` | `(applicantId, docType, { status, expiresOn?, notes?, verifiedByUserId? }) => Promise<void>` | Updates one checklist row; stamps `verifiedOn` when status becomes `verified`. |
| `rejectApplicant` / `withdrawApplicant` | `(id, reason, opts?) => Promise<Applicant>` | Terminal; records `outcomeReason`. |
| `checkMatches` | `({ personId, firstName, lastName, dateOfBirth?, sssNumber?, philsysNumber?, tinNumber?, excludeApplicantId? }) => Promise<Match[]>` | Cross-checks a candidate against everyone on file before save/hire. Exact channels: same `personId`; government-ID hit (SSS/PhilSys/TIN, via `persons`); active employees (`active_employee` — possible double-hire); terminated employees (`terminated_employee`); in-flight applicants (`concurrent_applicant`, terminal stages excluded); active blacklist. Possible channel: fuzzy name+DOB. |
| `addToBlacklist` / `listBlacklist` / `removeFromBlacklist` | see types | `remove` is a soft deactivate (`active=false`). |
| `hireApplicant` | `(applicantId, HireMeta) => Promise<Employee>` | **ADR 0009 handoff.** Requires stage `documents` **and an anchored government ID** — calls `persons.assertAnchored(personId)`, which throws if the Person's `anchorIdType` is `'none'`. Then calls `hr.createEmployee` **linking the applicant's existing Person** (no new Person minted), auto-generates `CG-#####` unless overridden, back-links `hiredEmployeeId`, sets stage `hired`. Audits + emits `recruitment.applicant.hired`. |

Labels/constants also exported: `STAGE_LABELS`, `SOURCE_LABELS`, `DOC_TYPE_LABELS`,
`DOC_STATUS_LABELS`, `ALLOWED_TRANSITIONS`, `requiredDocsFor(isArmedPost)`,
`MATCH_KIND_LABELS` + the `MatchKind` type.

## Dependencies

- `@/core/db` — Drizzle handle (`getDb`).
- `@/modules/persons` — `createPerson`, `assertAnchored`, `getPerson`,
  `findPersonByAnyId`, `findPossibleDuplicates` (identity minting, the hire gate,
  and the known-person / duplicate lookups behind intake).
- `@/modules/hr` — `createEmployee`, `generateNextEmployeeCode` (the hire handoff).
- `@/modules/audit` — `audit.record` (note: arg is `actor`, not `actorUserId`).
- `@/modules/events` — `events.publish`.
- Tables: `recruitment_applicants` (its `person_id` is a `NOT NULL` FK to `persons`,
  `ON DELETE RESTRICT`), `recruitment_applicant_documents`, `recruitment_blacklist`
  (its `person_id` is a *nullable* FK, `ON DELETE SET NULL`) (migrations 0019, 0020;
  `person_id` FKs added in 0022 and tightened in 0024). `recruitment/schema.ts`
  imports the `persons` table object directly to declare those FKs — see the persons
  README's "Architectural exception."

## Known failure modes

- **`Cannot move an applicant from X to Y.`** — illegal stage transition. Valid
  next stages live in `ALLOWED_TRANSITIONS` (labels.ts).
- **`Only applicants with completed documents can be hired.`** — `hireApplicant`
  called before the applicant reached the `documents` stage.
- **`A government ID is required before this person can be hired. Add a PhilSys, SSS, or TIN number to their record first.`**
  — the `assertAnchored` hire gate fired: the applicant was saved provisionally
  (`anchorIdType: 'none'`) and still has no government ID. Clearing it requires
  `updatePerson(personId, { anchorIdType, <idField> })` (anchor + value together —
  see the persons README). The **Hire modal** captures these fields when the
  Person is unanchored and the hire action anchors the Person right before
  `hireApplicant`, so in normal UI flow this error only appears if the ID fields
  were bypassed. Note the detail-page nudge derives from the live
  `person.anchorIdType` at render (not the stored `idPending` flag, which only
  `createApplicant` + `advanceStage` recompute) — see
  `wiki/slices/3a-person-identity-done-sweep.md` §5.
- **Applicant created without a Person** — `null value in column "person_id" …
  violates not-null constraint` (Postgres `23502`). Since 0024,
  `recruitment_applicants.person_id` is `NOT NULL`; a writer bypassed
  `createApplicant`. Always go through `createApplicant`, which mints the Person.
- **Deleting a Person an applicant references** — `update or delete on table
  "persons" violates foreign key constraint "recruitment_applicants_person_id_fkey"`
  (Postgres `23503`, `ON DELETE RESTRICT`). Use `persons.redactPerson`, not
  `DELETE`. (The blacklist's `person_id` is the exception — `ON DELETE SET NULL`.)
- **`That <PhilSys/SSS/TIN> is already on file for another person.`** — Postgres
  `23505` on a `persons_<type>_uq` index when `createApplicant` supplies a gov ID
  already held by someone else. Same human → reconcile the duplicate; otherwise a
  data-entry slip.
- **Re-applying rejected/withdrawn applicants don't re-flag** — `checkMatches`
  excludes `TERMINAL_STAGES` (`hired`/`rejected`/`withdrawn`) from the
  in-flight-applicant channel **by design** (it surfaces *active* concurrency, not
  history). A returning candidate is flagged only if they share a government ID
  (→ known-person via `findPersonByAnyId`) or were a *terminated employee*
  (→ `terminated_employee`). A plain rejected re-applicant with no ID hit raises
  nothing. Intentional; revisit if recruiters need rejected-history surfacing.
- **FK violation deleting `hr_employees` in a test** — a recruitment row
  referenced the employee. The recruitment→employee FKs are `ON DELETE SET NULL`
  (migration 0020) so this should not happen; if it reappears, a NEW reference
  column was added without `onDelete: 'set null'`.
- **Match / blacklist false positives** — fuzzy name+DOB matching can flag two
  different people with the same name and birthday (`confidence: 'possible'`).
  Government-ID channels (PhilSys/SSS/TIN) are exact (`confidence: 'exact'`);
  capturing an anchor ID at intake is what reduces the noise. See spec §5.
- **No document file storage** — `setDocument` tracks status only; scanned PDFs
  are a deferred fast-follow (no blob storage configured).
