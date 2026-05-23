# 0003 — Relationship between Sentinel and Commander Group's existing partial HRIS

**Status:** OPEN
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

_(Pending.)_

## Cross-references

- [`../project/status.md`](../project/status.md) — affects gate state.
- Questionnaire — not currently covered explicitly; add to discovery list.
