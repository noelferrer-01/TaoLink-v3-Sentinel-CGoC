# General — Cross-cutting Project Facts

## Identity
- **Project:** TaoLink v3, codenamed **Sentinel**.
- **Owner:** Noel Ferrer.
- **Business / client-doc identity:** SistemaHub. Signatory: Jenefer Ayson — Co-Founder. Contact: jen@sistemahub.com, +63 968 151 0101.
- **Client:** Commander Group of Companies (Philippine security agency). https://commandergrp.com/Home/

## Status (as of 2026-06-12)
- **Active vertical-slice development; pre-production** (nothing live at CGoC). Building one demo-able vertical slice at a time per [ADR 0013](../wiki/decisions/0013-vertical-slices-over-horizontal-phases.md).
- **Shipped + merged to `main`:** Slice 0 (auth/audit/approvals/events) · 1 (first payslip: HR + clients/detachments + assignments + DTR + payroll + SSS-R3 + BIR-2316) · 2 (multi-client at scale) · 3 + 3a + 3b (recruitment ATS + person identity spine + credential wallet/readiness radar) · **4 (Billing & SOA — `slice-4-done`, merged 2026-06-12).** Tags: `slice-1-done … slice-4-done`.
- **Foundational gates — all CLOSED:** stack = **TypeScript/Next.js/Drizzle/Postgres** (ADR 0005/0006); multi-tenancy = **single-tenant** (ADR 0007); dev env = **Docker Compose** (ADR 0008). The client questionnaire moved from blocking → validation (Noel locked most calls himself).
- **Next target:** Slice 5 = wage-stack engine (complete the guard payslip) + floating-clock; RBAC before real data. See the [HR/compliance roadmap](../wiki/reviews/2026-06-12-hr-operations-compliance-review.md).
- **Still-open client/legal gates (don't block Slice 5):** 5 "Commander asks" (gov-ID timing, armed/unarmed as a rate dim, billing tax treatment, SOA-as-BIR-doc, D.O.150/SOSIA/FEO reporting scope) + labor-lawyer consult on unpaid cleared-applicants (ADR 0004). See [commander-group.md](domains/commander-group.md).

## Working-style preferences (Noel)
- **Modular architecture, always.** Each feature is a self-contained module that can be added/removed without breaking others. (Soul global + AGENTS.md.)
- **Documentation per module** — for future knowledge base + non-technical client onboarding.
- **Read-as-you-build.** Every flow gets a short narrative Noel can explain back BEFORE moving to the next thing. "Just dump it in" is not acceptable.
- **README before code.** Module's README ships first commit, code second.
- **Demo-ability is the done test.** Tests passing ≠ done. Can Noel walk a client through it without opening the editor?
- **Honest pushback welcome.** Noel asked for v3 fresh start because the substantive answer was given, not the accommodating one.
- **Iteration loops** (eval scripts, batch graders, prompt tuning) default to **Sonnet/Haiku**, never Opus — token cost discipline.

## Delegation framework (2026-05-24)
Noel explicitly delegated architectural and tool-selection decisions to Claude on Sentinel. **Make the call, don't enumerate options.** Free-tier tools always preferred; only flag for discussion when paid tier is genuinely needed OR when the call has business implications (multi-tenancy, hosting jurisdiction, brand naming). The read-as-you-build / README-before-code discipline still applies — delegation is on *deciding what to build*, not on *shipping it unreadable*. Cross-session record: `~/.claude/projects/-Volumes-1TB-Antigravity-Workflows-Taolink-v3---Sentinel/memory/feedback_delegation_framework.md`.

## IDE / tooling
- Google Antigravity with Claude Code plugin.
- Memsearch (Level 3 semantic memory) installed globally; `.memsearch/` lives at workspace root.

## v1 hands-off
- **v1 = PayrollCentral** lives at `taolink.sistemahub.com`. Demo target for Commander Group. **Do not touch.**
- **v2 = TaoLink** archived at `github.com/noelferrer-01/TAOLINK-v2`. Reference only.
- **v3 = Sentinel** is this workspace, repo `github.com/noelferrer-01/TaoLink-v3-Sentinel-CGoC`.
