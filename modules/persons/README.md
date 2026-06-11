# modules/persons

## Purpose

The single source of identity truth for every human in the system. One `persons`
row per real person; an HR employee and a recruitment applicant are *roles* that
link to a Person via a `person_id` foreign key (ADR 0017/0018). All names, contact
info, date of birth, government IDs, and address live here — never on the role
tables. Identity is created and edited **only** through this module.

## Public API

Import from `@/modules/persons` only — never reach into `service.ts`/`schema.ts`
from runtime code (the one schema-level exception is documented below).

### Service

| Function | Signature | What it does |
|---|---|---|
| `createPerson` | `(input: CreatePersonInput, opts?: CreatePersonOptions) => Promise<Person>` | Creates a Person. `anchorIdType` may be `'none'` (provisional — no government ID yet). Pass `{ tx }` to mint a Person atomically with a role row. Catches Postgres `23505` and re-throws a plain-language "already on file" message. |
| `assertAnchored` | `(personId: string) => Promise<void>` | Throws unless the Person has a non-`'none'` anchor government ID. This is the **hire gate** — `recruitment.hireApplicant` calls it before handing off to HR. Returns `void` (does not return the row). |
| `getPerson` | `(id: string) => Promise<Person \| null>` | Fetch by id, or `null`. Returns redacted (tombstoned) rows too. |
| `findPersonByAnyId` | `(idType: AnchorIdType, idValue: string) => Promise<Person \| null>` | Exact match on that ID type's column; also matches a line-anchored hit in `quarantinedIds` (dup IDs parked during backfill). |
| `findPossibleDuplicates` | `(input: { firstName; lastName; dateOfBirth?: string \| null }) => Promise<Person[]>` | Same-DOB candidates narrowed by normalized name key. Returns `[]` when no DOB is given (the dedup key needs a birthday). |
| `updatePerson` | `(id: string, patch: UpdatePersonPatch, actorUserId?) => Promise<Person>` | The **only** identity-edit path. Refuses redacted rows; silently strips immutable/dedup-derived fields; rejects blank first/last name. Catches Postgres `23505` and re-throws a plain-language "already on file" message. Audits + emits an event. |
| `redactPerson` | `(id: string, actorUserId?) => Promise<Person>` | Tombstone (the soft-delete path): sets `redactedAt`, nulls all identity, names → `'[redacted]'`, `anchorIdType` → `'none'`, **and deletes the person's entire credential wallet (`person_credentials`)** — all in one transaction. A referenced Person can't be hard-deleted (RESTRICT FK), so redaction is how PII is removed. |

### Credentials wallet (Slice 3b — ADR 0018)

The Person owns a durable licence/clearance wallet. Credentials are audited
against the owning Person (the aggregate root) with a `person.credential.*` action.

| Function | Signature | What it does |
|---|---|---|
| `addCredential` | `(input: AddCredentialInput, opts?: AddCredentialOptions) => Promise<PersonCredential>` | Adds a credential. `status` defaults to `'valid'`. Accepts `{ tx }` for transactional inserts (note: `recruitment.hireApplicant` deliberately does NOT pass one — its carry-forward is best-effort, never fails the hire). |
| `updateCredential` | `(id, patch, actorUserId?, opts?: UpdateCredentialOptions) => Promise<PersonCredential>` | Updates a credential (changed-field audit; PII values masked). Pass `{ expectedPersonId }` to scope the edit to a known owner — a credential belonging to anyone else is refused as not-found (prevents cross-person edits). Throws a plain-language not-found error. |
| `listCredentials` | `(personId) => Promise<PersonCredential[]>` | One Person's credentials, ordered by type then soonest expiry (NULLs last). |
| `listCredentialsForPersons` | `(personIds: string[]) => Promise<PersonCredential[]>` | Batch read (no N+1) for the readiness radar. `[]` for an empty input. |

**Display state is derived, not stored** — `deriveCredState(expiresOn, status, today, windowDays?)` →
`valid \| expiring \| expired \| revoked \| pending`. `revoked` is kept **distinct** from
`expired`. `READINESS_CRED_SET(isArmedPost)` is the required *credential* set (licences/
clearances only — **excludes `resume_biodata`**; armed posts add `ltopf_license`).
`CRED_WINDOW_DAYS` holds per-credential renewal windows. The readiness radar that
consumes these lives in **`hr`** (`hr.listReadinessIssues` — readiness joins
employees with credentials; persons imports nothing downstream, so it only
exposes the building blocks). See `wiki/slices/3b-credentials-and-readiness-done-sweep.md` §4.

### Search primitives (shared, so hr + recruitment use one definition)

| Export | What it is |
|---|---|
| `NAME_SEARCH_THRESHOLD` | `0.2` — the `pg_trgm` similarity floor for name search. |
| `personFullNameMatches(query)` | `SQL` fragment: `(first \|\| ' ' \|\| last) % query` (trigram match). |
| `personFullNameSimilarityDesc(query)` | `SQL` fragment: `ORDER BY similarity(...) DESC NULLS LAST`. |
| `withNameSearchThreshold(db, fn)` | Runs `fn(tx)` inside a transaction with `SET LOCAL pg_trgm.similarity_threshold` so the `%` operator and the row+count read agree on the same threshold. |
| `escapeLike(term)` | Escapes `%`/`_`/`\` in a user-typed term before it goes into a LIKE/ILIKE pattern, so wildcards match literally. Required form: `ilike(col, `%${escapeLike(term)}%`)` — embedding the raw term lets `_`/`%` act as wildcards. |

### Labels, enums & types

`ANCHOR_ID_LABELS`, `ID_TYPE_LADDER` (anchor preference order `philsys > sss > tin >
passport > umid > drivers_license`), `normalizeNameKey(first, last, dob)` (collapses
PH name particles into a `"last|first|dob"` dedup key), `checkIdFormat(type, raw)`
(**advisory only — never throws**, returns a hint string or `null`). Types
`AnchorIdType`, `AnchorIdTypeNonNone`, `Person`, `NewPerson`, `CreatePersonInput`,
`CreatePersonOptions`. Schema values `persons`, `personSex`, `personAnchorIdType`.
Credentials (Slice 3b): `CRED_TYPE_LABELS`, `CRED_STATUS_LABELS`, `CRED_WINDOW_DAYS`,
`deriveCredState`, `READINESS_CRED_SET`; types `CredType`, `CredStatus`, `CredState`,
`PersonCredential`, `NewPersonCredential`, `AddCredentialInput`, `AddCredentialOptions`;
schema values `personCredentials`, `personCredType`, `personCredStatus`.

## Dependencies

- **Modules:** `@/core/db` (`getDb`, `DbOrTx`), `@/modules/audit` (audit row on every
  mutation), `@/modules/events` (publishes person events). Audit/events are non-fatal.
- **Env:** none read directly — DB access is via `@/core/db` (which owns `DATABASE_URL`).
- **Postgres:** table `persons`; enums `person_sex`, `person_anchor_id_type`;
  partial-unique indexes `persons_philsys_uq` / `persons_sss_uq` / `persons_tin_uq`
  (created in `0021_persons.sql`); lookup indexes for umid/passport/dl/anchor-type/dob;
  GIN trigram index `persons_fullname_trgm`; extension `pg_trgm` (enabled in 0009).
  Slice 3b adds table `person_credentials` (cascade FK to `persons`, SET-NULL FK to
  `users`), enums `person_cred_type` / `person_cred_status`, and index
  `person_credentials_person_id_idx` (created in `0026_person_credentials.sql`).
- **Schema-level only:** `schema.ts` imports the `users` table from `@/modules/auth/schema`
  for the `person_credentials.verified_by_user_id` FK (the same documented FK-declaration
  exception below — auth has no reverse dependency on persons, so it's acyclic).

### Architectural exception — role schemas import the `persons` table directly

The module rule is "import only from a module's entry point." One documented
exception: `modules/hr/schema.ts` and `modules/recruitment/schema.ts` import the
`persons` table object straight from `@/modules/persons/schema` (not the `@/modules/persons`
entry point) so they can declare their `person_id` foreign key
(`.references(() => persons.id, …)`). Drizzle needs the real table object at
schema-definition time, and a re-export through the entry point would create an
import cycle. This mirrors the existing pattern where payroll/dtr/assignments
import `employees` from `hr/schema`. **Runtime/service code still goes through
`@/modules/persons`** — only the FK declarations reach into the schema file.

## Known failure modes

- **`<Label> number is required when anchorIdType is '<type>'.`** — `createPerson`
  was given an anchor type but no matching ID value. Pass the value or use
  `anchorIdType: 'none'` (provisional).
- **`That <Label> is already on file for another person.`** — Postgres `23505` on
  `persons_philsys_uq` / `persons_sss_uq` / `persons_tin_uq`: a duplicate government
  ID. Surfaces wherever a Person is minted or edited — `createPerson`,
  `updatePerson` (e.g. the Hire-modal ID capture), `hr.createEmployee`,
  `hr.bulkImportEmployees` (as a per-row error), `recruitment.createApplicant`.
- **`A government ID is required before this person can be hired. Add a PhilSys, SSS, or TIN number to their record first.`**
  — `assertAnchored` fired because `anchorIdType === 'none'`. To clear it, call
  `updatePerson` with **`anchorIdType` AND the ID value together** (e.g.
  `{ anchorIdType: 'sss', sssNumber }`) — `updatePerson` is a passthrough that does
  **not** infer the anchor from which column you fill, so setting the number alone
  leaves `anchorIdType: 'none'` and the gate still fires. In the UI this is handled
  by the recruitment Hire modal, which captures both fields when the Person is
  unanchored. (`updatePerson` shares `createPerson`'s `23505` plain-language wrap,
  so a duplicate ID on this path also throws "already on file".)
- **`Person not found — a government ID cannot be verified for someone who isn't on file.`**
  — `assertAnchored` against a missing person id.
- **`This person record has been redacted and cannot be edited. If you need to re-register this person, create a new record.`**
  — `updatePerson` on a tombstoned row. Redaction is terminal; re-register instead.
- **`First name and last name cannot be blank.`** — `updatePerson` patch with a
  whitespace-only name. Guards what the DB `NOT NULL` would otherwise let through.
- **`Person not found — no person with id <id>.`** — `updatePerson` / `redactPerson`
  on an id that doesn't exist.
- **`update or delete on table "persons" violates foreign key constraint …`** —
  Postgres `23503`: you tried to hard-delete a Person referenced by an employee or
  applicant. The FKs are `ON DELETE RESTRICT` by design. Use `redactPerson` (tombstone)
  instead of `DELETE`.
- **`Credential not found — no credential with id <id>.`** — `updateCredential` against
  a missing credential id.
- **`[persons/<fn>] … returned no row`** — an internal invariant tripped (a write
  returned nothing). Indicates a deeper DB problem, not a caller mistake.
