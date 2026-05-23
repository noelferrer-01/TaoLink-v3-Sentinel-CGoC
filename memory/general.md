# General — Cross-cutting Project Facts

## Identity
- **Project:** TaoLink v3, codenamed **Sentinel**.
- **Owner:** Noel Ferrer.
- **Business / client-doc identity:** SistemaHub. Signatory: Jenefer Ayson — Co-Founder. Contact: jen@sistemahub.com, +63 968 151 0101.
- **Client:** Commander Group of Companies (Philippine security agency). https://commandergrp.com/Home/

## Status (as of 2026-05-23)
- **Pre-Phase-0.** No code written. Workspace contains only scaffolding (`AGENTS.md`, `memory/`, `wiki/`, `ref/`).
- **Hard gates open** (do NOT start Phase 0 code before these are closed):
  - Client discovery questionnaire (`ref/sentinel-docs/sentinel-client-questionnaire.md`) — ~20 [CRITICAL] items unanswered.
  - Stack call: TypeScript vs Python — **lean TypeScript**, not locked.
  - Multi-tenancy: internal vs licensable — open.
  - Database: MySQL (v1/v2) vs Postgres (recommended) — open.
  - Hosting: on-prem / cloud / hybrid — open.
  - Dev environment: Docker vs native (raised 2026-05-23, see daily log) — open.

## Working-style preferences (Noel)
- **Modular architecture, always.** Each feature is a self-contained module that can be added/removed without breaking others. (Soul global + AGENTS.md.)
- **Documentation per module** — for future knowledge base + non-technical client onboarding.
- **Read-as-you-build.** Every flow gets a short narrative Noel can explain back BEFORE moving to the next thing. "Just dump it in" is not acceptable.
- **README before code.** Module's README ships first commit, code second.
- **Demo-ability is the done test.** Tests passing ≠ done. Can Noel walk a client through it without opening the editor?
- **Honest pushback welcome.** Noel asked for v3 fresh start because the substantive answer was given, not the accommodating one.
- **Iteration loops** (eval scripts, batch graders, prompt tuning) default to **Sonnet/Haiku**, never Opus — token cost discipline.

## Delegation framework (2026-05-24)
Noel explicitly delegated architectural and tool-selection decisions to Claude on Sentinel. **Make the call, don't enumerate options.** Free-tier tools always preferred; only flag for discussion when paid tier is genuinely needed OR when the call has business implications (multi-tenancy, hosting jurisdiction, brand naming). The read-as-you-build / README-before-code discipline still applies — delegation is on *deciding what to build*, not on *shipping it unreadable*. Cross-session record: `~/.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/feedback_delegation_framework.md`.

## IDE / tooling
- Google Antigravity with Claude Code plugin.
- Memsearch (Level 3 semantic memory) installed globally; `.memsearch/` lives at workspace root.

## v1 hands-off
- **v1 = PayrollCentral** lives at `taolink.sistemahub.com`. Demo target for Commander Group. **Do not touch.**
- **v2 = TaoLink** archived at `github.com/noelferrer-01/TAOLINK-v2`. Reference only.
- **v3 = Sentinel** is this workspace, repo `github.com/noelferrer-01/TaoLink-v3-Sentinel-CGoC`.
