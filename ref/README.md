---
name: /ref/ — Reference Material for TaoLink v3 (Sentinel)
description: Index of reference material carried over from v1/v2 and prior Sentinel architecture conversations. Reference only, not binding v3 decisions.
type: index
---

# `/ref/` — Reference Material

> **Reference only.** Everything in this folder is prior thinking, prior code, or prior conversation. None of it is a binding decision for v3. Use it as input; make v3's own calls fresh.

## Start here

Read **`00-RESUME-POINT.md`** first. It's the full handoff brief — who the user is, history of v1/v2, why v3 is fresh, what Sentinel needs, what's blocking Phase 0, and how a resumed session should orient itself.

## What's in here

| Path | What it is | When to read it |
|---|---|---|
| `00-RESUME-POINT.md` | The brain. Full v3 briefing. | First. Always. |
| `sentinel-docs/commander-group-meeting-notes.md` | Discovery meeting with Commander Group. Source of truth for what the client said. | When making any decision about workflow, scope, or terminology. |
| `sentinel-docs/sentinel-conversation-log.md` | Prior architectural decisions and open questions for Sentinel. | When the user references a decision "we already made." |
| `sentinel-docs/sentinel-client-questionnaire.md` | Discovery questionnaire to send Commander Group department heads. Gates Phase 0. | When planning the questionnaire send or interpreting answers. |
| `compliance/migrations/` | 27 SQL migrations from v2 (0000–0026) capturing PH government rate compliance. | When designing v3's compliance module. Re-implement against this, don't copy. |
| `compliance/seed-compliance.ts` | v2's compliance seed with rate values + Circular/RR citations in comments. | Same — read for citations, re-implement clean. |
| `compliance/module/` | v2's `src/modules/compliance/` source (service.ts, schema.ts, actions.ts, holiday-*.ts). | When understanding how v2 calculated SSS/PhilHealth/Pag-IBIG/BIR. Read, do not copy. |
| `v2-wiki-pages/` | v2's structured human-readable knowledge docs (compliance-rates, payroll-engine, architecture-audit, feature-inventory, taolink-overview, deployment-runbook). | When you need a human-readable version of what v2 was. |
| `v2-audit-docs/` | v2's accumulated audit findings (AUDIT, WEBAPP-AUDIT-V*, TAOLINK-HRIS-CLIENT-AUDIT). | When looking up what was broken in v1/v2 so v3 doesn't repeat it. |
| `v2-user-docs/` | End-user docs (HR_MANAGER_GUIDE, USER_GUIDE). | When making UX decisions — see how non-technical users describe the system. |
| `architecture-patterns/CLAUDE.md` | v2's project CLAUDE.md. | Reference for the modular/wiki/memory pattern Noel likes. |
| `architecture-patterns/llm-wiki.md` | Spec for the wiki/ pattern Noel adopted in v2. | When setting up v3's wiki/. |
| `architecture-patterns/memory-system-architect.md` | Spec for v2's memory/ system. | When setting up v3's memory/. |

## External pointers (not in this folder)

- **Figma board — Commander Group HRIS Full Suite Workflow:** https://www.figma.com/board/4NVg61o7uorJRXtlcWDBVH/Commander-Group-HRIS-Full-Suite-Workflow?node-id=0-1
- **Commander Group website:** https://commandergrp.com/Home/
- **v1 live demo (read-only, do not touch):** https://taolink.sistemahub.com

## How to think about this folder

- **`/ref/` is read-mostly.** Don't generate code from `/ref/`. Generate code from v3's own decisions, with `/ref/` informing the thinking.
- **When in doubt, ask Noel.** If `/ref/` content conflicts with what Noel says now, Noel wins. If `/ref/` is silent, ask — don't guess.
- **`/ref/` may go stale.** As v3 evolves and decisions are made, this folder reflects an earlier snapshot. Resumed sessions should treat the **current state of v3** as truth and `/ref/` as historical context.
- **Don't write into `/ref/`** during v3 development unless the user explicitly asks. Write into v3's own `memory/`, `wiki/`, and `docs/` instead.
