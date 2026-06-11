# Slice 3 (extension) — Person identity & credential durability

> **Status:** DESIGN v3 — awaiting Noel's review. (v1 mirror-columns → v2 single-source-of-truth → **v3** folds in round-2 pressure-test fixes and splits the work into 3a + 3b. Do not implement until approved.)
> **Why this exists:** Slice 3 ([3-recruitment-ats](3-recruitment-ats.md)) is built but **not yet tagged**. Reviewing it as the foundation for a 10k-guard system surfaced structural gaps; the **3a** half closes them *before* `slice-3-done` is tagged.
> **Implements:** [ADR 0017](../decisions/0017-person-centric-identity.md) (identity, single source of truth), [ADR 0018](../decisions/0018-credentials-first-class.md) (credentials).
> **Refines:** [ADR 0009](../decisions/0009-hr-starter-and-recruitment-as-entry-point.md), [ADR 0004](../decisions/0004-applicant-pool-legal-classification.md).
> **One design doc, two build plans:** [3a-person-identity-plan](3a-person-identity-plan.md) · [3b-credentials-and-readiness-plan](3b-credentials-and-readiness-plan.md).

---

## 0. Phasing (the 3a / 3b split)

| | **Slice 3a — Person identity spine** | **Slice 3b — Credentials & readiness** |
|---|---|---|
| What | `persons` as single source of truth; applicant/employee become roles; dedup'd backfill; accessor; repoint all identity reads; drop legacy columns; identity-first intake; all-Person matcher | `person_credentials` wallet; hire carries clearances forward; employee licences panel; readiness radar |
| Tag gate | **Must land before `slice-3-done`** (changes how hiring works) | **Additive — does not block the tag** |
| Risk | Carries the one irreversible migration (column drop) → gets the targeted migration-safety review | Low — new table + new surfaces, no destructive change |

The two share this design doc; their build steps are separate plans so 3a is independently buildable, verifiable, and taggable.

---

## 1. Header

- **Status:** DESIGN v3, awaiting approval.
- **Ships:** (3a) `persons` single source of truth; role-FKs on employees/applicants; dedup+backfill; `getEmployeeWithIdentity` accessor + GIN name index on `persons`; identity-first intake with the ID gate at *hire* (a nudge before); all-Person exact matcher + advisory format check + duplicate flag; redaction mechanism. (3b) `person_credentials`; hire carry-forward; licences panel; readiness radar (missing + expiring vs the *credential* required set).
- **Demo-at-end one-liner:** *Log a no-ID walk-in → progress them with an "ID still needed" nudge → enter his PhilSys → "we know this human, terminated 2025-11-02 / currently active CG-10210" → hire (ID now required) → his verified SOSIA/LTOPF appear on the employee → readiness flags an armed guard missing a valid LTOPF.*

---

## 2. What this buys us (plain language)

Two fixes — full reasoning in the ADRs ([0017](../decisions/0017-person-centric-identity.md), [0018](../decisions/0018-credentials-first-class.md)); not re-derived here.

1. **One folder per human, for life — and only one.** Applicant, employee, and rehire all point at a single **Person** that *owns* the name and IDs; role rows hold only their own data, with no duplicated identity to drift. "Have we seen this person?" becomes a lookup. The ID is hard-required only **at hire** (where it feeds payroll/compliance); before that it's a visible nudge — so the front desk and legacy rehires are never blocked.
2. **Licences follow the guard** (3b): the clearances become a real wallet on the Person; hire copies the verified ones in; a radar lists who is **missing or expiring** a *required* licence.

Not a generic party model ([0017](../decisions/0017-person-centric-identity.md) option C, rejected). Payroll *computation* is untouched.

---

## 3. Wireframes

### 3a-i. Identity-first intake — ID optional here, required only at hire
```
 Recruitment · New applicant — Step 1: Who is this person?
 ───────────────────────────────────────────────────────────────────────────
  Name *  [ Juan ] [ Dela Cruz ]      Birthdate [ 1990-04-02 ]
  Government ID (optional now)  [ PhilSys ▾ ] [ 1234-5678-9012 ]  [ Look up ]

  ┌─ ⚠ WE ALREADY KNOW THIS PERSON ──────────────────────────────────────────┐
  │  DELA CRUZ, Juan (b. 1990-04-02)                                          │
  │  • Was CG-10042 — TERMINATED 2025-11-02 (AWOL)                             │
  │  • Currently ACTIVE as CG-10210  ← possible double-hire                    │
  │  • Also applying now at Cebu branch (#A-771) ← concurrent application      │
  │  → [ Continue as this person ]                                            │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ ⚠ Possible duplicate (name + birthdate close) — confirm ────────────────┐
  │  DE LA CRUZ, Juan (b. 1990-04-02)  [ same person ] [ different — new ]    │
  └───────────────────────────────────────────────────────────────────────────┘
 Footer: A walk-in with no ID yet can still be logged. You’ll need it before you can hire them.
```

### 3a-ii. The ID nudge (before hire) and hard gate (at hire)
```
 Applicant · Dela Cruz, Juan      Stage ● Contacted    ⚠ ID still needed before hire
   Primary ID [ PhilSys ▾ ] [ ________________ ]  [ Save ID ]   (advisory format check)
 ...
 Hire ▸   ──►  blocked until an anchor ID is on file:  “Add a government ID before hiring.”
```
> Advancing is **never** blocked by a missing ID (an `idPending` flag + nudge). **Hire** is the hard gate — no employee without an anchor ID. Same path re-intakes a legacy `none` person.

### 3b-i. Employee — Licences & clearances (readiness = missing + expiring; LTOPF caveat)
```
 Employee · Dela Cruz, Juan (CG-10101)  ·  PhilSys 1234-5678-9012  ·  Armed post
 ─────────────────────────────────────────────────────────────────────────────
  TYPE                 NUMBER        EXPIRES       STATUS
  SOSIA license        SG-2024-887   2027-02-01    ● Valid
  LTOPF (firearms)     LT-99102      2026-07-20    ▲ Expiring 40d · firearm link unverified
  NBI clearance        —             2026-05-01    ✗ Expired
  Drug test            —             —             ✗ MISSING (required)
 ─────────────────────────────────────────────────────────────────────────────
```

### 3b-ii. Readiness radar
```
 Recruitment · Licence readiness     Window [ 60 days ▾ ]   Filter [ Armed ▾ ]
  Cruz, Pedro   (CG-10090)    LTOPF MISSING (armed post)   —
  Santos, Maria (CG-10044)    SOSIA expiring               2026-06-22 · 12d
  Reyes, Ana    (CG-10101)    NBI expired                  2026-05-01
```

---

## 4. UX walk-through

1. **New applicant** → Step 1 takes name+DOB; ID optional. A no-ID walk-in is logged (provisional Person).
2. Entering an ID + **Look up** surfaces a known Person — prior termination, a *currently-active* record (double-hire), or a *concurrent application at another branch* — and **Continue as this person** attaches to that one folder. A weak match asks "same / different".
3. The applicant progresses through Contacted → Documents with an **"ID still needed"** nudge; advancing is never blocked.
4. Documents stage: tick clearances with expiry dates (unchanged).
5. **Hire** is blocked until an anchor ID is on file (hard gate). On hire the same Person links to the new employee; (3b) verified clearances become credentials.
6. (3b) Employee record shows **Licences & clearances** incl. **MISSING (required)**; LTOPF shows "firearm link unverified".
7. (3b) **Licence readiness** lists guards missing/expiring a *required* licence.

> Per [conventions](../conventions.md): if a step needs a field §5 lacks, the schema is wrong, not the walk-through.

---

## 5. Components

### 5a. New module `modules/persons/` (3a) — single source of truth
- **`persons`** (owns all identity):
  | Group | Columns | Notes |
  |---|---|---|
  | Name/bio | `firstName`, `lastName` (not null), `middleName`, `suffix`, `dateOfBirth`, `sex` (enum, **nullable forever** — never blocks a save) | |
  | **Anchor IDs (unique, partial)** | `philsysNumber`, `sssNumber`, `tinNumber` | one-per-person nationally |
  | **Member IDs (stored, non-unique)** | `philhealthNumber`, `pagibigNumber` | statutory; *(v2 dropped these with no home — restored here)* |
  | **Secondary IDs (lookup, non-unique)** | `umidNumber`, `passportNumber`, `driversLicenseNumber` | reissued/recycled → never unique |
  | Anchor | `anchorIdType` enum (`philsys`/`sss`/`tin`/`passport`/`umid`/`drivers_license`/`none`) not null default `none` | `none` = provisional/legacy |
  | Address/contact | `addressLine1/2`, `city`, `province`, `postalCode`, `phone`, `email` (**non-unique**) | |
  | Dedup/retention | `suspectedDuplicateOf` (self-FK, nullable), `redactedAt` (timestamptz, nullable tombstone) | |
  | | `createdAt`, `updatedAt` | |
  - **GIN trigram index** `persons_fullname_trgm` on `(first_name || ' ' || last_name)` (pg_trgm already enabled, migration 0009).
- **`person_credentials`** (3b) — see [ADR 0018](../decisions/0018-credentials-first-class.md): `personId`, `credType` (literal recruitment doc-type enum incl. `police_pnp_clearance`), `credNumber`, `issuingBody`, `issuedOn`, `expiresOn`, `status` (`valid`/`expired`/`pending`/`revoked`), `verifiedByUserId`, `verifiedOn`, `notes`.
- **`labels.ts`** — `ANCHOR_ID_LABELS`, `ID_TYPE_LADDER`, `validateIdFormat` (**advisory** — strip separators, plausible-length per type, returns a *warning* the UI can override; legacy grandfathered), `normalizeNameKey`, `CRED_TYPE_LABELS`, `deriveCredState(expiresOn, status, today, window)` → `valid|expiring|expired|revoked|pending` (**`revoked` kept distinct**), `READINESS_CRED_SET(isArmedPost)` (licences/clearances only — **not** the document checklist; excludes `resume_biodata`).
- **Public API:** `createPerson` (accepts `none`), `assertAnchored` (throws only used at hire), `getPerson`, `findPersonByAnyId`, `findPossibleDuplicates`, `updatePerson` (the only identity-edit path; refuses to edit a `redactedAt` person's identity), `redactPerson` (tombstone mechanism; **3b: also deletes the person's credentials — licence numbers are PII**), `addCredential`/`updateCredential`/`listCredentials`/`listCredentialsForPersons` (3b). **`listReadinessIssues` is NOT here — it lives in `hr`** (readiness joins employees + credentials; persons imports nothing downstream — moved there in the 3b pressure test; see [3b done-sweep §4](3b-credentials-and-readiness-done-sweep.md)).
- **`hr.getEmployeeWithIdentity(id)` / `…Page`** — employee ⋈ person accessor (the single read path for identity).

### 5b. `modules/hr/` changes (3a)
- `hr_employees` **drops** all identity columns (name, email, phone, DOB, sss/philhealth/pagibig/tin, address*) and the `emailUq` constraint; **keeps** `employeeCode`, salary, pay frequency, employment type, status, hire/term dates, `rdoCode`, `personId` (NOT NULL post-backfill), and **`isArmedPost`** (the required-credential profile, backfilled from current detachment post type — feeds 3b readiness for legacy guards).
- `createEmployee({ personId, …employmentFields })`; `bulkImportEmployees` creates/links a Person per CSV row (CSV still carries name/IDs → they land on the Person); `updateEmployee` employment-only (identity → `persons.updatePerson`); `searchEmployees`/`listEmployeesPage`/`listEmployees` join `persons`. Retire the email-uniqueness error paths.

### 5c. `modules/recruitment/` changes (3a)
- `recruitment_applicants` **drops** duplicated identity; gains `personId` (NOT NULL post-backfill) + `idPending` (bool). Keeps source/position/armed/stage/dates/outcome/`hiredEmployeeId`.
- `recruitment_blacklist` gains nullable `personId` **and keeps its own name/DOB/SSS snapshot** (retention).
- `createApplicant({ personId, … })`; `advanceStage` sets/clears `idPending` (no block); `hireApplicant` calls `assertAnchored`, links the same `personId`, (3b) carries verified docs → credentials.
- `checkMatches` — exact across **all persons** (applicants of any stage + employees of any status) + blacklist `personId`; active employee → "double-hire", in-flight applicant → "concurrent application"; normalized fuzzy backstop.

### 5d. Backfill — `db/backfills/0021-persons.ts` (3a) — see [3a plan](3a-person-identity-plan.md) for the dedup pre-pass + ordering + quarantine + idempotency.

### 5e. Reads to repoint via the accessor (3a) — the explicit, complete list
`modules/compliance-exports/{sss-r3,bir-2316,bir-2316.pdf(prop type),ytd}` · payroll payslip-list display selects · assignments display selects **incl. the raw `db.execute` SQL (needs an integration test — typecheck won't catch it)** · `app/(admin)/recruitment/[id]` (applicant identity panel + its `checkMatches` call) · `app/(admin)/exports` (the flat `hr.listEmployees`) · employee search/list. Their test fixtures seed a Person. Payroll **computation** unchanged.

### 5f. UI
- (3a) `recruitment/new` two-step + optional lookup + provisional save + the ID nudge/hire-gate; employee edit form **splits** identity → a Person editor.
- (3b) `employees/[id]` licences panel; `recruitment/readiness` radar + nav.

---

## 6. Cross-module contracts

| Caller | Callee | Contract |
|---|---|---|
| `recruitment.createApplicant` | `persons.createPerson`/`getPerson` | attach to a (provisional) Person |
| Step-1 lookup | `persons.findPersonByAnyId` + `findPossibleDuplicates` + `recruitment.checkMatches` | exact (all persons) → fuzzy |
| `recruitment.hireApplicant` | `persons.assertAnchored` + `hr.createEmployee({personId})` + `persons.addCredential` | hard ID gate; link Person; (3b) carry clearances |
| compliance/payroll/assignment/exports readers | `hr.getEmployeeWithIdentity` | single-source identity, no stale copy |
| `hr.updateEmployee` (identity) | `persons.updatePerson` | only identity-edit path |
| `recruitment/readiness` (page) | `hr.listReadinessIssues` | missing + expiring required credentials (service lives in hr — employees ⋈ credentials; moved from the originally-planned persons in the 3b pressure test) |

---

## 7. Done criteria

**3a (must pass before tagging slice 3):**
1. `persons` exists; `hr_employees`/`recruitment_applicants` hold **no identity columns**, only `personId` + role data; `blacklist` has `personId` + its own PII snapshot; employees carry `isArmedPost`.
2. Backfill: dedup+normalize pre-pass (`'' → NULL`, duplicate IDs quarantined to `none`+two-sided `suspectedDuplicateOf`, quarantined ID kept findable + a review report), one Person per employee/applicant, blacklist linked, phase-ordered (employees→applicants→blacklist), batched, idempotent. Unique-index and column-retirement migrations are **SQL-gated** (`RAISE EXCEPTION` on any NULL `personId`) so they physically refuse to run before the backfill completes; legacy columns are **renamed (reversible), backed up (`pg_dump`), with the physical drop deferred** to a post-verification cleanup migration; GIN name index on `persons`.
3. Walk-in logged with **no ID** (provisional); advancing **never blocked** (idPending nudge); anchor ID **hard-required at hire**; format check is advisory; legacy `none` re-intake not blocked.
4. Same anchor ID → one Person; near-match → possible-duplicate confirm; `suspectedDuplicateOf` recorded.
5. `checkMatches` exact across **all persons** (applicants + employees any status) + blacklist; active → "double-hire", concurrent applicant → "concurrent application"; fuzzy returns possibles.
6. Identity edits only via `persons.updatePerson`; **no employee identity columns exist to drift**; `redactPerson` tombstones identity without freeing the unique ID or breaking exports (snapshot-at-generation).
7. **Payroll computation + every government export produce identical output**; the assignments raw-SQL reader has an integration test proving names survive the drop; existing suites pass (fixtures seed a Person).
8. Full suite + typecheck + lint + a Playwright walk of the §4 (3a) steps.

**3b (additive, after 3a):**
9. Hire carries every **verified** non-`resume_biodata` clearance into `person_credentials` (round-trip test on the doc→cred map).
10. Employee licences panel shows Valid/Expiring/Expired/**Revoked**/**MISSING (required)** from the *credential* required set; LTOPF shows "firearm link unverified".
11. Readiness radar lists guards missing/expiring a *required* licence (works for legacy via `isArmedPost`); window is per-credential-aware.
12. Full suite + typecheck + lint + Playwright walk of the §4 (3b) steps.

---

## 8. Discipline rules

- **Single source of truth.** Identity only on the Person; readers use `getEmployeeWithIdentity`; only `persons.updatePerson` writes identity.
- **ID gate at hire, nudge before — never a dead-end.** Provisional `none` Persons are first-class. Nothing operational blocks on a missing ID. Expired *required credentials* are a separate (future) gate.
- **Uniqueness only on PhilSys/SSS/TIN.** Recycled IDs (passport/UMID/DL) non-unique. Member IDs (PhilHealth/Pag-IBIG) stored, non-anchor. Never anchor on a licence number. Format checks advisory.
- **Migration safety:** dedup before unique indexes; `0 NULL personId` gate before the column drop; the raw-SQL reader gets a test.
- **Retention:** redaction (tombstone) mechanism built now; the *purge policy* gated on the [ADR 0004](../decisions/0004-applicant-pool-legal-classification.md) lawyer consult — not auto-wired.
- **Readiness uses a credential set, not the document checklist** (excludes `resume_biodata`); `revoked` ≠ `expired`; LTOPF never shows a clean all-clear (firearm linkage deferred).
- **No abstraction beyond Person + role FKs + credentials.**
- **Cross-slice:** audit + emit on every mutation; UUID PKs + timestamps; plain-language errors; `PageShell`/`ModalShell`; shared `Field`/`TwoCol`/`Pagination`.

---

## 9. Open questions resolved during drafting (round-2 fixes)

- Mirror vs single source of truth → single source (drift bug). Where's the ID gate → **hire** (hard), nudge before (no dead-end). Unique on which IDs → PhilSys/SSS/TIN only. **PhilHealth/Pag-IBIG must live on the Person** (v2 data-loss bug). Readiness set → *credential* set, not the doc checklist (excludes résumé). `isArmedPost` → **on the employee**, backfilled from post type, so legacy guards aren't blind. Retention → redaction mechanism now, purge policy lawyer-gated. ID format → advisory/lenient, grandfather legacy. Matcher → all persons (catches concurrent applications). Email → non-unique on the Person. `revoked` → distinct state. LTOPF → "firearm link unverified", never clean-green. Scope → **split 3a/3b**.

---

## 10. Out of scope (deferred)

| Deferred | Where |
|---|---|
| Full **Person-merge UI** | `suspectedDuplicateOf` + manual reconcile now; polished merge later |
| **LTOPF ↔ firearm/agency** linkage | credential now; linkage with Deployment/inventory ([ADR 0018](../decisions/0018-credentials-first-class.md)) |
| Credential **deployment gate** | data + readiness now; gate with Deployment |
| **Auto-purge** of rejected-applicant Persons | redaction mechanism now; trigger gated on [ADR 0004](../decisions/0004-applicant-pool-legal-classification.md) lawyer consult |
| PhilSys **checksum/registry** verification | advisory format now |
| Document **file** uploads | status+expiry; needs blob storage ([3-recruitment-ats §7](3-recruitment-ats.md)) |
| Expiry **notifications** | radar read-only now |

— end of design v3 —
