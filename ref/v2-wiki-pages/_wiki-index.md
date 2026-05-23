# Wiki Index — TAOLINK

> Catalog of all pages in the wiki. Read this first when navigating.

## How to read this

Each entry is `[Page](path) — one-line description`. Organized by category. Keep this index under ~200 lines; link, don't inline.

---

## Overview

- [taolink-overview](pages/taolink-overview.md) — what TAOLINK is at a glance
- [feature-inventory](pages/feature-inventory.md) — what's built, what's partial, what's missing (from client audit 2026-04-27)

## Modules

- [payroll-engine](pages/payroll-engine.md) — payroll math, statutory calcs, BIR/SSS/PhilHealth/Pag-IBIG (audited clean as of 2026-03-29)
- [compliance-rates](pages/compliance-rates.md) — canonical citation index for every statutory rate, ceiling, and holiday (last verified 2026-05-23)
- `attendance` — clock in/out, GPS, selfie, ZKTeco import *(to be written)*
- `employees-201` — 201 file management
- `leaves` — leave types, requests, approvals
- `loans` — loan creation, amortization, concurrent-loan warning
- `compliance` — audit trail, encryption, gov't report generation
- `ess-portal` — Employee Self-Service
- `auth-2fa` — Lucia auth, 2FA, sessions
- `background-worker` — job queue, scheduled work, scaling to 10k employees

## Operating

- `deployment-runbook` — how to deploy TAOLINK v2 *(to be written; draft from `deploy/` scripts + `domains/deployment.md`)*
- `local-dev-setup` — MAMP, `.env.local`, `npm run dev:all` *(to be written)*
- `database-migrations` — Drizzle, generate / migrate / push / studio *(to be written)*

## Architecture & Decisions

- [architecture-audit](pages/architecture-audit.md) — DB choice, 10k-scale validation, dependency review (2026-05-21). **Includes critical Lucia v3 deprecation finding.**

## References

- [sources](sources/README.md) — index of raw source documents (audit reports, codebase, db backup)
- Each `src/modules/*/README.md` — per-module purpose, public API, dependencies, known failure modes
- `glossary` — Philippine payroll terms (SSS, PhilHealth, Pag-IBIG, BIR 1601-C, 2316, MWE, 13th month, etc.) *(to be written)*

---

*Pages marked "to be written" are tracked goals. They will be created as the relevant feature is documented or the relevant question is asked.*
