# modules/approvals

## Purpose

Generic approval workflow primitive. Any module that needs human sign-off (payroll run, loan approval, firearm issue, salary change) calls into this — it does not roll its own.

## Public API

Import from `@/modules/approvals`.

- `approvals.request({ kind, payload, approvers, rule?, requestedBy }) → ApprovalRequest`
- `approvals.decide(requestId, approverId, decision, reason?) → ApprovalRequest`
- `approvals.status(requestId) → ApprovalRequest | null`

`rule` is one of `'single' | 'all_of' | 'any_of'`. **Slice 0 only implements `'single'`** — schema slots exist for the others but the engine throws if you try them. That stays so until a slice actually needs multi-approver.

## What gets emitted

Every state change writes to `audit_log` AND publishes on the event bus:

| Trigger | Audit action | Event topic |
|---|---|---|
| `request()` | `approvals.requested` | `approvals.requested` |
| `decide()` | `approvals.decided` | `approvals.decided` |

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** `@/modules/audit`, `@/modules/events`.
- **Tables:** `approval_requests`, `approval_steps`, `approval_decisions`.

## Known failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `at least one approver is required` | Passed `approvers: []` | An approval without an approver is a no-op. Choose at least one. |
| `rule "all_of" not yet supported by the engine` | Tried multi-approver before a slice needed it | Use `'single'`. If a slice genuinely needs multi, build the rule engine in that slice and update this README. |
| `request X is already approved` (or rejected) | Called `decide` twice on the same request | Read `approvals.status` first, or treat the second call as a no-op upstream. |
| `user Y is not an approver on X` | The user isn't in `approval_steps` for that request | Check the `approvers` list passed at request time. |
