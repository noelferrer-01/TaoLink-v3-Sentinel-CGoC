# 0002 — Marketing department shape at Commander Group

**Status:** RESOLVED (2026-05-23) — Marketing department exists and originates client demand, per Noel. Build the full Marketing module per Sentinel architecture (Option A).
**Filed:** 2026-05-23
**Touches:** Phase 1 (Marketing/Contracts module); Marketing → Deployment → Recruitment workflow.

## Context

The Sentinel architecture assumes a **Marketing department** with formal responsibilities:

> [Sentinel conversation log §5a] "Marketing signs the client and captures requirements (headcount, guard specs, firearms, radios, etc.). Marketing fills a Request Form and submits to Recruitment/Deployment. Marketing does NOT decide which guards go to which client. Their job ends at handing off requirements."

This shape implies:
- A Marketing dept exists with multiple people.
- It has a defined intake process (Request Form).
- It has an approval gate before handoff.
- It tracks fulfillment SLA back to the marketing-request entity.

The Commander Group meeting notes only mention Marketing once, indirectly:

> [Meeting §4] "Marketing (Jen): A person named Jen was mentioned in the context of marketing for Commander Group. Marketing efforts appear to be just getting started."

This is ambiguous. Possible interpretations:
1. Marketing is a department with one person (Jen) right now, growing.
2. Marketing is informal — Jen handles "marketing-like" work but client acquisition is led by founders/ops.
3. The Sentinel Marketing module is over-modeled for CG's actual practice.

If CG doesn't have a Marketing department in the Sentinel sense, building a full Marketing/Contracts module in Phase 1 may be either premature or shaped wrong.

## Options

### A. Build the full Marketing module per Sentinel architecture

- Bet that CG will grow into the assumed shape (multi-person Marketing, formal intake, SLA tracking).
- **Pro:** Future-proof. Doesn't have to be rebuilt.
- **Con:** May be over-engineered for current scale. Users may not adopt formal workflow.

### B. Build a minimal Contracts/Demand module (no Marketing dept assumed)

- Replace "Marketing fills Request Form" with "Whoever signs the contract fills the Demand Form."
- The actor is parameterized; could be Marketing, Founder, Ops Manager — whoever the org assigns.
- Marketing-specific UI/dashboards deferred to Phase X (TBD) when needed.
- **Pro:** Matches current CG reality. Smaller surface area.
- **Con:** Will need expansion later if Marketing grows.

### C. Defer the Marketing module entirely

- Skip Phase-1 Marketing. Manual entry of demand by whoever-handles-it.
- **Pro:** Simplest. Defers a real decision until CG's Marketing function crystallizes.
- **Con:** Loses end-to-end SLA tracking. Manual demand entry doesn't validate the marketing → deployment contract.

## Lean

**B** — minimum viable Contracts/Demand module that supports the workflow without assuming a multi-person Marketing dept. Easy to grow into the full Sentinel Marketing module if/when CG hires.

## Open until

- Questionnaire Part C (org chart, departments, reporting lines) answered.
- Conversation with Jen and CG leadership about Marketing's intended scope.

## Resolution

**Adopt Option A (full Marketing module), 2026-05-23, confirmed by Noel.**

Noel's confirmation: "marketing, yes as they usually gets, looks or finds the clients for the company."

- Marketing is a department at CG. Jen is currently in the role; the assumption is more people will join.
- Marketing's job: acquire clients (lead → contact → sign), capture requirements (headcount, guard specs, firearms, radios, schedule, billing rates), file the Request Form.
- Marketing does NOT pick which guards go where — handoff to Recruitment (who, per [0001](0001-recruitment-vs-operations-ownership.md), owns assignment).
- Approval gate exists between Marketing.RequestFormSubmitted and Recruitment ingestion (per the prior architecture).
- Every downstream deployment event carries `marketing_request_id` for end-to-end SLA traceability.

**Consequences:**
- Marketing/Contracts module stays in Phase 1 alongside HR-starter + Client/Detachment master.
- Marketing UI is minimal at launch (Jen is one person); design supports growth (multi-person Marketing later).
- Marketing dashboard (fill rate, SLA, fulfillment quality) is part of the Marketing module spec.

## Cross-references

- [0001](0001-recruitment-vs-operations-ownership.md) — related ownership question.
- [`../../memory/domains/workflows.md`](../../memory/domains/workflows.md) — Marketing → Deployment flow.
