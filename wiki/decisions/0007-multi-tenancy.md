# 0007 — Multi-tenancy: internal-only vs licensable

**Status:** OPEN
**Filed:** 2026-05-23
**Touches:** Foundational data model, RBAC scoping, hosting strategy, billing model.

## Context

If Sentinel is for Commander Group only → single-tenant is fine and simpler.
If Sentinel may be licensed/resold to other security agencies → multi-tenancy goes in the foundation. Retrofitting later is painful.

## Options

### A. Single-tenant (Commander Group only)

- Simpler schema, simpler RBAC, simpler hosting.
- Pivot cost is high if the business decision changes later.

### B. Multi-tenant from day 0

- Tenant column on every row OR schema-per-tenant OR DB-per-tenant.
- RBAC + scope filtering must be tenant-aware.
- Hosting strategy supports tenant isolation.

### C. Single-tenant with "multi-tenancy-ready" abstractions

- Build with a single tenant in mind but keep abstractions (e.g., tenant_id parameter pattern) so multi-tenancy is a manageable retrofit.
- **Pro:** Less upfront work, lower retrofit pain.
- **Con:** Easy to drift away from the discipline if multi-tenant is "for later."

## Lean

Depends entirely on the business answer. **Resolves via questionnaire Part A.**

## Open until

Questionnaire Part A answered.

## Resolution

_(Pending.)_
