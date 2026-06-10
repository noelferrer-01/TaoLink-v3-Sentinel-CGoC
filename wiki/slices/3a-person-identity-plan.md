# Slice 3a — Person Identity Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Make `persons` the single source of truth for human identity; reduce `hr_employees`/`recruitment_applicants` to role-records; migrate safely off the old identity columns — without changing payroll output or government-export bytes. **This is the load-bearing half that must land before tagging slice 3.**

**Architecture:** New `modules/persons`. Identity reads go through `hr.getEmployeeWithIdentity` (employee ⋈ person). GIN name index moves to `persons`. ID gate at *hire* (nudge before). Implements [ADR 0017](../decisions/0017-person-centric-identity.md); design [3-identity-and-credentials](3-identity-and-credentials.md). Credentials/readiness are the separate [3b plan](3b-credentials-and-readiness-plan.md).

**Tech Stack:** TypeScript, Next.js 15, Drizzle + Postgres 16, Vitest (vs `sentinel_test`), Playwright.

**Green-keeping order:** new module isolated (T1–2) → nullable FKs (T3) → **dedup'd backfill** (T4) → unique indexes post-backfill (T5) → accessor (T6) → writers create/link a Person, legacy columns still written transitionally (T7) → repoint every reader (T8–10) → identity edits + matcher + gates (T11) → **drop legacy columns, gated on 0 NULL personId** (T12) → UI (T13) → verify (T14). The transient dual-write (T7→T12) is never a shipped state.

---

### Task 1: `persons` module — schema + labels + migration 0021

**Files:** Create `modules/persons/{schema,labels,index}.ts`; migration `drizzle/migrations/0021_persons.sql`.

- [ ] **Step 1: `schema.ts`** — `persons` per [contract §5a](3-identity-and-credentials.md). Enums `person_sex`, `person_anchor_id_type` (`philsys/sss/tin/passport/umid/drivers_license/none`). **Unique partial indexes** (`uniqueIndex`, NULLs allowed) on `philsysNumber/sssNumber/tinNumber` only; **plain index** on `umidNumber/passportNumber/driversLicenseNumber`. Columns incl. `philhealthNumber`, `pagibigNumber` (stored, non-unique), `suspectedDuplicateOf` (self-FK), `redactedAt` (timestamptz null), `email` (non-unique). *(person_credentials is created in 3b.)*
- [ ] **Step 2:** Hand-add the GIN index to the migration:
```sql
CREATE INDEX persons_fullname_trgm ON persons USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
```
- [ ] **Step 3: `labels.ts`** — `ANCHOR_ID_LABELS`, `ID_TYPE_LADDER = ['philsys','sss','tin','passport','umid','drivers_license'] as const`, `normalizeNameKey`, and the **advisory** validator (warns, never throws — caller decides; legacy grandfathered):
```ts
// Returns a human warning string, or null when it looks fine. NEVER hard-rejects.
export function checkIdFormat(type: AnchorIdType, raw: string): string | null {
  const v = raw.replace(/[\s-]/g, '');
  const ok =
    type === 'philsys' ? /^\d{12}(\d{4})?$/.test(v) :        // 12-digit PSN or 16-digit card; confirm w/ PSA
    type === 'sss'      ? /^\d{10}$/.test(v) :
    type === 'tin'      ? /^\d{9}(\d{3})?$/.test(v) :         // 9 base (+3 branch)
    v.length >= 4;                                            // passport/umid/dl: lenient
  return ok ? null : `That ${type.toUpperCase()} number looks unusual — double-check it. You can still save it.`;
}
```
> **Exact PH formats are advisory and to be confirmed with the client/PSA — do NOT hard-block on them.** This deliberately avoids the v2 "too-strict regex blocks intake" trap.
- [ ] **Step 4:** `pnpm db:generate` → add the GIN index (Step 2) → `pnpm db:migrate`. **Step 5:** `pnpm typecheck`. **Step 6: Commit** — `feat(persons): identity schema + advisory labels (0021)`

---

### Task 2: `persons` service — createPerson / assertAnchored / lookups / redact

**Files:** Create `modules/persons/service.ts`, `persons.test.ts`

- [ ] **Step 1: Failing tests** — `createPerson` accepts `anchorIdType:'none'`; warns-not-blocks on odd format; rejects a duplicate *unique* ID (`23505` → "already on file"); `assertAnchored` throws on `none`, passes once anchored; `findPersonByAnyId` matches across columns; `findPossibleDuplicates` matches on `normalizeNameKey`; `updatePerson` refuses to edit identity of a `redactedAt` person; `redactPerson` nulls identity fields, sets `redactedAt`, **keeps the unique-ID slot tombstoned** (a redacted SSS is not re-mintable).
- [ ] **Step 2: fail. Step 3: Implement.** Audit + emit `person.created`/`person.updated`/`person.redacted`.
- [ ] **Step 4: pass. Step 5: Commit** — `feat(persons): create(none-ok)/assertAnchored/lookups/redact + tests`

---

### Task 3: Nullable role FKs + employee armed flag + applicant idPending (migration 0022)

**Files:** Modify `modules/hr/schema.ts`, `modules/recruitment/schema.ts`; migration `0022_role_fks.sql`

- [ ] **Step 1:** Add nullable `personId → persons.id` to `employees`, `applicants`, `blacklist`; add nullable `isArmedPost boolean` to `employees`; add `idPending boolean default false` to `applicants`.
- [ ] **Step 2:** `pnpm db:generate`/`migrate`. **Step 3:** `pnpm typecheck` + `pnpm test` fully green (nothing reads them yet). **Step 4: Commit** — `feat(hr,recruitment): nullable personId + isArmedPost + idPending (0022)`

---

### Task 4: Backfill with dedup pre-pass (the migration-safety core)

**Files:** Create `db/backfills/0021-persons.ts`; `db/backfills/backfill.test.ts`; `db:backfill:persons` script.

- [ ] **Step 1: Failing tests** covering every safety case:
  - **Dedup:** two employees with the **same** SSS → first keeps `anchorIdType='sss'`, second gets `'none'` + `suspectedDuplicateOf` set + its `persons.sssNumber` left NULL (value preserved in a note).
  - **Empty-string:** an employee with `sssNumber=''` → Person `sssNumber` NULL, `anchorIdType='none'`.
  - **Phase order:** an applicant with `hiredEmployeeId` → links to that employee's Person (employees processed first), no duplicate Person minted.
  - **Idempotent:** second run changes nothing.
  - **Quarantine:** a row that would violate a unique index is caught and routed to `none`, run continues.
  - `isArmedPost` set from the source rule (or defaulted + flagged) for every employee.
- [ ] **Step 2: fail. Step 3: Implement** in strict order: (a) **normalize** — `UPDATE … SET sss_number=NULL WHERE trim(sss_number)=''` (and tin/philsys, and the blacklist snapshot), trim the rest; (b) **build duplicate sets** for sss/tin/philsys (in-memory map is the real dedup — the DB unique index doesn't exist yet, so the 23505 catch is only a re-run backstop, not the primary guard; the dedup is only as good as the normalization in (a)); (c) **employees** → one Person each, first occurrence keeps the anchor, duplicates → `none` + **two-sided** `suspectedDuplicateOf` (link the dup→anchor *and* flag the anchor), set `personId`, set `isArmedPost`; **the duplicate's real ID is preserved in `notes` AND a `quarantinedIds` text lookup so `findPersonByAnyId` can still surface it** (otherwise a future rehire of that human mints a *third* Person — a hole the safety mechanism would otherwise create); (d) **applicants** → link via `hiredEmployeeId`'s now-set `personId`, else mint; (e) **blacklist** → set `personId` on confident matches. **Batch/stream** (cursor or LIMIT/OFFSET, not all 20k rows + per-row blacklist scan into memory → avoid O(employees×blacklist)); per-row txn; guard `personId IS NULL`; `try/catch` 23505 → quarantine to `none`. Near-duplicate detection uses `normalizeNameKey` (collapses `dela`/`de la`) so name-variant dups are flagged, not just exact-ID ones.
- [ ] **Step 4:** Emit a **quarantine report** (every row routed to `none` + every `suspectedDuplicateOf` pair) for human review before go-live — silent quarantine reads as "all clean." Run against dev DB. **Step 5: Commit** — `feat(db): dedup+normalize persons backfill (migration-safe, idempotent, reported)`

---

### Task 5: Create the unique indexes AFTER backfill (migration 0023) — SQL-enforced ordering

> **✅ Shipped — reconciled at 3a-T14:** there is **no standalone migration 0023**. The partial-unique indexes (`persons_philsys_uq` / `persons_sss_uq` / `persons_tin_uq`) were folded into **`0021_persons.sql:73-79`**, created at table-creation time. That's safe because `persons` starts empty and the dedup backfill (T4) never inserts a duplicate gov-ID — a separate post-backfill index migration was unnecessary. The ordering seam this task worried about is still closed by **0024's `RAISE EXCEPTION` gate** (T12). Live migration sequence: **0021 → 0022 → 0024**.

> **The ordering seam (review's kill shot):** the backfill (T4) is a `tsx` script, but `pnpm db:migrate` auto-applies *every* pending `.sql` file in one pass (`drizzle/migrate.ts` wraps each file in `sql.begin`). So 0023/0024 must **physically refuse to run** until the backfill has completed — human discipline is not a safeguard.

**Files:** migration `0023_persons_unique_ids.sql`

- [ ] **Step 1: First statement is an SQL gate that aborts the migration if the backfill hasn't run** (a bare `SELECT count(*)` is a no-op — it must `RAISE`):
```sql
DO $$ BEGIN
  IF (SELECT count(*) FROM hr_employees WHERE person_id IS NULL) > 0
     OR (SELECT count(*) FROM recruitment_applicants WHERE person_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill db:backfill:persons has not completed — refusing to build unique indexes.';
  END IF;
END $$;
```
- [ ] **Step 2:** Then `CREATE UNIQUE INDEX … persons_{philsys,sss,tin}_uq` (partial, `WHERE … IS NOT NULL`). Plain (not `CONCURRENTLY` — illegal inside the runner's txn; sub-second on 10k rows). Dedup'd by T4, so no `23505`.
- [ ] **Step 3:** Document the deploy order in the plan/runbook: `pnpm db:migrate` (applies 0021/0022) → `pnpm db:backfill:persons` → `pnpm db:migrate` (applies 0023, then 0024). The 0022→backfill→0023 resting state is valid and expected.
- [ ] **Step 4: Commit** — `feat(db): unique indexes on PhilSys/SSS/TIN, gated on backfill (0023)`

---

### Task 6: `getEmployeeWithIdentity` accessor

**Files:** Modify `modules/hr/service.ts`; test

- [ ] **Step 1: Failing test** — `getEmployeeWithIdentity(id)` and `…Page` return employment fields + person name/IDs/address merged.
- [ ] **Step 2: fail. Step 3: Implement** the `employees ⋈ persons` join accessor. **Step 4: pass. Step 5: Commit** — `feat(hr): getEmployeeWithIdentity accessor`

---

### Task 7: Writers create/link a Person (transitional dual-write)

**Files:** `modules/hr/service.ts` (`createEmployee`, `bulkImportEmployees`), `modules/recruitment/service.ts` (`createApplicant`, `hireApplicant`); fixtures.

- [ ] **Step 1: Failing tests** — each writer leaves `personId` set + a `persons` row; legacy columns still populated (transitional, still NOT NULL until T12).
- [ ] **Step 2: fail. Step 3: Implement** — each writer `persons.createPerson` (or links a passed `personId`) then writes the role row + `personId`, **and** keeps writing legacy columns. `hireApplicant` passes `a.personId` into `createEmployee`. Update suite fixtures to expect a Person.
- [ ] **Step 4: pass.** Full suite green. **Step 5: Commit** — `refactor: identity writers create/link a Person (transitional dual-write)`

---

### Task 8: Repoint compliance exports to the accessor

**Files:** `modules/compliance-exports/{sss-r3,bir-2316,bir-2316.pdf,ytd}.ts(x)` (+ the PDF component's `emp` **prop type**); their test fixtures.

- [ ] **Step 1:** Read identity via `getEmployeeWithIdentity`/join (RDO stays on employee); change the PDF component prop type to the merged shape.
- [ ] **Step 2:** Fixtures seed a Person; assert **byte-identical** output vs pre-change golden values (criterion #7).
- [ ] **Step 3:** `pnpm test compliance` green. **Step 4: Commit** — `refactor(compliance-exports): identity via Person accessor (output unchanged)`

---

### Task 9: Repoint payroll/assignment/recruitment-detail/exports reads (+ raw-SQL test)

**Files:** `modules/payroll/service.ts` (**the two payslip-list display joins ~`:373-389` and `:417-438`, which select `employees.firstName/lastName`**), `modules/assignments/service.ts` (incl. the raw `db.execute` join ~`:261-278`), `app/(admin)/recruitment/[id]/page.tsx`, `app/(admin)/exports/page.tsx` (the flat `hr.listEmployees`).

- [ ] **Step 1: Failing test** — an **integration test over the assignments overlapping-employees query** asserting names come back after the join (typecheck will NOT catch the raw SQL — this test is the guard). Also a payroll payslip-list test asserting the guard name still renders.
- [ ] **Step 2: fail. Step 3: Implement** the joins; hand-write the join into the assignments raw SQL; repoint **both payroll display joins**; repoint the recruitment detail identity panel + its `checkMatches` args to the Person; repoint the flat `listEmployees`. **Also retire `bulkImportEmployees`' email-dedup pre-check** (`existingEmails`/`seenInBatch`, ~`:399-423`) since email uniqueness goes away (T11/T12) — and audit for any `Map`/`Set` keyed on employee email anywhere (it can no longer be assumed unique).
- [ ] **Step 4: pass. Step 5: Commit** — `refactor(payroll,assignments,recruitment,exports): identity via Person (+ raw-SQL & payroll tests)`

---

### Task 10: Employee search/list via Person name (GIN-indexed, EXPLAIN-verified)

**Files:** `modules/hr/service.ts` (`searchEmployees`, `listEmployeesPage`); employees list page.

- [ ] **Step 1: Failing test** — name search returns the right employee ordered by similarity (now on `persons`).
- [ ] **Step 2: fail. Step 3: Implement** the join + similarity on `persons`. **Run `EXPLAIN`** on the joined search query; if the planner does not use `persons_fullname_trgm`, switch the predicate to the `%` operator + `set_limit(0.2)` (the GIN-friendly form) instead of bare `similarity() > 0.2`.
- [ ] **Step 4: pass + EXPLAIN shows an index scan. Step 5: Commit** — `refactor(hr): employee search via Person name (GIN verified)`

> **✅ Shipped + follow-up — reconciled at 3a-T14:** built with the `%` + `set_limit(0.2)` GIN-friendly form. EXPLAIN on the **joined** query (employees ⋈ persons) left an open question — would the planner engage `persons_fullname_trgm` on a join plan, or is a `UNION` rewrite needed? The **stress harness** (`pnpm db:stress`, commits `15dc24e`/`55fc680`) later confirmed the GIN index **does engage at 50k rows**, resolving the follow-up; the UNION rewrite stays parked as an option only if the join plan regresses. Applicant name search (`listApplicantsPage`) was moved onto the same shared GIN path (`55fc680`), with the primitives extracted to `modules/persons/search.ts`. **Backlog:** terms passed to the `ILIKE` `employeeCode` fallback are not escaped for LIKE metacharacters (`%`, `_`) — low-severity search-hygiene item (the numeric SSS branch and the trigram `%` name path are unaffected).

---

### Task 11: Identity edits → Person; recruitment gates + all-Person matcher

**Files:** `modules/hr/service.ts` (`updateEmployee`), `modules/recruitment/service.ts` (`advanceStage`, `hireApplicant`, `checkMatches`); tests.

- [ ] **Step 1: Failing tests** — `updateEmployee` employment-only (identity via `persons.updatePerson`); the retired email-uniqueness path no longer referenced; `advanceStage` sets/clears `idPending` and **never blocks** on a missing ID; `hireApplicant` **throws without an anchor ID** (`assertAnchored`) and succeeds with one; `checkMatches` returns `exact` across **all persons** (applicant of any stage + employee of any status) + blacklist, tagging an active employee "possible double-hire" and an in-flight applicant "concurrent application"; fuzzy returns `possible`.
- [ ] **Step 2: fail. Step 3: Implement.** Retire `createEmployee`/`updateEmployee` email-23505 handlers. **Step 4: pass** (payroll suite still green). **Step 5: Commit** — `feat(hr,recruitment): identity via Person; hire ID gate; all-Person matcher`

---

### Task 12: Retire legacy identity columns — gated + reversible (migration 0024)

> **The irreversible step, made reversible.** Rather than a hard `DROP` against 10k live rows, 0024 **renames** the identity columns to `legacy_*` (data retained, hidden from Drizzle, code reads only the Person) behind the same SQL gate. This gives a one-release recovery window: if a missed reader returns nulls in prod, the data is still physically there. The **physical drop is a separate, later cleanup migration (Task 12b)** run only after the app is verified live on the Person.

**Files:** `modules/hr/schema.ts`, `modules/recruitment/schema.ts`; migration `0024_retire_legacy_identity.sql`; remove the T7 transitional writes.

- [ ] **Step 1: Backup precondition (runbook + deploy guard).** Take a verified `pg_dump` of `hr_employees` + `recruitment_applicants` (or full DB) immediately before 0024; the deploy step refuses to proceed without a fresh dump artifact. Write the restore command into the runbook.
- [ ] **Step 2: SQL-enforced statement order in 0024** (gate first; `SET NOT NULL` acts as a second gate; rename — not drop — the identity columns):
```sql
DO $$ BEGIN
  IF (SELECT count(*) FROM hr_employees WHERE person_id IS NULL) > 0
     OR (SELECT count(*) FROM recruitment_applicants WHERE person_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete — refusing to retire identity columns.';
  END IF;
END $$;
ALTER TABLE hr_employees           ALTER COLUMN person_id SET NOT NULL;      -- second gate: throws on any stray NULL
ALTER TABLE recruitment_applicants ALTER COLUMN person_id SET NOT NULL;
-- rename (NOT drop) each identity column → legacy_*, and DROP NOT NULL on renamed cols so new inserts don't need them:
ALTER TABLE hr_employees RENAME COLUMN first_name TO legacy_first_name;      -- …repeat for last/middle/email/phone/dob/sss/philhealth/pagibig/tin/address*
ALTER TABLE hr_employees ALTER COLUMN legacy_first_name DROP NOT NULL;        -- …repeat for the formerly-NOT NULL ones
ALTER TABLE recruitment_applicants RENAME COLUMN first_name TO legacy_first_name; -- …etc; drop NOT NULL on legacy_first_name/legacy_last_name
DROP INDEX IF EXISTS hr_employees_email_uq;
DROP INDEX IF EXISTS hr_employees_fullname_trgm;
```
- [ ] **Step 3: Abort-before-damage test** — run 0024 against a DB seeded with one NULL-`personId` row; assert it **throws** AND the identity columns **still exist** afterward (proves the gate aborts before any rename).
- [ ] **Step 4:** Remove the transitional legacy-column writes (T7) from all four writers (Drizzle schema no longer declares the renamed columns, so writers stop touching them).
- [ ] **Step 5:** `pnpm db:generate`/`migrate`; **`pnpm typecheck` surfaces any straggler typed reader** — fix to the accessor (the assignments raw-SQL reader is covered by T9's integration test, the one typecheck can't see). `pnpm test` fully green.
- [ ] **Step 6: Commit** — `refactor: retire (rename) duplicated identity columns, gated + reversible — Person is sole source of truth (0024)`

---

### Task 12b (deferred, post-verification): physically drop the `legacy_*` columns

- [ ] After the app is verified running on the Person in the target env (and slice 3 tagged), a one-line migration `00NN_drop_legacy_identity.sql` drops the `legacy_*` columns. Same gate prefix. This is intentionally a **separate, later** step so the rename window can save us if a reader was missed. Tracked in the backlog, not a 3a blocker.

---

### Task 13: UI — identity-first intake + edit-form identity split

**Files:** `app/(admin)/recruitment/new/` (+ `lookupPerson` action); `app/(admin)/employees/[id]/` edit form + actions.

- [ ] **Step 1:** `lookupPerson(idType?, idValue?, name?, dob?)` → `findPersonByAnyId` + `findPossibleDuplicates` + `checkMatches`.
- [ ] **Step 2:** Step-1 form (name+DOB required, ID **optional** with the advisory `checkIdFormat` warning + **Look up** rendering known-person / possible-duplicate panels per §3a); save → `createPerson` (provisional if no ID) then `createApplicant`. Show the **"ID still needed"** nudge on the applicant (no block); the **Hire** action blocks without an anchor ID.
- [ ] **Step 3:** Split the employee edit form — employment → `hr.updateEmployee`, identity → `persons.updatePerson` (fixes the BIR-readiness remediation path).
- [ ] **Step 4:** typecheck + component tests green. **Step 5: Commit** — `feat(recruitment-ui,employees-ui): identity-first intake + Person identity editor`

> **✅ Shipped — reconciled at 3a-T14:** intake + lookup + provisional save + "ID still needed" nudge + hire gate landed in **`e72e66c`** (suite 323/323). **Step 3 (employee edit-form identity split) actually shipped earlier, in T11** (`9ce6357`/`4b485f9`) plus a T12 fix (`307e63a`): the action splits the patch server-side via `IDENTITY_FIELDS` and a form-level diff against `getEmployeeWithIdentity`, so `e72e66c` touched no `employees/` files. **Known behavior (audit item 8):** `checkMatches` excludes terminal-stage (`hired`/`rejected`/`withdrawn`) applicants from the in-flight channel **by design** — a re-applying rejected candidate is flagged only via a shared gov-ID (known-person) or a terminated-*employee* hit. Documented in the recruitment README; revisit if recruiters need rejected-history surfacing.

---

### Task 14: Verify 3a

**Files:** `modules/persons/README.md`; update `modules/hr/README.md` + `modules/recruitment/README.md` (resolve the "no stable national ID yet" line); `wiki/slices/3a-person-identity-done-sweep.md`.

- [ ] **Step 1:** `pnpm test && pnpm typecheck && pnpm lint` — green; **payroll/compliance output unchanged**.
- [ ] **Step 2:** Playwright walk of the §4 (3a) steps: no-ID walk-in logged → progress with nudge → add ID → returning-guard "we know this person" + double-hire/concurrent flags → hire blocked then allowed. Screenshot + **Read** each.
- [ ] **Step 3:** READMEs + done-sweep. **Step 4: Commit** — `docs(persons): README + 3a done-sweep; verify green`

---

## Self-Review

**Coverage vs [contract §7 (3a)](3-identity-and-credentials.md):** #1 T1/T3/T12 · #2 T4/T5/T12 · #3 T2/T11/T13 · #4 T2/T11 · #5 T11 · #6 T2/T11/T12 · #7 T8/T9(raw-SQL test)/T12(gate)/T14 · #8 T14. ✅

**Round-2 fixes embedded:** philhealth/pagibig on persons (T1) · advisory ID format, grandfather legacy (T1) · ID gate at hire not advance (T11/T13) · all-Person matcher incl. concurrent applicants (T11) · all readers enumerated incl. exports flat list + PDF prop type + payroll display joins (T8/T9) · email non-unique, retire email paths + bulk-import email dedup (T9/T11/T12) · redaction mechanism (T2) · GIN EXPLAIN check (T10).

**Migration-safety-review fixes embedded (the irreversible part):** the ordering seam closed — unique-index (T5) and column-retirement (T12) migrations carry an **SQL `DO $$ … RAISE EXCEPTION` gate** so `pnpm db:migrate` physically refuses to run before the backfill completes (human discipline is not the safeguard) · deploy order documented (migrate → backfill → migrate) · **rename-not-drop** (T12) + **`pg_dump` backup precondition** + **physical drop deferred** to post-verification T12b → the irreversible step is now reversible · correct 0024 statement order (gate → `SET NOT NULL` as a second gate → rename) · **abort-before-damage test** (T12 Step 3) · quarantined dup IDs kept **findable** + two-sided `suspectedDuplicateOf` + a **quarantine report** (T4) so the safety mechanism doesn't itself create a dedup hole · backfill **batched** (no O(employees×blacklist)) · the assignments **raw-SQL** reader + **payroll display joins** + **bulk-import email dedup** explicitly in scope with tests (T9).

**Sequence:** transitional dual-write (T7) precedes read-repoint (T8–10) and the gated drop (T12); each task ends green. `recruitment_applicants.firstName/lastName` (NOT NULL today) stay populated until T12. ✅

**Placeholders:** real code for `checkIdFormat` (T1); dedup backfill spelled out (T4); other risky logic described concretely. UI references proven `PageShell`/`ModalShell`/`Field` patterns. No TBD.
