# 0015 — VPS deployment (deferred; local-first for now)

**Status:** PARTIALLY RESOLVED 2026-05-24 — specs locked, provisioning deferred. Domain deferred. Local-first until CGoC is ready.
**Filed:** 2026-05-24
**Touches:** Production deployment shape, hosting cost, ops burden.

## Context

CGoC will eventually provision a VPS for Sentinel's production deployment. As of 2026-05-24:
- **No VPS yet.** Development is local-only for now.
- **Domain TBD.** Originally floated `sentinel.commandergrp.com` but Noel flagged this could mess with CGoC's existing DNS setup. A separate domain (or subdomain on a different zone) will be chosen later — possibly a SistemaHub-owned domain (e.g., `sentinel.sistemahub.com`) until CGoC's hosting is ready.

## Resolution (specs locked; provisioning deferred)

### VPS specs

**Hostinger KVM4** (locked by Noel 2026-05-24):
- 4 vCPU
- 16 GB RAM
- 200 GB NVMe disk
- 16 TB bandwidth
- ~$15–25/mo (CGoC's cost)

Noel's call: skip the KVM2 → KVM4 upgrade path and provision KVM4 from day one for headroom. Justified — KVM2 would feel tight by Slice 2–3 (Billing + Recruitment add real load).

### Production stack (when VPS comes online)

```
Internet
   ↓ HTTPS (Let's Encrypt via Caddy)
Caddy (reverse proxy + auto-TLS)
   ↓ HTTP
Docker Compose stack:
   ├── Next.js app (Node 22)
   ├── Worker process (Node 22)
   ├── Postgres 16
   └── (later) Python sidecar for LangGraph
```

### Deployment flow

```
git push to main
   ↓
GitHub Actions:
   - run tests
   - build Docker images
   - push images to GitHub Container Registry (ghcr.io)
   ↓
GitHub Actions SSH to VPS:
   - docker compose pull
   - docker compose up -d (rolling restart)
   - run migrations
   - smoke-test the health endpoint
   - rollback if smoke test fails
```

### Backups

- `pg_dump` to Cloudflare R2 nightly (encrypted at rest via R2's own encryption).
- 7-day rolling daily backups, 4-week rolling weekly, 12-month rolling monthly.
- Runbook: `wiki/runbooks/database-backups.md` (to be written in Slice 0).
- Test restore quarterly (runbook: `wiki/runbooks/restore-from-backup.md`).

### Monitoring

- **Sentry** (free tier) for error events.
- **UptimeRobot** (free tier) for external uptime pings (5-min interval, alerts to Noel's email + SMS if available).
- **Caddy access logs** rotated daily, retained 30 days.
- **Postgres slow-query log** at 1s threshold.

### Domain (deferred)

Not `sentinel.commandergrp.com` — Noel flagged this risks disrupting CGoC's existing DNS. Options to revisit when production is imminent:
- A SistemaHub-owned subdomain (e.g., `sentinel.sistemahub.com`).
- A new dedicated domain (e.g., `sentinel-hris.com`).
- A CGoC-owned subdomain on a separate zone they control.

## Phase A vs Phase B

| Phase | Reality | What we do |
|---|---|---|
| **A (now)** | No VPS, no domain | Local-first Docker Compose. All Slice-0 work runs on Noel's Mac and (eventually) CGoC team's Windows machines. Demos via screenshare or local-network access. |
| **B (when CGoC provisions VPS)** | Hostinger KVM4 provisioned, domain chosen | Add the deployment workflow to GitHub Actions, point Caddy at the domain, do first prod deploy. Should be a 1-day task because everything else is already containerized. |

## Cross-references

- [0008](0008-dev-environment.md) — Docker Compose locally and in prod (same compose file).
- [0014](0014-tool-stack-and-cost-discipline.md) — supporting services (Sentry, R2, UptimeRobot).
- [0016](0016-cross-platform-deployment.md) — Mac + Windows + Linux deployment targets.
