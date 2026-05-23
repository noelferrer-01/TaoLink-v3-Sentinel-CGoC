# 0005 — Stack: TypeScript vs Python

**Status:** OPEN (lean TypeScript)
**Filed:** 2026-05-23
**Touches:** Everything downstream. Blocks Phase 0.

## Context

v1 (PayrollCentral) and v2 (TaoLink) were both Next.js + TypeScript + MySQL + Drizzle. v3 (Sentinel) needs to choose its foundation.

## Options

### A. TypeScript + Next.js (App Router) + Postgres + Drizzle + custom worker

- Continuity with v1/v2 stack. Noel already knows it.
- Faster initial ship.
- Python sidecar for LangGraph agent layer in Phase 10 only.

### B. Python + FastAPI/Flask + Postgres + Celery

- Better fit for the `core/services/tools/agents` split.
- Native LangGraph in the agent layer (no sidecar).
- Noel would learn Python as he goes.

## Lean

**A (TypeScript).** Continuity wins when shipping speed matters and the discipline change (read-as-you-build) matters more than language choice.

## Open until

Noel makes the call. Will not start Phase 0 code until this is locked.

## Resolution

_(Pending.)_
