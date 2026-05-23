# 0001 — Recruitment vs Operations: who owns guard transfers and reshuffles?

**Status:** RESOLVED (2026-05-23) — adopt source B (Commander Group practice). See [0011](0011-operations-role-pivot.md) for the consequence (Operations role pivots, not eliminated).
**Filed:** 2026-05-23
**Touches:** Phase 1 (HR + Marketing) + Phase 2 (Deployment) + Phase 5 (Recruitment) phase order; module ownership of `Deployment.AssignmentCreated`, `Deployment.AssignmentEnded`, reshuffle flows.

## Context

The Sentinel architecture in [`../../ref/sentinel-docs/sentinel-conversation-log.md`](../../ref/sentinel-docs/sentinel-conversation-log.md) §5a + §8b assumes:

> "Reshuffle = pulling guards from one detachment to another to meet demand. Done by Operations/Deployment, not Marketing."
> Deployment is a distinct module (Phase 2), separate from Recruitment (Phase 5).

The Commander Group meeting notes [`../../ref/sentinel-docs/commander-group-meeting-notes.md`](../../ref/sentinel-docs/commander-group-meeting-notes.md) §1D say the opposite:

> "**ONLY the Recruitment team** has authority to officially transfer guards between clients (not Operations). Operations can request a transfer but the trigger/ownership stays with Recruitment."

These are structurally incompatible:
- **Sentinel model:** Deployment module owns `AssignmentCreated`/`AssignmentEnded`. Operations/Deployment triggers reshuffles. Recruitment only fills shortfalls.
- **Commander Group practice:** Recruitment owns the authority to create, end, and transfer assignments. Operations can request but cannot execute.

If we ship Sentinel's model to Commander Group as-is, the access control will be wrong: Operations will have permissions they should not have, and Recruitment will lack permissions they need.

## Options

### A. Adopt Commander Group's practice — fuse Deployment under Recruitment

- Collapse Phase 2 (Deployment) into Phase 5 (Recruitment), OR keep Deployment as a module but transfer **all write authority** to Recruitment roles.
- Operations gets request-only permissions; Recruitment gets create/end/transfer.
- **Pro:** Matches real CG practice. RBAC reflects actual org.
- **Con:** Reorders Sentinel's phase plan. May not generalize to other security agencies if Sentinel is ever licensed.

### B. Keep Sentinel's model — push back on Commander Group

- Argue that separating Deployment from Recruitment is healthier (separation of concerns, auditable, scalable).
- Commander Group would need to assign new permissions to Operations.
- **Pro:** Cleaner module boundaries. More portable across clients.
- **Con:** Forces an org-change at CG. They may say no.

### C. Configuration-driven — both shapes supported via permission packs

- Deployment exists as a module but its write permissions are assignable.
- Ship a "CG configuration pack" that gives Recruitment roles deployment-write authority.
- Ship a "default configuration pack" that gives Operations roles deployment-write authority.
- **Pro:** Honors Sentinel principle 4 ("configuration over code for client variation"). Generalizes.
- **Con:** Requires the permission system to be flexible enough out of the gate. Adds complexity to Phase 0 (auth/RBAC primitive).

## Lean

**C** — but only after confirming with Commander Group via the questionnaire (Part E roles/permissions, Part N approval thresholds). If multi-tenancy / licensability is YES (see [0007](0007-multi-tenancy.md)), C is mandatory. If no, A is simpler and faster.

## Open until

- Questionnaire Parts A (multi-tenancy), E (roles), N (approval thresholds) answered.
- Direct interview with Commander Group's Recruitment manager + Operations manager to confirm authority boundaries.

## Resolution

**Adopted source B (Commander Group practice), 2026-05-23, confirmed by Noel.**

- **Recruitment owns all assignment writes** — create, end, transfer, reshuffle. Single source of truth for who-is-where.
- **Operations cannot execute transfers.** They can *request* a transfer (filed as an event), but Recruitment is the only role with the permission to fulfill it.
- This matches the meeting transcript explicitly: "Hindi ka naman pwede maglipat from A to B. Pag walang papel" ("You can't transfer A to B without papers"). The bug CG wants Sentinel to fix is that Operations sometimes does ad-hoc transfers today without paperwork, and Recruitment loses track.
- Option C (configuration-driven) deferred — if Sentinel is ever licensed to a different agency with different ownership, this becomes a configuration concern. For now, hard-code CG's model.

**Consequences:**
- The Sentinel Phase-2 "Deployment" module collapses or becomes a thin assignment-storage layer owned by Recruitment. See [0012](0012-phase-order-revision.md).
- RBAC permissions for transfer/reshuffle attach to Recruitment roles only.
- Operations roles get logistics, inventory, and client-comms permissions instead. See [0011](0011-operations-role-pivot.md).
- All assignment events still carry `marketing_request_id` for SLA tracking.

## Cross-references

- Related contradictions: [0002](0002-marketing-department-shape.md) (Marketing's role in demand-origination is also assumed but not validated at CG).
- Affects: [`../project/architecture.md`](../project/architecture.md), [`../../memory/domains/workflows.md`](../../memory/domains/workflows.md), [`../../memory/domains/architecture.md`](../../memory/domains/architecture.md).
