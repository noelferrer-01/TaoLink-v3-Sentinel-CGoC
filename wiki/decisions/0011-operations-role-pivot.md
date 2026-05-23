# 0011 — Operations role pivot after Recruitment takes transfer authority

**Status:** RESOLVED (2026-05-23)
**Filed:** 2026-05-24
**Touches:** Operations roles + permissions, module subscriptions for Operations dashboards, Phase 0 RBAC.

## Context

[Decision 0001](0001-recruitment-vs-operations-ownership.md) gave Recruitment exclusive authority over guard transfers and reshuffles. That raises a fair question: what does Operations *do*, then?

The meeting transcript answers this directly:

> "Pag i-eliminate po sa operations, Yung mga tapaw, Ang tapaw nila magmeetig sa kayaan, I-check your logistics, Or, Mumpeto ka ba sila"
> ("If we remove [transfer authority] from operations, their job becomes meeting with clients, checking logistics, monitoring [them]")

Operations doesn't disappear. The role pivots from *executing transfers* to *operational oversight*: monitoring guards in the field, liaising with clients, supervising detachment commanders, ensuring logistics (uniforms, radios, vehicles, food supply) actually reach posts.

## Resolution

**Operations remains a first-class department.** Its responsibilities shift:

**Operations does:**
- Detachment field oversight (visits, audits, performance checks).
- Client liaison at the operational level (day-to-day issues, not contract terms).
- Logistics oversight — making sure assets, supplies, and information reach detachments.
- Incident response (guard misconduct, client complaints, security events).
- **Request** transfers via a documented event (`Operations.TransferRequested`) — Recruitment fulfills or rejects.
- Read-only access to assignment data for monitoring and reporting.

**Operations does NOT:**
- Create or end assignments directly.
- Transfer guards between detachments.
- Trigger reshuffles.
- Modify the assignment table.

**Operations dashboards (cross-cutting):**
- Live view of all deployments by region/area.
- Open client tickets / incidents.
- Logistics status (asset shortfalls per detachment).
- Pending transfer requests they've filed (with Recruitment's status).

## Consequences

- **Operations.TransferRequested event** is a new artifact. Recruitment subscribes; the approvals primitive routes it for decision.
- **RBAC permissions for Operations roles:** read on `assignment.*`, write on `incident.*` + `operations.transfer_request.*` + `logistics.*`.
- **No Operations module per se** — Operations roles consume data from Recruitment, Inventory, DTR, etc. via cross-cutting dashboards. The "module" for Operations is mostly UI + permission scoping.
- **Migration concern:** if any of CG's current Operations people are used to executing transfers directly, the new system will block them. That's the intended bug-fix, but it needs change-management — Recruitment must be responsive to transfer requests, or Operations will revolt.

## Cross-references

- [0001](0001-recruitment-vs-operations-ownership.md) — the upstream decision.
- [0009](0009-hr-starter-and-recruitment-as-entry-point.md) — Recruitment's expanded role.
- [`../../memory/domains/workflows.md`](../../memory/domains/workflows.md) — reshuffle + transfer flows (update pending).
