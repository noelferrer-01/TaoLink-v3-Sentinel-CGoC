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
4. **`listReadinessIssues` lives in `hr`, NOT `persons`** (and not recruitment) — the
   contract §6 and the 3b plan Task 3 named `persons.listReadinessIssues`, but **persons
   is a strict identity foundation that imports nothing downstream**. It was first built
   in recruitment; the pre-ship pressure test (§6) moved it to **hr** — readiness joins
   hr `employees` with person credentials and uses *zero* recruitment-domain code, and hr
   owns `employees` + already imports persons. persons only exposes the building blocks
   (`listCredentialsForPersons`, `READINESS_CRED_SET`, `CRED_WINDOW_DAYS`, `deriveCredState`).
   The hire **carry-forward** + `DOC_TO_CRED_TYPE` stay in recruitment (hire is its job).
   The readiness **page + nav** stay under `/recruitment` per the design (the page imports
   `hr.listReadinessIssues`). Following the contract literally would have inverted the
   layering — the "safe shortcut" that would have been the latent architectural bug.

## 6. Pre-ship pressure test (4-lens adversarial review) + remediation

Before shipping, 3b went through four independent break-it reviews (correctness,
architecture, security, scale). No showstoppers (all users are admin clerks, so no
privilege-escalation/corruption path), but **six real fixes + one architecture move** were
folded in, each test-first:

| Fix | What | Commit |
|---|---|---|
| Edit scoping (IDOR) | `updateCredential` gains `{ expectedPersonId }`; the action scopes a credId to the employee's person (was editable cross-person) | a4facde |
| Action hardening | credential actions validate dates + try/catch (no crash to the Next error overlay) | a4facde |
| Redaction scrubs wallet | `redactPerson` deletes the person's credentials (licence numbers/notes are PII) | dcbd103 |
| Migration idempotency | 0026 enums wrapped in `DO $$ … duplicate_object` guards | dcbd103 |
| Hire resilience | carry-forward is best-effort (per-credential try/catch; hire never fails on a copy hiccup; the radar surfaces any gap) | f5b8656 |
| Readiness home | moved `listReadinessIssues` recruitment → **hr** (employee concern; see §4) | 168bbba |
| Severity selection | report the most severe present state (revoked > expired > pending), not the "best"; drop the misleading window dropdown (per-credential windows authoritative) | 168bbba |

New edge tests added in `hr.test.ts` (best-of-N same-type, expired+pending severity,
expired/revoked/pending kinds, pagination) + scope/redaction tests in `persons.test.ts`.

## 7. Backlog / follow-ups raised by 3b

- **Readiness perf at scale (sharpened)** — `listReadinessIssues` computes issues in-app
  across all active guards, then paginates (recomputing on every page click). Fine for an
  admin radar at current/demo scale. Two scale risks before true 10k+ production: (a) the
  in-app load/compute is heavy (~0.3–1.5s/load at 10k); (b) `listCredentialsForPersons`
  sends **one bind param per guard**, so the batch read approaches the Postgres ~65k
  parameter ceiling as the active-employee count grows (it *throws*, not just slows, past
  it). Fix both with one SQL rewrite: a `LEFT JOIN` diff that emits only missing/expiring
  rows with DB-side `LIMIT/OFFSET/COUNT` (personIds never cross the wire). **Prereq:** the
  `db/stress` harness seeds **no** `person_credentials` and never calls readiness — so the
  "measure via `pnpm db:stress`" gate needs harness work first (seed a realistic per-guard
  credential distribution + a readiness timing case).
- **LTOPF ↔ firearm/agency linkage** stays deferred (ADR 0018 out-of-scope) — the radar's
  permanent "firearm link unverified" caveat is the interim guard against a false green.
- **Commander SOP (open)** — confirm the authoritative armed/unarmed posting source so
  `isArmedPost` is reliably populated for the readiness required-set (today nullable →
  unarmed default). Gather when Noel next talks to CGoC.
