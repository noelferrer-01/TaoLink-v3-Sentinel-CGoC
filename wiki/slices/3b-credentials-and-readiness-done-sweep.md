# Slice 3b — Credentials & Readiness: done-sweep (Task 7)

> Verification record for the 3b credentials slice (additive — does not gate the
> already-shipped `slice-3-done` tag). Produced by Task 7.
> Status: **verification GREEN.**
> Date: 2026-06-11. Branch `slice-3b-credentials`.

## 1. Automated gate — GREEN

- **`pnpm test`** → **363 passed / 363**, 24 files, ~11s. (3b added 30 tests:
  14 credential-label/state unit, 8 credential-service, 2 batch-reader, 6 readiness,
  2 hire carry-forward + doc→cred round-trip.)
- **`pnpm typecheck`** → clean.
- **`pnpm lint`** → clean; the same 2 pre-existing warnings only (custom-font in
  `app/layout.tsx`, a `useEffect` dep in `components/typeahead.tsx`). Neither is 3b.
- **Payroll suite unchanged** — hire's new credential carry-forward did not perturb
  the payroll/compliance path (full suite green; the hire→no-payslip test still passes).

> Flake watch: running `recruitment` + `payroll` as a hand-picked 2-file combo can
> trip the pre-existing audit-time-window assertion (`auditLog.createdAt >= testStart`
> returns `[]` under clock skew). Payroll passes alone and in the full suite; this is
> the known test-flake watch-item, not a 3b regression.

## 2. Browser walk (§4 / 3b steps) — screenshots read

Logged in as `admin@sentinel.local` (dev server on :3001). Screenshots in
`.playwright-mcp/3b-walk-*.png` (gitignored), each **read** for visual verification:

1. **`3b-walk-1-readiness-radar.png`** — `/recruitment/readiness`: title + plain-language
   description, the "Expiring within (30/60/90)" + "Posts (All/Armed)" filters, a table of
   guards with **Missing (required)** chips (ochre dashed), employee-code links, and
   pagination ("page 1 of 12"). The missing-credential diff runs against real seeded
   employees (criterion #11).
2. **`3b-walk-2-licences-panel.png`** — employee CG-10001's detail page: the new
   **Licences & clearances** panel below the employee fields, 8 base required rows
   (unarmed guard → no LTOPF), each a `* Missing (required)` chip + inline Add form
   (criterion #10).
3. **`3b-walk-3-credential-added.png`** — added an NBI clearance inline (number +
   far-future expiry): the row flipped to a green **Valid** chip and switched to the
   edit (Save) form. `addCredentialAction` persists + re-renders live.
4. **`3b-walk-4-ltopf-caveat-expiring.png`** — added an LTOPF licence (expiry ~39d out):
   the row shows the **"firearm link unverified"** caveat note (ADR 0018 — never a clean
   all-clear) and an **Expiring** chip (correct: inside LTOPF's 90-day `CRED_WINDOW_DAYS`,
   proving the per-credential window). Confirms criterion #10's LTOPF caveat + #11's
   per-credential-aware window in one view.

## 3. Coverage vs contract §7 (3b)

| # | Criterion | Where | ✓ |
|---|---|---|---|
| 9  | Hire carries every verified non-`resume_biodata` clearance → credentials; doc→cred round-trip test | T4 (`DOC_TO_CRED_TYPE`, carry-forward + round-trip tests) | ✓ |
| 10 | Licences panel: Valid/Expiring/Expired/**Revoked**/**MISSING**; LTOPF "firearm link unverified" | T1 (`deriveCredState`, `revoked`≠`expired`), T5 (panel), walk #2/#4 | ✓ |
| 11 | Readiness radar lists missing/expiring required (legacy via `isArmedPost`); per-credential window | T3 (`listReadinessIssues`), T6 (page), walk #1/#4 | ✓ |
| 12 | Full suite + typecheck + lint + Playwright walk | §1 + §2 | ✓ |

## 4. Deltas from the written plan/contract (deliberate, documented)

1. **Migration `0026`, not `0025`** — `0025` was consumed by the T12b legacy-column drop
   in the backlog sweep. `person_credentials` is a plain additive `CREATE TABLE`.
2. **`credType` enum = the 9 credential-bearing doc-type spellings** (excludes
   `resume_biodata`/`other`). `DOC_TO_CRED_TYPE` is an exhaustive `Record<DocType,…>` so
   adding a doc type forces a decision; the round-trip test guards the gap.
3. **`isArmedPost` is nullable** in the shipped schema → readiness treats `null` as
   **unarmed** (`isArmedPost ?? false`).
4. **`listReadinessIssues` lives in `recruitment`, NOT `persons`** — the contract §6 and
   the 3b plan Task 3 named `persons.listReadinessIssues`, but **persons is a strict
   identity foundation that imports nothing downstream** (only hr/recruitment schema
   import persons, never the reverse). Readiness must join hr employees (armed profile +
   code + active status) with person credentials; recruitment already depends on both, so
   it composes. persons only gained the thin `listCredentialsForPersons` batch reader.
   Following the contract literally would have inverted the layering 3a established + the
   backlog sweep reinforced (entry-point-only imports) — the "safe shortcut" that would
   have been the latent architectural bug. The readiness **page + nav** stay under
   recruitment per the design.

## 5. Backlog / follow-ups raised by 3b

- **Readiness perf at scale** — `listReadinessIssues` computes issues in-app across all
  active guards, then paginates. Fine for an admin radar now; if it becomes a hot path at
  10k+ guards, push the missing/expiring diff into SQL. Measure via `pnpm db:stress` first
  (same discipline as the existing `listApplicantsPage`/`listEmployeesPage` perf items).
- **LTOPF ↔ firearm/agency linkage** stays deferred (ADR 0018 out-of-scope) — the radar's
  permanent "firearm link unverified" caveat is the interim guard against a false green.
- **Commander SOP (open)** — confirm the authoritative armed/unarmed posting source so
  `isArmedPost` is reliably populated for the readiness required-set (today nullable →
  unarmed default). Gather when Noel next talks to CGoC.
