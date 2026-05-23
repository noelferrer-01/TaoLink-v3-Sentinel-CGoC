# 0007 — Multi-tenancy: internal-only vs licensable

**Status:** RESOLVED 2026-05-24 — **Single-tenant (Option A).** Sentinel is not a SaaS product; one deployment serves CGoC only. Multi-*client* configuration is normal data modeling (per-client rate tables, schedules, etc.), not tenancy.
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

**Single-tenant (Option A), locked 2026-05-24 by Noel.**

Noel's clarification: *"for multi tenancy, i think this is only for commander group of companies and wont be for sass. maybe the multi tenancy will only be for their clients template, though CGoC still inputs that."*

**The shape:**
- **One** Sentinel deployment, owned and operated by CGoC.
- **All** users are CGoC employees (recruiters, ops, payroll, HR admin, executives, IT). No external client logins.
- **Hundreds** of CGoC's *clients* (malls, government buildings, subdivisions, etc.) exist as first-class entities with their own rate templates, break schedules, OT rules, equipment requirements, billing templates — but those are just per-client configuration, not separate tenants.

**Data-model consequences:**
- No `tenant_id` columns. Period.
- `client_id` foreign keys everywhere a per-client configuration applies.
- RBAC scope filtering still uses `region` and `detachment` and `client` — but at single-tenant level, not multi-tenant.
- No row-level security tenant isolation needed.
- No schema-per-tenant or DB-per-tenant complexity.

**If business changes:** if CGoC ever decides to license/resell Sentinel to other agencies, this becomes a meaningful refactor. The mitigation: build the per-client configuration layer cleanly, so the "tenant" concept can be introduced later as a higher-level grouping of clients. That's not free, but it's not catastrophic either.
