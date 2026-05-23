# 0005 — Stack: TypeScript vs Python

**Status:** RESOLVED 2026-05-24 — **TypeScript + Next.js + Drizzle + Postgres + custom worker.** Python sidecar only when the agents/ layer (last slice) genuinely needs LangGraph.
**Filed:** 2026-05-23
**Touches:** Everything downstream.

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

**TypeScript stack, locked 2026-05-24 by Claude (per delegation framework).**

- **Runtime:** Node 22 LTS (long-term support, matches GitHub Actions defaults).
- **Framework:** Next.js 15+ App Router (server actions for mutations, React server components for data fetching). Same family as v1/v2 so Noel can read it.
- **Type checker:** TypeScript 5+ strict mode.
- **ORM / migrations:** Drizzle ORM (lightweight, SQL-first, plays well with Postgres, same as v1/v2).
- **DB:** Postgres 16 (see [0006](0006-database.md)).
- **Worker / queue:** start with PostgreSQL-backed job queue (no Redis upfront). Escalate to BullMQ+Redis only when load demands it. Pattern: write jobs to a `bg_jobs` table, single worker process polls + claims with `FOR UPDATE SKIP LOCKED`. This is what v2 used and it scales surprisingly far.
- **Auth:** hand-rolled session auth (cookies, server-side sessions in Postgres). No Lucia (deprecated 2025), no NextAuth (too opinionated for our RBAC). See Phase 0 / Slice 0 implementation.
- **Validation:** Zod 3+ for runtime input validation at HTTP boundaries.
- **Testing:** Vitest (faster than Jest, native ESM).
- **AI / LangGraph:** Python sidecar service when needed (last vertical slice). The TS app calls it over HTTP/gRPC. No need for TS LangGraph parity.

**Why TypeScript over Python:**
1. Continuity with v1/v2 — Noel knows the patterns.
2. Faster initial ship — no learning curve for the foundation.
3. Next.js gives us auth UI, server actions, file uploads, and Streaming out of the box.
4. Python sidecar for agents is well-trodden territory (FastAPI + LangGraph in a separate container).

**Cost:** $0 — all open-source.
