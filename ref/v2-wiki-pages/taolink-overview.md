---
tags: [overview, product]
last_updated: 2026-05-21
sources: [TAOLINK-HRIS-CLIENT-AUDIT.md, AUDIT.md, checkpoint.md]
---

# TAOLINK — Overview

> The seed page for the wiki. Starts as a high-level orientation; expands as feature pages get written.

## What TAOLINK is

TAOLINK is a **Philippine HRIS and payroll system** for SMBs through enterprises (designed to handle up to ~10,000 employees). It is a product of [SistemaHub](https://sistemahub.com).

It bundles:

- A **payroll engine** that computes Philippine statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR withholding) correctly per current rulings.
- **Attendance** with GPS + selfie clock-in, ZKTeco biometric CSV import.
- **Employee 201 file** management.
- **Leave** and **loan** management with concurrent-loan warnings.
- **Government remittance reports** (BIR 1601-C, 2316).
- An **Employee Self-Service (ESS) portal**.
- **2FA, audit trail, encryption** for sensitive data.

See [taolink.sistemahub.com](https://taolink.sistemahub.com) for the current production system (running the predecessor codebase, "Payroll Central"). This workspace is **TAOLINK v2** — the local upgrade in progress.

## Production verdict (per [AUDIT.md](../../AUDIT.md), 2026-03-29)

**Production-ready.** All 10 original calculation bugs, all 5 post-audit issues, and all 14 re-audit issues are resolved. No open calculation errors.

## Tech foundation

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| Language | TypeScript 5 (strict) |
| Database | MySQL via Drizzle ORM |
| Auth | Lucia 3 (with arctic for OAuth, MySQL adapter) |
| Background jobs | Custom worker process (`src/workers/`) |
| PDF generation | pdfkit (payslips, BIR forms) |
| Testing | Vitest + Playwright |
| Styling | Tailwind 4 |
| Deploy | PM2 + nginx on VPS |

## Module map (`src/modules/`)

- `attendance` — clock in/out, time logs, ZKTeco import
- `audit` — audit trail of admin actions
- `auth` — login, 2FA, session
- `compliance` — gov't report generation
- `dashboard` — admin overview
- `employees` — 201 files
- `leave` — leave types, requests, approvals
- `loans` — loan creation, amortization
- `payroll` — pay run, calculations, CSV, payslip PDF
- `settings` — system config

Each module is **self-contained**. Public surface exposed via `index.ts`. See [AGENTS.md §4](../../AGENTS.md) for module rules.

## Brand

- **Colors:** Pinoy Teal `#0D9488`, Trust Obsidian `#111827`, Growth Lime `#22C55E`
- **Typography:** Plus Jakarta Sans
- **UI accent:** animated "blob" background, persistent TaoLink symbol in collapsed sidebar
- **Button standard:** 44px height (`--btn-height: 2.75rem`)

## What's NOT built (per [TAOLINK-HRIS-CLIENT-AUDIT.md](../../TAOLINK-HRIS-CLIENT-AUDIT.md))

- Native mobile app — mobile clock works through web
- Live biometric device sync — only ZKTeco CSV import
- Performance management (KPIs, reviews, 360°)
- Recruitment / ATS
- Training / LMS

## Where to go next

- For **operating the system locally**, see `local-dev-setup` *(to be written)*.
- For **deploying to a VPS**, see `deployment-runbook` *(to be written)*. Until then, [memory/domains/deployment.md](../../memory/domains/deployment.md) has the current state.
- For **understanding the payroll math**, see `payroll-engine` *(to be written)*. Until then, [AUDIT.md](../../AUDIT.md) is the source of truth.
- For **the V2 upgrade plan**, see `upgrades-plan` *(to be written, once the upgrade scope is defined)*.
