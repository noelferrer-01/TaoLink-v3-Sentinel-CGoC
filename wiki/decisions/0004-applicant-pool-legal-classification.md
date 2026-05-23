# 0004 — Applicant-pool legal classification (paid vs unpaid callback list)

**Status:** OPEN
**Filed:** 2026-05-23
**Touches:** Phase 1 (HR) employee state machine; Phase 5 (Recruitment) applicant pool; payroll boundary.

## Context

The Sentinel conversation log [`../../ref/sentinel-docs/sentinel-conversation-log.md`](../../ref/sentinel-docs/sentinel-conversation-log.md) §5b explicitly *corrected* v1's "bench employee" model:

> "Many guards are NOT paid until deployed. They wait on a callback list. If the wait is too long, they leave for another agency. This means they are **applicants, not employees** — they live in Recruitment, not HR."

And flags a legal caveat:

> "Honest legal flag: 'Cleared applicant pool' is a gray-area practice. DOLE has hit some agencies for non-payment of guards under contract. Verify with client's labor lawyer how they actually classify these people."

The Commander Group meeting notes do **not** explicitly confirm CG's practice on this point. The meeting notes describe pain points around Recruitment (no ATS, blacklist), but don't clarify:
- Whether CG keeps a cleared-but-unpaid callback list.
- Whether their cleared callbacks have signed any employment-adjacent paperwork.
- Whether CG has been advised by labor counsel on this practice.
- Whether CG's existing payroll treats any "bench" guards as paid.

**This is the highest-stakes lifecycle decision in the data model.** Get it wrong and:
- We violate Philippine labor law on behalf of CG (DOLE exposure).
- OR we model their actual practice as illegal and force them to change.
- OR we under-pay guards who should be on payroll (worker harm, agency liability).
- OR we over-pay applicants who weren't entitled to wages (revenue leak).

## Options

### A. Adopt the Sentinel corrected model (applicant-pool = unpaid)

- Cleared applicants live in Recruitment with status `cleared-callback` and NO HR / payroll record.
- They become Employees only when deployed.
- **Pro:** Cleanest model. Matches the prevailing-practice assumption in the conversation log.
- **Con:** May not match CG's actual practice. May not be legally defensible without lawyer sign-off.

### B. Adopt the v1 bench-employee model (all cleared = paid bench)

- All cleared guards are HR employees with status `bench`. Some paid, some not, depending on agency policy.
- **Pro:** Avoids DOLE non-payment exposure if all cleared guards are deemed under contract.
- **Con:** Likely doesn't match CG's economics — 10k+ guards on bench pay is unsustainable.

### C. Model whichever CG actually does, with explicit configuration

- Modeling answer = whatever CG does today.
- **Pro:** Honors the principle of "system models actual practice."
- **Con:** Requires CG to clearly articulate their policy. Doesn't resolve the legal exposure.

## Lean

**C, gated by legal review.** Build the model to fit CG's stated practice, but include a labor-lawyer consult as a hard prerequisite. The system should make it auditable which guards are/aren't paid and why — that audit trail is itself protection in a DOLE inquiry.

## Open until

- Direct interview with CG HR + payroll: how do you actually classify cleared-not-yet-deployed guards today?
- Labor-lawyer consult (one-time, billed to project) on the legality of CG's stated practice.
- Questionnaire Part D8–10 answers (applicant-vs-employee legal moment) — these are designed to answer this.

## Resolution

_(Pending.)_

## Cross-references

- [`../../memory/domains/architecture.md`](../../memory/domains/architecture.md) §applicant-pool-correction
- [`../../memory/domains/compliance.md`](../../memory/domains/compliance.md) — labor-lawyer consult listed as open compliance ask.
