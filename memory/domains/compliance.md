# Compliance — Philippine HRIS Regulatory Knowledge

## Discipline
- **Do NOT copy v2 compliance code into v3.** Read it as the specification of "what rates Noel already audited and cited." Re-implement against the SQL migrations and seed comments, citations preserved, in v3's cleaner architecture.

## Knowledge corpus location
- **Audited migrations (27 SQL files, 0000–0026 + meta journal):** `../../ref/compliance/migrations/`
- **Audited seed file (rates with Circular/RR citations in comments):** `../../ref/compliance/seed-compliance.ts`
- **v2 module source (study, do not copy):** `../../ref/compliance/module/`
- **Structured human-readable rates with citations:** `../../ref/v2-wiki-pages/compliance-rates.md` — often easier than reading SQL
- **v2 payroll engine narrative:** `../../ref/v2-wiki-pages/payroll-engine.md`

## Regulators in scope
| Regulator | Scope |
|---|---|
| **SSS** | Social Security System — contributions, loans |
| **PhilHealth** | Health insurance contributions |
| **Pag-IBIG (HDMF)** | Housing fund contributions (incl. MFS cap restore — Circular 460) |
| **BIR** | Tax withholding, RR 29-2025 de minimis benefits, 13th-month, certificates (2316) |
| **DOLE D.O. 150-2016** | Service contractor regulations (security agency-specific) |
| **PNP SOSIA** | Supervisory Office for Security & Investigation Agencies (agency licensing, guard accreditation) |
| **PNP-FEO** | Firearms and Explosives Office (firearm registration, license tracking) |
| **NTC** | National Telecommunications Commission (two-way radio frequency licensing) |

## Recent regulatory items captured in v2
- **Pag-IBIG MFS cap restore** — Circular 460
- **de minimis benefits** — RR 29-2025
- **Attendance selfie + GPS** — added in v2 (operational, not regulatory)
- **Backup codes for MFA** — v2 hand-rolled auth
- **Remittance filings** — SSS/PhilHealth/Pag-IBIG filing tracking
- **Salary-history constraints** — DB-level
- **13th-month disbursements** — labor code mandatory

## Open compliance asks (from /ref/ recommended next steps)
- One-time **labor lawyer consult** for applicant-pool legal classification (DOLE has hit other agencies for non-payment of guards under contract).
- **PNP SOSIA / DOLE D.O. 150 / FEO / NTC scope confirmation** with Commander Group's compliance officer — reporting frequency, format, regulator-facing exports.

## Risks (per /ref/)
- **Payroll bugs are catastrophic at 10k employees.** Plan for parallel-run periods before cutover.
- **Firearm tracking has legal weight.** Audit log is evidence in potential investigations. Treat as immutable.
- **Biometric DTR ingestion is messier than it looks.** Idempotent ingestion + reconciliation reports from day one.
- **Chatbot hallucinations on payroll** — payroll explainer must quote actual numbers from the engine, never paraphrase.
