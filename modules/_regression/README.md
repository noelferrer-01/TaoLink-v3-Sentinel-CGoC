# `_regression` — cross-slice regression gates

## Purpose

Per [ADR 0013](../../wiki/decisions/0013-vertical-slices-over-horizontal-phases.md) discipline rule #1: each new slice cannot break the primitives of the slices below it. This module hosts the regression suites that prove that contract, **after** all slice modules have loaded.

The underscore prefix marks this as not a feature module — nothing imports from it, it has no public API, it's test-only infrastructure.

## Suites

| Suite | Proves | Added in |
|---|---|---|
| `tests/slice0.test.ts` | Slice 0 primitives (auth, audit append-only, approvals, events pub/sub) still work end-to-end after Slice 1's HR + Clients + Assignments + DTR + Payroll + Compliance-exports modules are loaded | Slice 1 Phase 9.2 |

When a new slice ships, add a `slice<N>.test.ts` suite here that re-validates the contracts of every slice **below** it.

## Why a dedicated regression suite instead of relying on per-module tests

The per-module Slice 0 tests (`modules/auth/auth.test.ts` etc.) already run on every `pnpm test`. The regression suite is not redundant — it's the single signal a future-slice developer can read to know "yes, the primitives still hold under the current module graph." Per-module tests verify each primitive in isolation; the regression suite verifies them **after the full Slice-1 import graph is loaded into the process**, which is the only place state bleed, subscriber-registry pollution, or schema-migration conflicts surface.

## Dependencies

- All modules from every slice it gates. Importing them at the top of each suite is intentional — that's what proves "loaded together, primitives still work."
- `vitest`, `@/core/db` (for `closeDb`), `drizzle-orm`.

## Known failure modes

| Symptom | Likely cause |
|---|---|
| `slice0.test.ts` fails on auth but `modules/auth/auth.test.ts` passes | A Slice 1+ module is importing and mutating shared auth state at module-load time (e.g. monkey-patching `auth.login`). |
| `slice0.test.ts` fails on events delivery (subscribers receive nothing) | A Slice 1+ module called `_resetEventsForTests()` outside a `beforeEach` (or subscribed at import time and the registry isn't being reset between tests). |
| `slice0.test.ts` fails on audit append-only with a fresh error | The audit append-only trigger was dropped or replaced by a later migration. |
