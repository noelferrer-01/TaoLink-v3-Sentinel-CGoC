# HR-Operations & Compliance Review — Sentinel vs a PH Security Agency

**Date:** 2026-06-12
**Lens:** Written from the seat of an HR/payroll operations head running a 10,000-guard Philippine security agency (Commander Group). Reviews everything built through **Slice 4 (Billing & SOA)**.
**Purpose:** A standing **guide and roadmap input** for what to build next. The ranked gap register below is the planning backbone for Slices 5+.

> **Two caveats this whole doc rests on:**
> 1. **Pre-production.** Everything is built + tested in-repo; nothing is live at CGoC. The hardest, guard-specific ~40% of payroll is deliberately still ahead.
> 2. **Requirements are largely single-source.** Most "requirements" came from one discovery call + an unanswered questionnaire. Several design assumptions (exact clearance checklist, armed/unarmed = a pay difference, the employee-status list) are PH-industry norms, **not CGoC-confirmed**. Confirm before real guard data goes in. See [`ref/sentinel-docs/sentinel-client-questionnaire.md`](../../ref/sentinel-docs/sentinel-client-questionnaire.md).

---

## 1. What's built and genuinely strong (keep / build on)

| Strength | Why it matters to HR |
|---|---|
| **Credential wallet + readiness radar** (Slice 3b) — SOSIA, NBI/police/barangay, neuro, drug, medical, training cert (SBR/RTC), LTOPF, all expiry-tracked; flags "can't legally stand post" before lapse | This is the standout, and it's genuinely security-specific. Lapsed SOSIA/clearances get agencies relieved off contracts and fined. The LTOPF "firearm link unverified" caveat shows real domain understanding. |
| **Person-centric identity** (Slice 3a) — one person, many roles, anchored on PhilSys/SSS/TIN | Matches the rehire/turnover/reliever reality; stops duplicate half-records. |
| **Frozen per-client DTR attribution** (Slice 1/4) — a mid-cutoff transfer bills + pays day-by-day against the right client's rate off a stamp that can't be silently rewritten | CGoC's #1 data quirk, handled correctly. Most vendors get this wrong. |
| **Statutory deduction core** (Slice 1) — SSS/PhilHealth/Pag-IBIG/BIR, effective-dated, reconciles to v2 within ₱1 | The boring part, done right. |
| **Recruitment as the front door + blacklist + auto-flag terminated guards** (Slice 3) | Matches the gap CGoC named loudest ("recruitment is what's missing"). |
| **Append-only audit log** (Slice 0) | Your defense when a guard files a DOLE money claim. |

---

## 2. The gap register (ranked by real DOLE/legal exposure)

Status legend: **ABSENT** (not in repo at all) · **DEFERRED** (consciously out-of-scope, catalogued) · **PARTIAL** (label/slot exists, logic doesn't).

| # | Gap | Status | The DOLE/legal "why" | Maps to |
|---|---|---|---|---|
| **1** | **Floating / off-detail 6-month clock** | ABSENT (floating is a label with no timer) | D.O. 150-16: a guard off-detail >6 months = constructive dismissal. The #1 case guards *win*. At 10k guards, hundreds float at any time — system is blind to the clock. Data half-exists (assignment end dates, status-change audit). | **Slice 5 candidate** (small, highest legal payoff) |
| **2** | **Guard wage stack** — night differential (NSD), holiday pay (200%/130%), rest-day premium, 13th-month, service incentive leave (SIL). OT is in the formula but hardwired to 0. No holiday calendar table. | DEFERRED ("rate-stack engine slice") | For guards these are the *norm*, not edge cases — most of variable pay. A payslip without them is a wage underpayment = per-guard money claim. Empty holiday table silently pays 1.25× instead of 2.6× (v2 AUDIT.md warns of this). | **Slice 5/6 candidate** (biggest; unblocks real payroll) |
| **3** | **Solidary liability / pay-guard-regardless + AR aging** — no link between "client is 60 days late" and "these guards' wages are exposed"; no aging buckets. The word "solidary" appears nowhere. | ABSENT | Labor Code Art. 106-109: agency is jointly-and-severally liable for guard wages even if the client doesn't pay. Cashflow + legal blind spot. | Billing follow-on slice |
| **4** | **Minimum-wage floor / regional wage orders** — flat basic salary per guard, no region field, no wage-order table, no validation | ABSENT | Pay below the regional minimum = per-head DOLE violation. Multi-region scale makes this a needed guardrail. | Pre-real-data guardrail |
| **5** | **Cash bond + loans/deductions infrastructure** — no schema for any non-statutory deduction; CGoC also wants employer-side SSS-loan *rejection* to protect take-home | ABSENT (loans tagged "Slice 6") | Cash bonds are near-universal and regulated (held in trust, refundable on separation). Salary/SSS/Pag-IBIG loans, uniform amortization — nowhere to record. | Slice 6 (loans/deductions) |
| **6** | **Government remittance completeness** — only SSS R-3 + BIR 2316 export. Missing PhilHealth RF-1, Pag-IBIG MCRF, monthly BIR 1601-C, year-end Alphalist | DEFERRED | Recurring legal filings. Contributions are *computed* correctly; most can't be *filed* yet. | Compliance-exports slice |
| **7** | **DTR ingestion at bulk** — manual web form only. No QR/photo/SMS capture ladder, no 60/72-hr cap enforcement | DEFERRED | The actual operational bottleneck that started this project (~70% of DTR still arrives by email/Messenger; staff up to 1 a.m. reconciling). | Ops-tooling slice |
| **8** | **RBAC / roles** — everyone is super-admin; no signup/reset/2FA | DEFERRED | 10k people's PII + wages + gov IDs. Data Privacy Act (NPC) + segregation of duties (the DTR editor ≠ the pay-run releaser = payroll-fraud control). Also enforces the intended "Recruitment owns transfers" rule. | **Pre-real-data guardrail (must)** |
| **9** | **Leave management** — none; SIL is a statutory minimum | DEFERRED | SIL (5 days) is mandatory; no accrual/balance/monetization exists. | With wage stack |
| **10** | **201-file completeness** — credentials yes, but no document storage (contracts, training certs, medical), no disciplinary/incident records, no performance, no salary history | DEFERRED (blocked on file/blob storage) | The legal personnel file. Incident/AWOL/post-abandonment is a core HR workflow. | Later slice (needs blob storage) |

**Silent-failure note (cross-cutting):** if no statutory rate row covers a period, deductions compute to ₱0 with **no error** (flagged in `modules/compliance/README.md` + `modules/payroll/README.md`). At 10k guards that's wrong payslips at scale. The guard is documented but not implemented.

---

## 3. People & process realities (not code, but real)

- **Adoption risk is real and named.** Guards resist new systems fearing hidden deductions — and some guards aren't poor/desperate, so compliance isn't automatic. The antidote is **radical payslip transparency** (itemized earnings + deductions). This makes the wage-stack work (#2) double-important: a clear, complete payslip is the adoption tool, not just a compliance artifact.
- **The unpaid "cleared-but-not-deployed" practice is the biggest *legal* exposure, and the lawyer consult is still open** ([ADR 0004](../decisions/0004-applicant-pool-legal-classification.md)). The applicant↔employee line is exactly what a money claim turns on. Get the labor lawyer's answer before operationalizing.
- **Build is running ahead of discovery.** Org chart, exhaustive statuses, the real clearance checklist, and client-requirement lists are still unconfirmed by department heads.

---

## 4. Open questions that block correctness (answer before go-live)

1. **Billing tax treatment** — VAT/EWT on the agency fee only, or the whole invoice? Wage pass-through vs. blended rate? (SOA tax lines are placeholders until answered.)
2. **Is the SOA a BIR-registered numbered document** or an internal statement before the OR?
3. **When do government IDs arrive** — at screening or at hire?
4. **Armed vs. unarmed — pay/billing difference, or only a credential difference?** Currently modeled only as a credential. If armed posts pay more, that's an unbuilt rate dimension.
5. **D.O. 150-16 / SOSIA / PNP-FEO reporting scope** — what filings, how often, what format? Confirm with CGoC's compliance officer.

(Plus the **labor-lawyer consult** on the unpaid-cleared-applicant practice — the highest legal risk.)

---

## 5. Recommended slice sequence (the roadmap)

> Principle: build the **guardrails before real data**, then the **critical-path payroll completeness**, then breadth. Items below are *recommended*, not yet contracts.

1. **Before any real guard data:** RBAC/roles · minimum-wage floor · the **floating/off-detail clock**. Cheaper now than retrofitting after an incident.
2. **Wage-stack engine + holiday calendar** (NSD, holiday, rest-day, 13th-month, SIL). The hard 60%; nothing is "real payroll" without it. **Unblocked by client questions** — the rates are statutory and already captured in `ref/` (v2 did this correctly).
3. **Answer the 5 questions + the lawyer consult.** Cheap, unblocks correctness.
4. **DTR ingestion ladder** (QR / photo / SMS + 60/72-hr cap). The operational bottleneck.
5. **Government remittance exports** (PhilHealth RF-1, Pag-IBIG MCRF, BIR 1601-C, Alphalist).
6. **Cash bond / loans / deductions**, then **AR aging + solidary-liability surfacing** on billing.

### Top recommendation for the *next* slice
- **Primary: the wage-stack engine (complete the guard payslip).** It's the critical path to legally-correct, adoption-winning payroll; it's the most demo-able to CGoC; and it's **not blocked** by any client answer (statutory rates live in `ref/`). It does need a holiday-calendar table built alongside.
- **High-value small companion: the floating/off-detail clock.** Smallest build, highest legal payoff; a natural "radar" sibling to the readiness radar; de-risks go-live. Good to bundle right after (or before) the wage stack.
- **Must-do guardrail regardless: RBAC.** Required before real guard PII/wages enter the system.

---

## How to use this doc

When scoping any Slice 5+, start here: pick the gap, check its DOLE "why" and what it's blocked by, and cross-reference the relevant slice contract's deferred list. Update the status column as gaps close. This review is a snapshot as of Slice 4 — re-run the lens after every 1–2 slices.

**Source backbone:** the grounded research behind this lives in `wiki/slices/*` (contracts + done-sweeps), `modules/payroll/{compute,service,schema}.ts` (proves payslip = basic + 4 deductions), `modules/compliance-exports/index.ts` (the two-export surface), `ref/v2-audit-docs/AUDIT.md` (v2's verified-correct rate stack — the gold standard already hit once), `memory/domains/{commander-group,compliance,workflows}.md`, and `ref/sentinel-docs/` (the discovery transcripts + questionnaire).
