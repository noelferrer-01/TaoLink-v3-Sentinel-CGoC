# 0003 — Relationship between Sentinel and Commander Group's existing partial HRIS

**Status:** RESOLVED (2026-05-23) — CG's existing partial HRIS has **no relationship** to Sentinel, per Noel. Sentinel is a fresh build that runs in parallel and may eventually deprecate them.
**Filed:** 2026-05-23
**Touches:** Project scope, migration strategy, Phase 0 data-loading approach, cutover plan.

## Context

The Commander Group meeting notes [`../../ref/sentinel-docs/commander-group-meeting-notes.md`](../../ref/sentinel-docs/commander-group-meeting-notes.md) say:

> "The HRIS project has been ongoing for approximately 2 years. They have an existing system but it is incomplete."
> "Existing System: Commander Group already has a partial system in place. The HRIS build is not from scratch in terms of data — they have existing payroll and HR records that need to connect."

The Sentinel architecture in `/ref/` treats v3 as a fresh build. It does **not** address how Sentinel coexists with, replaces, or migrates from Commander Group's existing system.

This is undefined and has major scope implications:

| Scenario | What we ship |
|---|---|
| **Replace** | Full system, migrate all data, hard cutover with parallel-run period. |
| **Augment** | Sentinel handles the modules CG's existing system lacks (Recruitment, DTR automation), integrates via API/sync for shared data. |
| **Migrate from** | Treat CG's existing system as a data source, build Sentinel as the next-gen replacement, multi-month phased rollout. |

Each shapes Phase 0 differently:
- Replace → ingestion + reconciliation tooling is critical from day one.
- Augment → integration contracts with the existing system are critical from day one.
- Migrate from → both, plus a coexistence layer.

## Options

### A. Wait until questionnaire / interview answers this

- File the question. Don't pre-decide.
- **Pro:** Avoids assumption-locked architecture.
- **Con:** Phase 0 plan is partially blocked.

### B. Assume "Replace" by default

- Sentinel is the new system. CG's existing one will be retired.
- **Pro:** Cleanest architecture.
- **Con:** May be politically/contractually wrong if CG's existing system has internal owners or vendor commitments.

### C. Assume "Augment" by default

- Sentinel fills gaps (Recruitment, DTR per-client) without replacing payroll/HR.
- **Pro:** Lower-risk rollout.
- **Con:** Lock-in to the existing system's data model.

## Lean

**A** — this needs explicit answers from CG before any architectural commitment. Worth a dedicated discovery call separate from the questionnaire if it's not already covered.

## Open until

- CG technical contact identifies the existing system (vendor / in-house / age / stack).
- CG leadership confirms scope: replace, augment, or migrate-from.

## Resolution

**No relationship, 2026-05-23, confirmed by Noel.**

Noel's confirmation: "the partial HRIS the CGoC has, have no relationship on Sentinel."

- CG has several existing systems (mentioned in the meeting transcript): a partial HRIS, an inventory/firearms light system, an executive system.
- **Sentinel does NOT integrate with, migrate from, or sync to any of them.** It is a parallel, independent build.
- CG's existing systems may be deprecated by CG at their own pace once Sentinel ships the equivalent functionality.
- Data ingestion for Sentinel is a clean-room exercise — initial employee/client load happens via CSV import or manual entry, scoped per phase.

**Consequences:**
- Phase 0 does NOT need integration adapters to legacy systems.
- Phase 0 DOES need bulk-import tooling for the initial 10k+ guard onboarding into HR-starter.
- The cutover plan is "Sentinel goes live, CG decides what to retire and when" — not a hard migration.
- No data-sync contracts to design. No legacy system reverse-engineering required.

## Cross-references

- [`../project/status.md`](../project/status.md) — affects gate state.
- Questionnaire — not currently covered explicitly; add to discovery list.
