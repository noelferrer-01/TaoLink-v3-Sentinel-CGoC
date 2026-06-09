# Slice 3 — Recruitment ATS — Done sweep

> **Date:** 2026-06-09. **Branch:** `slice-3-recruitment`. **Status:** implementation complete; awaiting Noel's UX re-walk before tag.
> Spec: [`3-recruitment-ats.md`](3-recruitment-ats.md) · Plan: [`3-recruitment-ats-plan.md`](3-recruitment-ats-plan.md)

## Demo done-test (spec §1) — verified in a real browser (Playwright walk)

| # | Step | Result |
|---|------|--------|
| 1 | New applicant → appears in pipeline | ✓ Created "Ana Reyes" (Guard, walk-in); landed at stage **Applied** |
| 2 | Advance Applied → Contacted → Documents; doc checklist present | ✓ Both advances worked; 9 required clearance docs seeded (NBI, PNP, barangay, drug, medical, neuro-psych, SBR/RTC, SOSIA, resume), each with status + expiry + Save |
| 3 | Hire → short form | ✓ Modal opened; employee code **auto-filled `CG-10101`** (next after seed's CG-10100), salary + hire date |
| 4 | Hire creates the employee | ✓ New employee at `/employees/<id>` — `CG-10101`, status **Hired**, Ana Reyes, Guard, ₱18,000, DOB carried over; applicant back-links to it |
| 5 | Blacklist/terminated match flagged | ✓ Added blacklist "Bad Guy" (b. 1985-05-05); a matching applicant shows the red banner **"⚠ Possible match — review before hiring · Blacklist (possible name match): Guy, Bad — Theft on duty"** |
| 6 | Full applicant database searchable | ✓ List page paginated + searchable by name/SSS + stage filter; rejected/withdrawn retained |

## Automatic criteria

| Criterion | Status |
|---|---|
| Full test suite green | ✓ 214 passed (21 files), incl. 14 new recruitment/hr/payroll tests |
| Typecheck | ✓ `tsc --noEmit` clean |
| Lint | ✓ `next lint` — no new warnings (2 pre-existing, unrelated) |
| Payroll-safety (hired-undeployed ⇒ no payslip) | ✓ asserted in `recruitment.test.ts` + payroll guard test |
| Migrations apply cleanly (dev + test DB) | ✓ 0019 (tables) + 0020 (FK SET NULL) |
| Module README + ADR-grounded design | ✓ |

## What shipped

- `modules/recruitment` — applicants + document checklist + blacklist; service with audit + events on every mutation; `hireApplicant` ADR-0009 handoff to `hr.createEmployee`.
- `modules/payroll` — zero-attendance guard (no phantom payslips / no phantom government-export contributions).
- `modules/hr` — `generateNextEmployeeCode`.
- UI under `app/(admin)/recruitment/` — list, new, detail (+ doc checklist + match banner), hire modal, blacklist; new "Recruitment" nav section.

## Deferred (per spec §7) — not regressions

Kanban board view; Marketing demand chain; Deployment/reshuffle ownership (RBAC); approval gates; training records; document **file** uploads (status tracked, not files); RBAC "Recruiter" role; pool-timeout/expiry automation.

## Open items carried to Noel / client / lawyer (spec §8)

1. **[LAWYER]** Exact applicant→employee legal moment (ADR 0004 vs 0009). Built per 0009 (hire creates employee), made safe by the payroll guard; isolated to one call so it's movable.
2. **[CLIENT]** Confirm screening stages + required-document set (armed vs unarmed) — D2/D5.
3. **[CLIENT]** Whether a signed contract artifact is required at hire — D9.
4. **[NOEL]** `CG-#####` auto-increment confirmed working (minted CG-10101 live).

## Notes for the re-walk

- Walk leaves demo data in the dev DB (applicants "Ana Reyes" → employee CG-10101, "Bad Guy"; one blacklist entry). Harmless; remove or keep as feature demo. Reseed base data anytime with `pnpm db:seed:slice2-demo`.
- A build error was caught + fixed during the walk: a client component imported labels from the module index (pulling server-only DB code into the client bundle). Fixed by importing from the `/labels` subpath — the established convention.
