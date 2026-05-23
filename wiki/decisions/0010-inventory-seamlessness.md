# 0010 — Inventory: standalone-capable but seamless via events

**Status:** RESOLVED (2026-05-23)
**Filed:** 2026-05-24
**Touches:** Inventory module shape, module communication pattern, event bus.

## Context

Noel's question 6: "for the inventory, if it can standalone its good, as long as if there's connection to the deployed guards, it should know. so ill leave that part to you. i want them all seamless."

The meeting transcript reinforces this: CG already runs a light inventory/firearms system that exists somewhat separately from the rest of their tools. They want Sentinel's Inventory module to be similarly self-contained (could run on its own) but to *react* automatically to deployment changes (because firearms and equipment requirements vary per client and per detachment).

Two pulls in tension:
- **Modular isolation** (AGENTS.md rules + Sentinel principle 6) — modules shouldn't share mutable state; failure in one shouldn't cascade.
- **Seamless UX** (Noel's explicit preference) — users shouldn't feel like Inventory is "a different system." When a guard is moved to a new detachment that requires a firearm, Inventory should know without anyone manually telling it.

## Resolution

**Event-driven integration via the Phase-0 event bus.** Inventory is a fully standalone module by code structure; it appears seamless by subscribing to events from other modules.

**Pattern:**

```
Recruitment.AssignmentCreated  (guard X → detachment Y)
    ↓ event bus
Inventory subscribes
    ↓
Inventory queries: what does detachment Y require? (firearm? radio? specific uniform?)
Inventory queries: what does guard X currently hold?
    ↓
If mismatch → Inventory.AssetIssuanceRequired event (notifies armorer / supply officer)
If match    → silent (no-op)
```

**Same pattern for the reverse flow:**
```
Recruitment.AssignmentEnded (guard X leaves detachment Y)
    ↓
Inventory subscribes
    ↓
Inventory queries: should guard X return assets? (depends on next assignment, if any)
If return needed → Inventory.AssetReturnRequired event
```

**Standalone-capable means:**
- Inventory has its own DB tables, its own UI, its own public API.
- If the event bus is down or Recruitment is offline, Inventory still functions for manual issuance/return.
- Inventory's tests can run without booting Recruitment.
- A future deployment could conceivably run Inventory as a separate service (microservice readiness without committing to microservices now).

**Seamless means:**
- Users never have to "tell Inventory" that a guard moved — it knows.
- Inventory dashboards show current asset assignments synced with deployment state.
- Asset issuance approvals flow through the same `approvals` primitive as everything else (Phase 0).

## Consequences

- **Phase 0 must include an event bus** as a foundational primitive (already in the prior architecture, this hardens it).
- **Every cross-module integration follows this pattern.** DTR subscribes to `Recruitment.AssignmentCreated` to know which client to attribute hours to. Billing subscribes to `DTR.PeriodClosed`. Payroll subscribes to `DTR.PeriodClosed`. Etc.
- **The event bus is the seam.** Modules don't import each other; they emit/consume events.
- **Idempotent consumers** — each subscriber must handle the same event twice gracefully (in case of replay or retry).

## Cross-references

- [`../../AGENTS.md`](../../AGENTS.md) §Modular construction — rule 6 ("Communication method is a per-project decision. Escalate to events/hooks only when behavior is genuinely async or broadcast."). For Sentinel, the answer is YES — events are the right escalation given the seamless-but-modular requirement.
- [0009](0009-hr-starter-and-recruitment-as-entry-point.md) — Recruitment emits the assignment events that Inventory subscribes to.
- [`../../memory/domains/workflows.md`](../../memory/domains/workflows.md) — assignment + reshuffle flows (update pending).
