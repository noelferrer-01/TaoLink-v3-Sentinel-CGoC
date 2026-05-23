# Commander Group of Companies — Client Knowledge

## Identity
- **Name:** Commander Group of Companies
- **Industry:** Philippine private security agency
- **Website:** https://commandergrp.com/Home/
- **HQ:** Manila; regional deployments across PH

## Scale
- **10,000+ employees and security guards**
- **100+ detachments** (client sites), each with different requirements (firearms, radios, uniforms, training specs)
- Recruitment team: 6 current, discussing growth to 10
- Operations team: ~9
- HR/Ops total discussed: 13–23

## Existing system context
- HRIS project has been in development ~2 years.
- They have a partial system — payroll and HR records exist that need to connect.
- Primary blockers: **DTR automation** and **missing Recruitment module**.
- Currently ~30% of PTR (Payroll Time Record) is automated; ~70% manual via email/Messenger DTR submission.
- Advanced Management currently uses Excel for DTR uploads.

## Critical pain points (from meeting notes)
1. **DTR per CLIENT, not per employee globally.** Guard transferred from Client A → B mid-period must split billing: Client A days 1–4, Client B days 5+. No automation today.
2. **Regional guards have no smartphones or biometrics.** Need QR-code clock-in by Detachment Commander, or paper DTR photographed and uploaded, or text fallback.
3. **Working-hours cap (60–72 hours)** must be enforced by the system.
4. **Per-client rate tables** — hundreds of clients, each with their own rates, break schedules, OT rules. Guard's billing rate = the client's rate (not guard's base rate).
5. **No applicant tracking / blacklist system.** Terminated/blacklisted guards re-applying are not flagged today.
6. **Guard transfer authority belongs to Recruitment, not Operations.** Operations can request; Recruitment triggers/owns.
7. **SSS Loan rejection** — employer can reject SSS loans on behalf of guards; needs to be in the system.
8. **Third parties (suppliers)** are in the system too, not only employees.

## Guard movement model (Noel's vision)
- "Like a logistics / parcel tracking system (Shopee-style)."
- From recruitment → assigned post → transfer between clients → terminated, all stages traceable.
- Guards cannot be transferred without proper documentation in the system.
- Each guard transfer updates billing, DTR tracking, payroll client assignment.
- NCR focus first; regional movement is a later phase.

## Cultural factor
- **Guards resist new systems** due to fear of wage deductions. Adoption is a real challenge, not just a technical one.

## Marketing
- Person named **Jen** mentioned in context of Commander Group marketing — appears to be just starting.

## Other notes
- Commander Group team is **transitioning Mac → Windows** internally; may affect tooling or delivery timelines.
- One team member (operations/admin) regularly works until midnight–1am — highly dedicated. Useful signal for adoption-load estimates.

## Meta — provenance of the meeting notes
- **The summary `ref/sentinel-docs/commander-group-meeting-notes.md` is Claude-generated** (from web chat), NOT Noel's raw notes.
- **Raw meeting transcripts (added 2026-05-24):**
  - `ref/sentinel-docs/IMG_6844 (transcribed on 08-May-2026 15-32-51).txt` — 36 KB, Tagalog-English mix, primary content.
  - `ref/sentinel-docs/IMG_6846 (transcribed on 08-May-2026 15-32-31).txt` — 4 KB, addendum.
- **Exclude from analysis:** email-system portions of the transcripts (separate completed project).
- The Figma flowchart (https://www.figma.com/board/4NVg61o7uorJRXtlcWDBVH/Commander-Group-HRIS-Full-Suite-Workflow) was also Claude-derived; Noel uses it as a starting point, not a binding spec.

## Transcript-confirmed insights (added 2026-05-24)

- **Recruitment is THE entry point** — explicitly stated multiple times by CG: "Sa recruitment, yun yung wala eh. Yun yung kailangan pumasok sa HRIS niyo na mga bagong empleyado." Confirms [decision 0009](../../wiki/decisions/0009-hr-starter-and-recruitment-as-entry-point.md).
- **The bug Sentinel must fix:** Operations sometimes makes ad-hoc transfers today without paperwork ("Hindi ka naman pwede maglipat from A to B. Pag walang papel"). Recruitment loses track. Centralizing authority in Recruitment (per [0001](../../wiki/decisions/0001-recruitment-vs-operations-ownership.md)) fixes this.
- **Operations role pivots, doesn't disappear** — under the new model, Ops does logistics + client liaison + monitoring + transfer requests. See [0011](../../wiki/decisions/0011-operations-role-pivot.md).
- **"Calculation is simple, allocation is hard"** — payroll math is trivial (A + B); the real complexity is tracking which guard was at which client for how many days at what rate.
- **Detachment admin presence varies** — some detachments have admin staff who handle clock-in entry; others don't. Clock-in workflow must handle both.
- **CG has multiple existing systems** — partial HRIS, light inventory/firearms, executive system. Per [0003](../../wiki/decisions/0003-relationship-to-existing-cg-system.md), Sentinel does NOT integrate with any of them; they may be deprecated by CG at their own pace.
- **Hundreds of clients, each with own rate templates** — different break schedules, OT rules, night-shift differentials, Saturday premiums, emergency rates. Rate tables are per-client, not per-guard. Guard's billing rate = the client's rate (regardless of guard's base rate).
- **Guard turnover & wealth nuance** — some guards are wealthy ("mga mayayaman na guards"); turnover is not purely income-driven. System tone should respect that.
- **CG has third parties (suppliers) in the system** — not only employees. The data model must accommodate non-employee parties.
- **"Movement like Shopee logistics"** — Noel's vision for guard-tracking UI, explicitly reaffirmed in the transcript.

## Open questions for Commander Group department heads
See the full questionnaire at `../../ref/sentinel-docs/sentinel-client-questionnaire.md`. Hard-blocking items before any Phase-0 code:
- Part A (internal vs licensable → multi-tenancy call)
- Part D8–10 (applicant vs employee legal moment → lifecycle boundary)
- Part E7–8 (exhaustive employee statuses and which are paid → guard state machine)
- Part G1–3 (shift patterns per client → shifts as global table or client config)
- Part J18 (per-client equipment profiles → inventory data model)
- Part N (approval thresholds → approvals primitive data model)
- **Recruitment vs Deployment ownership** (per §1D meeting notes — see `wiki/decisions/0001`)
