# Slice 3a — Person identity spine: done-sweep (T14)

> Verification record for the 3a person-identity slice. Produced by Task 14.
> Status: **verification green; one UI gap found that gates a clean tag — see §5.**
> Date: 2026-06-11. Branch `slice-3-recruitment`.

## 1. Automated gate — GREEN

Run from the workspace's new home on the external drive (`/Volumes/1TB/…`):

- **`pnpm test`** → **323 passed / 323**, 23 files, ~10.5s.
- **`pnpm typecheck`** → clean.
- **`pnpm lint`** → clean; 2 pre-existing warnings only (custom-font in `app/layout.tsx`, a `useEffect` dep in `components/typeahead.tsx`). Neither is identity-related.
- **Payroll/compliance output unchanged** — the compliance-export golden tests (`bir-2316`, `sss-r3`, `ytd`) and payroll reconciliation/compute suites pass byte-for-byte (criterion #7).

This run also doubled as the post-move smoke test: the workspace moved from `~/Desktop`
to the 1TB external drive (HFS+, pnpm store co-located), and the full DB-backed suite
passing from the new location confirms the move broke nothing. See
`reference_workspace_location` memory.

## 2. Browser walk (§4 / 3a steps) — screenshots read

Logged in as `admin@sentinel.local`, walked `/recruitment/new`. Screenshots in
`.playwright-mcp/t14-walk-*.png` (gitignored), each **read** for visual verification:

1. **`t14-walk-1-intake-form.png`** — intake form: first/last name + DOB required (DOB
   labelled "Required — it's how we catch duplicate, terminated, and blacklisted
   matches"), government ID **optional** with a type picker
   (PhilSys/SSS/TIN/Passport/UMID/DL), ID-number field disabled until a type is
   chosen, Look-up button disabled until a name is entered. Renders clean.
2. **`t14-walk-2-lookup-doublehire-flag.png`** — entered "Ana Reyes / 1994-03-12" and
   hit **Look up**. Surfaced, *before saving*: an ochre "Possible existing record (same
   name + date of birth): Ana Reyes — born 1994-03-12" panel, and a red "⚠ Review before
   proceeding: Active employee (possible match): Currently active as CG-10101 — may be a
   double-hire" alert. The all-Person matcher + lookup compose correctly.
3. **`t14-walk-3-provisional-nudge.png`** — saved a fresh walk-in with **no ID**
   (provisional). Redirected to the applicant detail page showing the amber nudge
   "Government ID still needed… a PhilSys, SSS, or TIN number must be on file before they
   can be hired" and "Government ID: **Not set — provisional**". Provisional save +
   `idPending` nudge both work.

(The test applicant created during the walk was deleted afterward; dev DB restored to
2 applicants / 102 persons.)

## 3. T13 deliverables audit (against plan Task 13)

Verified against the actual code (commit `e72e66c` and predecessors):

| # | Deliverable | Status |
|---|---|---|
| 1 | Intake form: name+DOB required, ID optional + picker, advisory `checkIdFormat`, Look-up panels | ✅ done |
| 2 | `createApplicant` full gov-ID ladder, anchor-by-preference, `idPending` on provisional save | ✅ done |
| 3 | Detail page: idPending banner (active+idPending), generic anchor display, plain-language hire-gate copy | ✅ done |
| 4 | `checkMatches` widened to PhilSys/TIN channels | ✅ done |
| 5 | `lookupPersonAction` composing `findPersonByAnyId` + `findPossibleDuplicates` + `checkMatches` | ✅ done |
| 6 | `updatePerson` rejects blank first/last name | ✅ done |
| 7 | Employee edit-form identity split → `persons.updatePerson` (form-level diff) | ✅ done — **shipped in T11** (`9ce6357`/`4b485f9`) + T12 fix (`307e63a`); `e72e66c` touched no `employees/` files. Plan attribution corrected. |
| 8 | Re-applicant visibility | ⚠️ by-design: `checkMatches` excludes terminal-stage (`hired`/`rejected`/`withdrawn`) applicants — a rejected re-applicant is flagged only via a shared gov-ID or a terminated-*employee* hit. Documented in the recruitment README. |
| 9 | `hireApplicant` `assertAnchored` gate (verbatim error confirmed) | ✅ done |

## 4. Docs reconciled this sweep

- **`modules/persons/README.md`** created (Purpose / Public API / Dependencies / Known
  failure modes), including the documented **schema-import exception** (role schemas
  import the `persons` table object directly for their FK).
- **`modules/hr/README.md`** corrected: removed the retired email-uniqueness failure
  modes (single-create + two CSV-email modes), fixed `createEmployee`/`updateEmployee`
  identity behavior, added the new identity-spine error signatures (`person_id` NOT NULL,
  persons FK RESTRICT, duplicate-gov-ID).
- **`modules/recruitment/README.md`** corrected: deleted the stale pre-T7 "duplicate
  Person minted at hire" note, updated `createApplicant`/`checkMatches`/`hireApplicant`,
  added the identity-spine error signatures + the item-8 re-applicant behavior.
- **`wiki/runbooks/0024-retire-legacy-identity.md`** — added the lock-window note.
- **`wiki/slices/3a-person-identity-plan.md`** — Tasks 5/10/13 annotated with shipped
  reality (no migration 0023; T10 GIN follow-up resolved by the stress harness; T13
  edit-form attribution).
- **`.gitignore`** — `drizzle/migrations/meta/` ignored (stray `db:generate` ledger,
  out of sync with the 23 hand-written migrations).

## 5. ⚠ Finding — provisional applicants have no UI path to add a government ID

**What the walk found.** The intake form lets a recruiter save a walk-in with **no
government ID** (provisional — the intended path for someone without papers yet). The
applicant detail page then nudges: *"Government ID still needed… Add it with **Edit** on
their identity record."* But there is **no such Edit**:

- the word "Edit" in the banner is plain bold text (`app/(admin)/recruitment/[id]/page.tsx:101`), not a link;
- there is **no applicant identity-edit route** — `app/(admin)/recruitment/` has only `new/`, `[id]/` (detail + hire-modal), `blacklist/`;
- the **hire modal** (`[id]/hire-modal.tsx`) collects only employee code / salary / hire date — not an ID.

**Consequence.** A provisional applicant is a dead end: they can be screened and advanced,
but **can never be hired** — `hireApplicant` calls `assertAnchored`, which throws without
an anchor ID, and there is no UI to add that ID. The data model fully supports it
(`persons.updatePerson` exists and is wired for the *employee* edit form); only the
recruitment-side affordance is missing.

**Severity.** This is a core-flow gap, not an edge case — making the ID optional at intake
is the whole point of "identity-first but don't block the walk-in," so provisional
applicants are expected. The nudge copy actively misleads (points to a non-existent
action).

**Stress-test result (two independent red-team reviews of the naive "gov-ID modal → `updatePerson`" fix).** The first-pass fix was wrong on three counts:

1. **It wouldn't even work (kill-shot).** `persons.updatePerson` is a passthrough — it does **not** recompute `anchorIdType`. `assertAnchored` gates solely on `anchorIdType === 'none'` (`modules/persons/service.ts:236`), and only `createPerson` ever sets the anchor. A modal that calls `updatePerson({ sssNumber })` stores the number but leaves `anchorIdType='none'`, so the hire gate **stays shut**. The cleared path is `updatePerson(id, { anchorIdType, <idField> })` — anchor + value together (proven by `persons.test.ts:307-315,477-485`). The two module READMEs that said "add an ID via updatePerson" were themselves wrong and have been corrected.
2. **Stale `idPending`.** `recruitment_applicants.idPending` is a stored column maintained only by `createApplicant` + `advanceStage` (`computeIdPending`), and the nudge reads the stored flag (`page.tsx:93`). An add-ID action that only touches the Person leaves `idPending=true` — the page would show the ID present *and* "ID still needed." Needs a recruitment service entry point to reconcile it (or derive the nudge from `person.anchorIdType` at render).
3. **Too narrow + wrong vehicle.** The real gap is "**no applicant identity edit at all**" — a mistyped DOB/name (which drive the matcher) is equally unfixable, not just gov-ID. And the app's convention is record-edits via the `DetailLayout` view/edit toggle on a **page** (employees, clients); modals are reserved for discrete actions (Hire, ChangeStatus). A bespoke gov-ID modal duplicates `updatePerson` plumbing the employee editor already has.

**Revised plan:**
- **What's actually required (verified by direct code read, not just the reviewers):** the anchor is settable *today* — `updatePerson` already accepts `anchorIdType` in its patch (it's not in the `IMMUTABLE` strip list, `service.ts:376`), so the calling action just passes `{ anchorIdType, <idField> }` **together**. The trap is that `updatePerson` does NOT *infer* the anchor (`service.ts:394-398`), so sending the ID number alone leaves `anchorIdType='none'` and `assertAnchored` (`service.ts:236`) keeps blocking. No mandatory `updatePerson` rewrite. The genuinely missing service/recruitment pieces are: **(a)** on an *edit-during-screening* path, reconcile the applicant's stored `idPending` — the logic already exists as the private `computeIdPending` (`recruitment/service.ts:289-297`); it just needs exposing (today only `advanceStage` recomputes it); **(b)** wrap `updatePerson`'s update in the `23505` plain-language handler (nice-to-have). **Key simplification:** the HireModal-capture path **sidesteps (a) entirely** — the applicant becomes an employee at hire, so its `idPending` no longer matters — leaving only "pass `anchorIdType` in the hire action" + the `23505` wrap.
- **UI — scope-gated on the open Commander anchor-ID intake SOP** (do IDs reliably arrive *during screening* or only *by hire*? ADR 0017 even notes first-timers whose SSS/TIN is issued *because* they're hired):
  - **SOP-agnostic minimum:** capture ID-type + ID-number in the existing **HireModal** (`hire-modal.tsx`) — hire is the only place the anchor is actually *required*; matches the modal-for-discrete-action convention; near-zero new surface; correct under either SOP answer.
  - **If IDs arrive during screening:** extract the employee identity sub-form into a shared **Person identity editor** (`DetailLayout` toggle + `@/components/form` + `updatePerson`) and mount it on **both** the employee and applicant detail pages — fixes the *whole* identity-edit gap (DOB/name/contact/gov-ID), no duplicated plumbing.
- **Immediate copy stopgap (regardless):** the detail-page nudge still points to an "Edit" that doesn't exist (`page.tsx:99-101`) — fix that copy now so it stops promising a non-existent action.

**Recommendation:** 3a **fast-follow before tagging slice-3-done**. Land the service-layer prerequisite + the copy stopgap now; build the **HireModal capture** as the SOP-agnostic UI; upgrade to the shared identity editor once Commander confirms when IDs actually arrive.

## 6. Backlog carried out of 3a

- **T12b** — physically drop the `legacy_*` columns (separate gated migration, after the
  app is verified live on the Person); remove the `legacy_*` assertions from
  `modules/_regression/tests/slice2-schema.test.ts`; tighten hr accessors LEFT→INNER JOIN.
- **ILIKE wildcard-escape** — terms passed to the `employeeCode` `ILIKE` fallback aren't
  escaped for `%`/`_` (low-severity search hygiene; trigram name path + numeric SSS branch
  unaffected).
- **T10 UNION rewrite** — parked option, only if the join plan ever stops engaging
  `persons_fullname_trgm` (stress harness confirms it engages at 50k today).
- **`next lint` deprecation** — migrate to the ESLint CLI before Next.js 16.
