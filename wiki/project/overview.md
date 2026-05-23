# Sentinel — Project Overview

> **TaoLink v3, codenamed Sentinel** — a production-grade Philippine HRIS + payroll system, customized first for **Commander Group of Companies** (Philippine private security agency, 10,000+ guards, 100+ detachments).

## The 60-second pitch

A modular HRIS and payroll platform built for the operational shape of a Philippine private security agency: guards-with-client-assignments (not single-employer employees), per-client DTR and billing splits, applicant pool distinct from employees, marketing → deployment → recruitment flow with end-to-end SLA tracking, full PH compliance (SSS, PhilHealth, Pag-IBIG, BIR, DOLE, PNP SOSIA, PNP-FEO, NTC), and an AI copilot layer that strictly *uses* deterministic core modules rather than computing payroll or compliance facts itself.

## The client: Commander Group of Companies

- Philippine private security agency. https://commandergrp.com/Home/
- **Scale:** 10,000+ employees and security guards.
- **Geography:** HQ in Manila; 100+ detachments across the country.
- **Existing state:** Partial HRIS in ~2 years of internal development; DTR automation is the primary blocker; Recruitment module is the critical missing piece.
- **Key operational rules:**
  - DTR must be tracked **per client**, not per employee globally — guard transfers mid-period split billing between clients.
  - Regional guards typically lack smartphones and biometrics → QR-code clock-in via Detachment Commander is the proposed solution.
  - Working-hours cap (60–72 hrs) must be system-enforced.
  - Rate tables are **per client**, not per guard.
  - **Recruitment team** owns guard-transfer authority, not Operations.

See [`../../memory/domains/commander-group.md`](../../memory/domains/commander-group.md) for the full client knowledge dump.

## History — why v3 is a fresh start

- **v1 = PayrollCentral.** Noel's first attempt. Live on the VPS at `taolink.sistemahub.com`. Demo target for Commander Group. Will not be touched.
- **v2 = TaoLink.** Duplicate-and-improve attempt. Has real engineering wins (Sentry, 22 migrations, hand-rolled auth) but inherits v1's opaque-codegen pattern. Archived.
- **v3 = Sentinel.** Fresh start. The architecture is structurally different (4-layer split, event-driven contracts, Phase-0 auth+audit+approvals primitive). The discipline is also different — read-as-you-build, README-before-code, demo-ability as the done test.

The full history lives in [`../../ref/00-RESUME-POINT.md`](../../ref/00-RESUME-POINT.md) §2.

## Status

**Pre-Phase-0.** No code written. Hard gates open. See [`status.md`](status.md) for current gate state and immediate next actions.

## Owner

- **Noel Ferrer** — Co-Founder, SistemaHub.
- Client-doc identity: **SistemaHub**. Signatory: **Jenefer Ayson — Co-Founder**, jen@sistemahub.com.
