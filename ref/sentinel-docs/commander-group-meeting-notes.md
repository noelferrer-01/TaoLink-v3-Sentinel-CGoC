# Commander Group — Meeting Notes & Analysis
> **Confidential** | Sistem Hub — Client Discovery & Requirements Session
> **Date:** May 2026 | **Prepared by:** Noel (Sistema Hub) | **Status:** POST-MEETING REVIEW

---

## Quick Overview

| Field | Details |
| --- | --- |
| **Client** | Commander Group — Philippine Security Agency |
| **Attendees** | Commander Group representative + Noel (Sistema Hub) |
| **Topics Covered** | HRIS (Sentinel) • DTR Automation • Payroll • Recruitment • Inventory • Clock-in Solutions |
| **HRIS Status** | 2 years in development; existing system has gaps; DTR is the primary blocker |
| **Next Step** | Finalize recruitment module requirements after the meeting; clarify timeline for HRIS |

---

## 1. HRIS — Sentinel (Enterprise Build)

The HRIS project has been ongoing for approximately 2 years. They have an existing system but it is incomplete. The primary blocker is the DTR (Daily Time Record) automation and the absence of a Recruitment module.

Below are the modules and topics discussed during the meeting.

---

### 1A. DTR — Daily Time Record System

> **Key Requirement: DTR must be tracked per CLIENT, not just per employee globally.**

- A guard can be assigned to multiple clients in a single pay period
- If a guard is transferred from Client A to Client B mid-period: Client A is billed for days 1–4 only; Client B is billed from day 5 onward
- The DTR must split accurately across clients for billing and payroll
- Working hours cap: guards cannot exceed 60–72 hours; system must enforce this
- Rate variations per client must be respected: night shift differential, Saturday premium, emergency rates

**Current State (Pain Points)**

- Only ~30% of PTR (Payroll Time Record) is automated; the remaining ~70% is still manual
- Current process: guards send DTR via email or Messenger (one by one) — extremely time-consuming
- DTR is then manually uploaded to the system via Excel spreadsheet
- Common discrepancy: guard scheduled for 7 days, but actual DTR shows only 3 days worked
- No time to verify due to bulk volume — payroll accuracy suffers
- Advanced Management currently uses Excel for DTR uploads

---

### 1B. Clock-In Solution (Regional Guards Problem)

Regional guards (outside NCR) pose a significant challenge for DTR capture because:

- Many do not have smartphones or consistent access to apps
- No biometrics installed at single-post/remote deployments
- Biometrics are only available for large clients or government accounts

**Proposed Solutions Discussed**

- **QR Code Clock-in** — Head Guard / Detachment Commander (who has a phone) scans QR on behalf of guards without phones
- **Portal for shift management** at detachment level — whoever is assigned as shift head logs attendance
- For detachments **with an Admin staff** — admin handles the clock-in entry
- For detachments **without admin or phone access** — paper DTR is photographed and uploaded
- **Text message fallback** for truly offline scenarios
- If single-posting (one guard per post) — that one guard is responsible; Detachment Commander manages logging

> *Note: Guards resist new systems due to fear of wage deductions. Cultural buy-in is a challenge mentioned explicitly.*

---

### 1C. Payroll Module

- Salary computation itself is straightforward (basic formula: A + B)
- The complexity is in guard movement/allocation — tracking which guard worked where, for how long
- Disbursement of funds is the hardest part (not computation)
- **SSS Loan Deduction:** employer has the ability to reject SSS loans on behalf of guards; this needs to be built into the system
- Third parties (suppliers, not just employees) are also in the system
- Advance money tracking for guards needs to be visible in the system
- Audit log required — payroll changes and comments must be traceable
- System should flag discrepancies and allow payroll staff to add comments/justifications

---

### 1D. Guard Movement & Transfer (Logistics Model)

> **Noel's vision: guard movement should work like a logistics/parcel tracking system (similar to Shopee).**

- From recruitment → assigned post → transfer between clients → terminated — all stages are traceable
- Guards cannot be transferred without proper documentation in the system
- **ONLY the Recruitment team** has authority to officially transfer guards between clients (not Operations)
- Operations can request a transfer but the trigger/ownership stays with Recruitment
- Each guard transfer updates billing, DTR tracking, and payroll client assignment
- NCR focus first — regional guard movement to be handled in a later phase

---

### 1E. Recruitment Module — ⚠️ MISSING / HIGH PRIORITY

> **This module does not exist yet and was identified as the critical missing piece of the HRIS.**

New employees enter the HRIS through recruitment — there is no entry point without this module.

**What needs to be built:**

- Applicant Tracking System (ATS) — tabs for: Applied, Called/Contacted, Documents Complied, Hired
- Database of all past applicants retained even after the hiring process
- Terminated guard records — if a terminated guard re-applies anywhere, they are immediately flagged
- Blacklisted guard records — system prevents re-hiring without visibility
- Guard-to-post assignment originating from recruitment (not operations)

**Team Context:**

- Current recruiters: 6 people (discussed needing up to 10)
- Operations team: ~9 people; total headcount discussed was 13–23
- **Action Item:** Clarify full recruitment requirements after the meeting

---

### 1F. Inventory Module

- Covers: firearms, ammunition, accessories, uniforms, flashlights, gloves, night-stay gear, vehicles
- Inventory is tracked per-client and per-employee
- Can be packaged and assigned by company or by client
- Integrated with HRIS — can be detached as a standalone module if needed
- Items issued to a guard are tied to their name and client assignment
- Issuance, return, and balances must be visible from the system

---

### 1G. Client Rate Templates

Commander Group has hundreds of clients, each with different billing setups.

- Each client has their own rate table (not per guard — per client)
- Different break schedules, OT rules, and billing templates per client
- When a guard is assigned to Client A — Client A's rates apply, regardless of the guard's base rate
- When the same guard moves to Client B — Client B's rates apply from that point forward
- Billing system is tied to guard codes — no guard code = no bill generated
- Import flow: per-client template is pre-configured, then guards are imported against it

---

## 2. Pain Points Summary

| Area | Pain Point | Impact |
| --- | --- | --- |
| **DTR** | 70% of PTR still manual; sent via email or Messenger one by one | Errors, delays, payroll inaccuracy |
| **DTR Split** | No per-client DTR tracking for guard transfers mid-period | Wrong billing, payroll underpayment/overpayment |
| **Clock-in (Regional)** | No biometrics or smartphones for remote guards | Incomplete attendance records, manual fallback |
| **Payroll** | Complex guard movement allocation; disbursement is hard | Time-consuming, prone to human error |
| **Recruitment** | Entirely manual; no applicant tracking or blacklist system | No entry point to HRIS; rehiring terminated guards |
| **Guard Transfer** | No documented process for moving guards between clients | Unauthorized transfers; billing and payroll mismatches |
| **Working Hours** | No automated cap enforcement (60–72 hr limit) | Legal/compliance risk; overpay exposure |

---

## 3. Action Items & Next Steps

| # | Action Item | Owner | Priority |
| --- | --- | --- | --- |
| 1 | Define and document Recruitment module requirements | Commander Group + Noel | **HIGH** |
| 2 | Finalize DTR per-client tracking logic and workflow | Noel (Sistema Hub) | **HIGH** |
| 3 | Design QR code clock-in flow for detachment commanders | Noel (Sistema Hub) | **HIGH** |
| 4 | Map out guard transfer process and access control (Recruitment owns transfer) | Both | **HIGH** |
| 5 | Define client rate table structure (hundreds of clients) | Commander Group | **MEDIUM** |
| 6 | Scope Inventory module requirements | Commander Group | **MEDIUM** |
| 7 | Define SSS loan rejection flow in payroll | Commander Group Payroll Team | **MEDIUM** |
| 8 | Clarify headcount: recruiters (6 current, 10 needed?), ops team size | Commander Group | **LOW** |
| 9 | Discuss Mac-to-Windows transition and its impact on system delivery | Both | **LOW** |

---

## 4. Other Notes from Meeting

- **Mac-to-Windows Transition:** The Commander Group team is transitioning from Mac to Windows. This may affect tooling or delivery timelines.
- **Hard Worker Reference:** Someone on their team (likely a key operations or admin person) was mentioned as working until 12 midnight to 1am — noted as highly dedicated. Keep this in mind when estimating system adoption workload.
- **Marketing (Jen):** A person named Jen was mentioned in the context of marketing for Commander Group. Marketing efforts appear to be just getting started.
- **Existing System:** Commander Group already has a partial system in place. The HRIS build is not from scratch in terms of data — they have existing payroll and HR records that need to connect.
- **Third Parties in System:** Not just employees — the system needs to accommodate suppliers and third-party service providers in their records.
- **HRIS 2 Years in the Making:** The project has been under planning/development for about 2 years. Management is aligned on the need but the implementation gap remains.
