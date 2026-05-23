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
- **The current `ref/sentinel-docs/commander-group-meeting-notes.md` is a Claude-generated summary** (from web chat), NOT Noel's raw notes.
- **Possible gaps:** inferred details, missing nuance, possible inaccuracies.
- **Full meeting transcription available** if needed — Noel will drop it in `ref/sentinel-docs/*.txt` on request.
- **Exclude:** email-system portions of the meeting — that's a separate completed project.
- The Figma flowchart (https://www.figma.com/board/4NVg61o7uorJRXtlcWDBVH/Commander-Group-HRIS-Full-Suite-Workflow) was also Claude-derived from the same context; Noel uses it as a starting point, not a binding spec.

## Open questions for Commander Group department heads
See the full questionnaire at `../../ref/sentinel-docs/sentinel-client-questionnaire.md`. Hard-blocking items before any Phase-0 code:
- Part A (internal vs licensable → multi-tenancy call)
- Part D8–10 (applicant vs employee legal moment → lifecycle boundary)
- Part E7–8 (exhaustive employee statuses and which are paid → guard state machine)
- Part G1–3 (shift patterns per client → shifts as global table or client config)
- Part J18 (per-client equipment profiles → inventory data model)
- Part N (approval thresholds → approvals primitive data model)
- **Recruitment vs Deployment ownership** (per §1D meeting notes — see `wiki/decisions/0001`)
