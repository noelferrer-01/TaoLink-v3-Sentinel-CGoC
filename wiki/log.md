# Wiki Log

> Append-only. Each entry: `## [YYYY-MM-DD] type | subject`
> Types: `init`, `ingest`, `decision`, `lint`, `runbook`, `manual`, `note`.
> Parseable with `grep "^## \[" log.md | tail -10`.

## [2026-05-23] init | Project scaffold

- Wiki initialized. Seeded `project/overview.md`, `project/architecture.md`, `project/status.md` from `ref/00-RESUME-POINT.md` and `ref/sentinel-docs/`.
- 8 open decisions filed under `decisions/`. The four substantive ones (0001–0004) surfaced as contradictions between Sentinel's prior architecture (in `/ref/`) and Commander Group's actual practice (in meeting notes). The remaining four (0005–0008) are foundational calls already known to be open: stack, DB, multi-tenancy, dev environment.
- Runbooks and manuals trees created with README conventions; no content yet.
- mem0 explicitly dropped — Memsearch (Level 3) already covers the same recall surface.
