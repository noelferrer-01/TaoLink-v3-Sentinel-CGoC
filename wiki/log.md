# Wiki Log

> Append-only. Each entry: `## [YYYY-MM-DD] type | subject`
> Types: `init`, `ingest`, `decision`, `lint`, `runbook`, `manual`, `note`.
> Parseable with `grep "^## \[" log.md | tail -10`.

## [2026-05-23] init | Project scaffold

- Wiki initialized. Seeded `project/overview.md`, `project/architecture.md`, `project/status.md` from `ref/00-RESUME-POINT.md` and `ref/sentinel-docs/`.
- 8 open decisions filed under `decisions/`. The four substantive ones (0001–0004) surfaced as contradictions between Sentinel's prior architecture (in `/ref/`) and Commander Group's actual practice (in meeting notes). The remaining four (0005–0008) are foundational calls already known to be open: stack, DB, multi-tenancy, dev environment.
- Runbooks and manuals trees created with README conventions; no content yet.
- mem0 explicitly dropped — Memsearch (Level 3) already covers the same recall surface.

## [2026-05-24] ingest | Meeting transcripts + four ADR resolutions + three new ADRs

- Noel dropped raw meeting transcripts: `ref/sentinel-docs/IMG_6844 (transcribed on 08-May-2026 15-32-51).txt` (36 KB) and `ref/sentinel-docs/IMG_6846 (transcribed on 08-May-2026 15-32-31).txt` (4 KB). Email-system portions excluded per Noel (separate project).
- Transcript-confirmed insights beyond the summary:
  - **Recruitment is THE entry point** — explicitly stated multiple times by CG ("Sa recruitment, yun yung wala eh. Yun yung kailangan pumasok sa HRIS niyo na mga bagong empleyado").
  - **Operations currently does ad-hoc transfers without paperwork** — this is the bug CG wants Sentinel to fix ("Hindi ka naman pwede maglipat from A to B. Pag walang papel").
  - **Operations role pivots, doesn't disappear** — after centralizing transfer authority in Recruitment, Ops's job becomes logistics + client comms + monitoring.
  - **Calculation is simple (A + B); allocation is the hard part** — payroll computation easy, "where was each guard for how long at what rate" is the real complexity.
  - **Detachment admin presence varies** — some detachments have admin staff (handles clock-in), others don't.
  - **CG has multiple existing systems** (partial HRIS, light inventory/firearms, executive system) — none integrate with Sentinel per [0003](decisions/0003-relationship-to-existing-cg-system.md).
- Resolved [0001](decisions/0001-recruitment-vs-operations-ownership.md), [0002](decisions/0002-marketing-department-shape.md), [0003](decisions/0003-relationship-to-existing-cg-system.md). Partially resolved [0004](decisions/0004-applicant-pool-legal-classification.md) (hybrid model adopted; lawyer review still recommended).
- Filed new ADRs: [0009](decisions/0009-hr-starter-and-recruitment-as-entry-point.md) (HR-starter pattern, Noel's question 5), [0010](decisions/0010-inventory-seamlessness.md) (event-driven Inventory integration, Noel's question 6), [0011](decisions/0011-operations-role-pivot.md) (Operations role pivot, consequence of 0001), [0012](decisions/0012-phase-order-revision.md) (proposed phase order revision — OPEN, awaiting Noel's review).
