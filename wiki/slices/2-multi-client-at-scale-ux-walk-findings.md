# Slice 2 — UX walk findings (TBD)

**Source:** Noel walks the Slice 2 demo end-to-end against [`directives/slice-2-bootstrap.md`](../../directives/slice-2-bootstrap.md) on a freshly seeded DB (`pnpm db:seed:slice2-demo`). Findings collected live during the walk.

**Status:** scaffold — Noel has not yet run the walk. This file gets filled in during/after the walk, then committed alongside any genuine Slice-2 bug fixes (deferred polish goes to the Slice 3 backlog per [`2-multi-client-at-scale-plan.md`](2-multi-client-at-scale-plan.md) §10.5 Step 3).

## How to use this file during the walk

Open this file in the editor as you walk the 14 steps. For each thing that surprises you, slows you down, or feels off, paste a row into the right section:

- **Fixed during the walk (Slice 2 bugs)** — genuine Slice 2 bugs that block the demo. Fix them in-session; record what was fixed.
- **Slice-3 polish backlog** — everything else. UX gripes, missing affordances, copy nits, future feature ideas. Do NOT fix these during the walk — they're scope creep on a slice that's otherwise done.

When the walk completes:
1. Save this file.
2. Commit the Slice-2 bug fixes (if any) alongside this findings doc.
3. Confirm criteria #11 (timing ≤30 min) + #15 (no coaching needed) in [`2-multi-client-at-scale-done-sweep.md`](2-multi-client-at-scale-done-sweep.md) flip from ⚠ to ✓.
4. Cut tag `slice-2-done` and push.

---

## Walk metadata (fill in as you go)

- **Date walked:**
- **Walked by:**
- **Starting DB state:** (fresh `docker compose down -v` / post-seed / other)
- **Wall-clock for Steps 1–14:**          minutes (target: ≤ 30 min — criterion #11)
- **Needed coaching at any step?** (Y/N — criterion #15)
- **Outcome:** ☐ Pass · ☐ Pass with fixes · ☐ Blocked at Step __

---

## Fixed during the walk (Slice 2 bugs)

| # | Bug | Where | Fix |
|---|---|---|---|
| **B1** | _(none yet)_ | | |

---

## Slice-3 polish backlog (everything else)

### A. Sidebar & navigation
- _(none yet)_

### B. Tables — interactions & affordances
- _(none yet)_

### C. Search & forms
- _(none yet)_

### D. Master-data CRUD gaps
- _(none yet)_

### E. Detachment / contract modeling
- _(none yet)_

### F. Payroll calendar
- _(none yet)_

### G. Compliance / regulator integration
- _(none yet)_

### H. Government exports — at-scale workflows
- _(none yet)_

### I. Employee self-service / mobile
- _(none yet)_

### J. UI design process (meta)
- _(none yet)_

---

## After the walk

- Update [`wiki/slices/2-multi-client-at-scale-done-sweep.md`](2-multi-client-at-scale-done-sweep.md) — flip #11 and #15 to ✓ (or note the polish pass that's needed first).
- Anything in the polish backlog above feeds either the **Slice-2 Tier-2 polish backlog** todo (small wins for the next dev cycle) or **Slice 3 planning** (real scope decisions).
