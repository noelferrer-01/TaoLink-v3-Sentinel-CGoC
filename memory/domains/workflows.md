# Workflows — Module Contracts

> Prior thinking from `../../ref/sentinel-docs/sentinel-conversation-log.md` §8. These are *contracts* — the handoffs between modules. Write them BEFORE coding the module. Status: reference, not binding for v3 until validated against questionnaire answers.

## Marketing → Deployment → Recruitment (new client demand)

```
Marketing.RequestFormSubmitted (need 100 guards, requirements)
    ↓ approval gate
Marketing.RequestApproved
    ↓
Deployment receives demand
    ├─ Active employees available? → use first
    │     → Deployment.AssignmentCreated
    │
    └─ Applicant pool? → call them up
          → Recruitment.CandidateActivated
          → HR.EmployeeCreated (status: training or deployed)
          → Deployment.AssignmentCreated
    ↓
Shortfall? → Recruitment.HiringRequisitionOpened
```

⚠ **RESOLVED 2026-05-23 — Commander Group practice adopted:** Recruitment owns the entire chain including assignment creation. The "Deployment" actor below is actually a logical role within Recruitment; Operations can only file `Operations.TransferRequested` events. See [`../../wiki/decisions/0001-recruitment-vs-operations-ownership.md`](../../wiki/decisions/0001-recruitment-vs-operations-ownership.md) + [`../../wiki/decisions/0011-operations-role-pivot.md`](../../wiki/decisions/0011-operations-role-pivot.md).

## Reshuffle (internal guard reassignment) — UPDATED 2026-05-23

```
Operations files Operations.TransferRequested (optional — Recruitment may initiate directly too)
    ↓ approval gate
Recruitment reviews → approve / reject
    ↓ (if approved)
Recruitment.AssignmentEnded (Guard A leaves Detachment 1)
    ↓
Recruitment.AssignmentCreated (Guard A starts at Detachment 2)
    ↓ event bus
Inventory subscribes: does Guard A's assets match Detachment 2 needs?
    ↓ (if mismatch)
Inventory.AssetIssuanceRequired
```

Per [0001](../../wiki/decisions/0001-recruitment-vs-operations-ownership.md) + [0011](../../wiki/decisions/0011-operations-role-pivot.md): Operations cannot execute transfers, only request them. Per [0010](../../wiki/decisions/0010-inventory-seamlessness.md): Inventory subscribes via the event bus.

## Hiring → Assignment (via Recruitment) — UPDATED 2026-05-23

```
Recruitment.HireDecided (applicant cleared and offered)
    ↓
HR.EmployeeCreated (status: hired — may be training, reliever, floating, or directly assignable)
    ↓
Training complete (if applicable) → status update via HR.changeStatus()
    ↓
Recruitment.AssignmentCreated (status: deployed at Client X)
```

Per [0009](../../wiki/decisions/0009-hr-starter-and-recruitment-as-entry-point.md): Recruitment calls `HR.createEmployee()` to push hires into HR-starter, then owns the assignment that puts them at a client. Per [0004](../../wiki/decisions/0004-applicant-pool-legal-classification.md): some hires start paid immediately (relievers/floaters); pure callback-list applicants are not paid until deployed.

## DTR → Payroll

```
Biometric / QR-code / paper DTR ingestion → DTR records
    ↓
DTR period closes → DTR.PeriodClosed event
    ↓
Payroll consumes → calculates → Payroll.RunCompleted
    ↓
Payslips generated
```

⚠ **Commander Group critical:** DTR must split per CLIENT, not per employee globally. Guard transferred mid-period → billing splits across clients on the transfer date.

## Fulfillment SLA tracking (cross-cutting)

Every deployment event must carry a `marketing_request_id` foreign key so the chain is queryable end-to-end:
- **Time to fulfill:** `Marketing.RequestFormSubmitted` → all guards deployed
- **Fill rate:** requested vs delivered by deadline
- **Quality of fulfillment:** did deployed guards meet client requirements?

## Approval gates (Phase-0 primitive supports all of these)

| Action | Likely approver(s) |
|---|---|
| Marketing request → Deployment | Operations Manager |
| New client contract above ₱X | Executive / CEO |
| Reshuffle above N guards | Operations Manager |
| Hiring requisition | HR Manager + Operations |
| Loan above ₱X | Direct Supervisor + HR |
| Salary adjustment | HR Manager + Finance |
| Firearm issuance | Armorer + Operations Supervisor |
| Termination | HR Manager + Legal/Compliance |

Thresholds (₱X, N guards) are open — questionnaire Part N answers them.
