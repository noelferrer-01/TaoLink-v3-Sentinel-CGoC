# Person Identity & Credential Durability — Plan (SUPERSEDED — split into 3a + 3b)

> **DEPRECATED 2026-06-10.** The single 16-task plan was split after the round-2 pressure test (the full normalization was too large to land safely in one pre-tag slice). The build now lives in two plans:
>
> - **[3a-person-identity-plan](3a-person-identity-plan.md)** — the identity spine (single source of truth, dedup'd backfill, accessor, repoint reads, drop legacy columns, identity-first intake). **Must land before `slice-3-done` is tagged.**
> - **[3b-credentials-and-readiness-plan](3b-credentials-and-readiness-plan.md)** — the licence wallet + readiness radar. **Additive; does not block the tag.**
>
> Design (shared): **[3-identity-and-credentials](3-identity-and-credentials.md)** (v3). Decisions: [ADR 0017](../decisions/0017-person-centric-identity.md), [ADR 0018](../decisions/0018-credentials-first-class.md).
>
> Do not implement from this file.
