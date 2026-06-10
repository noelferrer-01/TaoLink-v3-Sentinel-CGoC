# 0017 — Person-centric identity: applicants and employees are roles on a shared Person

**Status:** RESOLVED (2026-06-10) — Noel locked "Decision B"; design corrected through two adversarial review rounds the same day (v1 mirror-columns → v2 single-source-of-truth → v3 build-hardening). This is v3.
**Filed:** 2026-06-10
**Refines (does not supersede):** [0009](0009-hr-starter-and-recruitment-as-entry-point.md) — the hire handoff *links* a shared Person instead of *copying* identity. [0004](0004-applicant-pool-legal-classification.md) — applicant and employee stay legally distinct **records** on a shared Person spine; a Person-level redaction rule preserves 0004's purge intent (see Resolution → "Retention").
**Touches:** recruitment schema, hr schema, the hire handoff, blacklist/rehire matching, identity capture, every read of an employee's name/IDs (compliance exports, payroll/assignment display, employee search).

## Context

Slice 3 ([3-recruitment-ats](../slices/3-recruitment-ats.md)) built Recruitment as **two cabinets** — `recruitment_applicants` and `hr_employees` — with `hireApplicant` **copying** identity into a brand-new employee. As the foundation for a 10,000-guard system meant to last, that has two structural faults:

1. **No continuous identity.** The same human is many unrelated rows (each application, the employee, every rehire). "Have we dealt with this person?" is a fuzzy name+DOB guess — the Slice-3 blacklist matcher, which [recruitment/README.md](../../modules/recruitment/README.md) itself flags as unreliable.
2. **Identity is copied, then drifts.**

Noel (2026-06-10): fix the foundation correctly, not patch it — and *because we own intake, a reliable identifier is a rule we impose, not a fact to design around.*

## Options

**A. Keep two cabinets.** Drift + fuzzy guessing are permanent. **B. Person-centric** — one `Person` per human; applicant/employee are roles referencing it; identity + licences live on the Person. **C. Generic party/relationship model** — over-abstraction that fails "explain in two sentences."

## Resolution

**Option B — single source of truth, abstraction kept minimal (explicitly not C).**

### Core model
- **`persons`** is the **single source of truth** for a human: legal name, DOB, sex, **all** statutory/government IDs, address, contact.
- **`recruitment_applicants.personId`** and **`hr_employees.personId`** reference it. Each role row holds **only role data** — employee: `employeeCode`, salary, pay frequency, employment type, **required-credential profile** (armed/unarmed — see [0018](0018-credentials-first-class.md)), status, hire/termination dates, RDO code; applicant: source, position, armed flag, pipeline stage, dates, outcome. **No identity is duplicated on either.**

### Single source of truth — no mirror columns
A v1 draft kept employee identity columns as **mirrors**; review showed that is a dual-write drift bug with ~7 unguarded writers — the exact "latent bug" we're avoiding. Corrected: identity lives **only** on `persons`. The few readers (government exports + display lists; payroll *computation never reads identity*) go through a `hr.getEmployeeWithIdentity()` accessor (employee ⋈ person) — a read-through join **cannot** read a stale copy. The `pg_trgm` GIN name index **moves to `persons`**; employee search joins the Person.
- **Statutory IDs that live on the Person:** PhilSys, SSS, **PhilHealth, Pag-IBIG**, TIN, plus secondary IDs (UMID, passport, driver's licence). *(v2 mistakenly dropped PhilHealth/Pag-IBIG with no destination — a data-loss bug caught in review; they belong on the Person with the other member IDs.)*

### Anchor identifier — "store all, anchor on one, prefer PhilSys"
Ladder for the anchor (the canonical key): **PhilSys → SSS → TIN → passport → UMID → driver's licence**, recorded in `anchorIdType`.
- **Uniqueness enforced only on PhilSys / SSS / TIN** (one-per-person-for-life nationally). Passport/UMID/DL get **reissued/recycled** → plain *lookup* indexes, never unique (a `UNIQUE` there throws on legitimate recycled data and blocks intake). PhilHealth/Pag-IBIG are stored but not anchors.
- **Never anchor on a licence number** (NBI/SOSIA/LTOPF) — those expire/reissue; they are credentials ([0018](0018-credentials-first-class.md)).
- **Format validation is advisory, not a hard gate** — strip separators, check plausible length per type, *warn* and allow an override rather than reject (a too-strict regex re-creates the blocking problem). Legacy IDs are **grandfathered** (backfill never re-validates). Exact PH formats to be confirmed with the client / PSA; checksum verification deferred.

### Mandated at hire, nudged earlier — never a dead-end
We guarantee the ID where it matters without ever trapping anyone:
- A walk-in is **logged at `applied`** against a **provisional Person** (`anchorIdType='none'`), name+DOB+contact only.
- An anchor ID is an **absolute hard gate before hire** — **no employee exists without one**. Before hire, advancing the applicant is allowed with a prominent **"ID still needed"** nudge / an `idPending` state; it is **not** a hard block. (A v2 draft hard-blocked at *advance*, which trapped the exact first-timer whose SSS/TIN gets issued *because* we hired them — a self-contradiction, fixed here.)
- `createPerson` **accepts `'none'`**; the hard check (`assertAnchored`) fires only at hire. Same mechanism re-intakes a legacy `none` person without blocking them.

### Non-blocking for legacy
~10k existing employees are **backfilled** one Person each; no ID on file → `anchorIdType='none'` + a nudge — **never blocks** payroll, deployment, reports, or rehire.

### Migration safety (the irreversible part)
Turning on the PhilSys/SSS/TIN unique indexes against real data fails if existing rows hold duplicate or empty-string IDs (today nothing dedups SSS/TIN). So the backfill runs a **dedup + normalize pre-pass**: `'' → NULL`, trim, detect duplicate non-null IDs, keep the first occurrence's anchor and route later duplicates to `anchorIdType='none'` + `suspectedDuplicateOf` (their unique column left NULL, the value kept in a note). Unique indexes are created **after** the dedup'd backfill; the column-drop step is gated on **zero rows with NULL `personId`**.

### Dedup safety net (anchor = engine; these = seatbelts)
- **Exact match across all stored IDs, spanning every Person** (applicants *and* employees of any status — not just terminated) + blacklist. An active-employee hit → "possible double-hire"; a concurrent-applicant hit → "already applying elsewhere."
- **Normalized fuzzy backstop** on name+DOB (lowercase, collapse `dela`/`de la`, strip whitespace) for "same human, different/blank ID."
- **`suspectedDuplicateOf` flag + manual reconcile** so misses are recorded, not silent. (Full merge UI is a fast-follow.)

### Retention (preserves [0004](0004-applicant-pool-legal-classification.md))
- **Mechanism (built now):** *redaction*, not row-delete, for a Person referenced by historical roles — identity fields are tombstoned (nulled + a `redactedAt` marker), the row and its FKs/audit history stay intact, and the unique ID is **not** freed (a tombstone marker holds the slot so it can't be re-minted). Government **exports snapshot identity at generation time**, so redacting later never blanks a historical form. The **blacklist keeps its own standalone PII snapshot** + gains a nullable `personId`, so a purge never erases a do-not-hire reason.
- **Policy (gated, NOT auto-triggered):** *when* a rejected/withdrawn-applicant-only Person becomes purgeable is a privacy/labor call that [0004](0004-applicant-pool-legal-classification.md) reserves for the pending labor-lawyer consult. We build the redaction mechanism; we do not wire an automatic purge until 0004 closes.

## Consequences
- Intake gains an **identity step** (optional "we know this person?" lookup, then the applicant form); the hard ID gate is at hire, a nudge before.
- The hire handoff ([0009](0009-hr-starter-and-recruitment-as-entry-point.md)) **links the same Person**; 0009's contract otherwise stands.
- **Every read of an employee's name/IDs repoints** through `getEmployeeWithIdentity`: compliance exports, payroll/assignment display (incl. raw SQL), recruitment detail, the `exports` page's flat list, employee search/list (joined + GIN-indexed on `persons`). Payroll **computation** untouched.
- The employee **edit form splits**: employment on the employee screen; identity through a Person editor.
- `hr_employees` **loses** its `emailUq` unique constraint (email moves to the Person, which is **non-unique** — applicants re-apply, share, or lack email; system logins use the separate `users` table). The email-error paths in `createEmployee`/`updateEmployee` retire.
- **Phasing:** delivered as **Slice 3a** (identity spine — the load-bearing change that must land *before* tagging slice 3) then **Slice 3b** (credentials + readiness — additive, [0018](0018-credentials-first-class.md)). One design ([3-identity-and-credentials](../slices/3-identity-and-credentials.md)), two build plans.
- **External asks (Commander):** anchor-ID in the intake SOP; a non-blocking, opportunistic legacy backfill drive; **a source for legacy armed/unarmed status** (current detachment post type) so the readiness radar isn't blind for existing guards.

## Cross-references
- [0018](0018-credentials-first-class.md) — credentials on the Person.
- Slice design + plans: [3-identity-and-credentials](../slices/3-identity-and-credentials.md), [3a plan](../slices/3a-person-identity-plan.md), [3b plan](../slices/3b-credentials-and-readiness-plan.md).
