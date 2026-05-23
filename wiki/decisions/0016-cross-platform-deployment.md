# 0016 — Cross-platform deployment (Mac dev + Windows dev + Linux production)

**Status:** RESOLVED 2026-05-24 by Noel.
**Filed:** 2026-05-24
**Touches:** Developer onboarding, build reproducibility, optional CGoC on-prem replica.

## Context

The development environment is heterogeneous:
- **Noel** develops on Mac.
- **CGoC team** uses Windows (no Mac at all). They want to be able to run Sentinel *locally* on their Windows machines AND eventually on a Windows server if they decide to host a local replica.
- **Production** will be Linux (Hostinger KVM4 — see [0015](0015-vps-deployment.md)).

If we don't handle this cleanly upfront, we'll hit "works on my machine" issues across three operating systems. Docker abstracts the OS, but the supporting tooling (line endings, file paths, scripts) doesn't unless we design for it.

## Resolution

**Single source of truth: the Docker images.** All environments run the same images via the same `docker-compose.yml`. The OS differences are absorbed at the Docker layer.

### Cross-platform setup

| Environment | How Docker runs | Notes |
|---|---|---|
| **Mac (Noel)** | Docker Desktop for Mac | Native, fast. |
| **Windows (CGoC dev)** | Docker Desktop for Windows + WSL2 | Requires Windows 10/11 with WSL2 enabled (most modern Windows has this). |
| **Windows Server (CGoC local server, if needed)** | WSL2 + Docker Engine on Windows Server | What enterprise Windows shops typically run. |
| **Linux VPS (production)** | Docker Engine | Native. |

### Cross-platform gotchas we handle upfront

1. **Line endings** — `.gitattributes` enforces LF on all source files. CRLF in scripts breaks Linux containers.
2. **File paths** — code uses forward slashes always, or path libraries (`path.join` in Node, `pathlib` in Python). No hard-coded `\`.
3. **Case sensitivity** — Linux is case-sensitive, Windows/Mac are not. We treat all filenames as case-sensitive (`Foo.ts` ≠ `foo.ts`).
4. **Volume mounts** in Docker Compose use relative paths (`./data:/var/lib/postgresql/data`), not absolute Windows paths.
5. **Shell scripts** — `.sh` files for Linux/Mac; if we need Windows-runnable scripts (unlikely given Docker), provide `.ps1` equivalents.
6. **Environment variables** — load from `.env` files via `docker-compose --env-file`, not from shell-specific syntax.

### CGoC local server scope — decided

Noel: *"lets assume they need us to make the decision for this local server or platform as ill make them have a new server if needed."*

**Decision: if CGoC wants a local server, they get a FRESH Windows Server (NOT integrated with their existing infrastructure).** Reasoning:
- Their existing partial HRIS sits on their current server. We've already locked that Sentinel has no relationship to it ([0003](0003-relationship-to-existing-cg-system.md)) — sharing the server muddles that boundary.
- A fresh server (or even a fresh VM on existing hardware) gives Sentinel its own resources, logs, backups, and security posture.
- Easier rollback and easier blast-radius isolation if something goes wrong.
- "I doubt they want a headache" — Noel.

If CGoC pushes back and insists on the existing server, that's a scope-change conversation — but our recommendation is fresh.

### CGoC local-server-as-production-replica (still scoped)

Two possible local-server scopes:
- **Local dev only:** Docker Desktop on each CGoC developer machine. No server needed yet.
- **Production replica:** Same Docker Compose stack as the VPS, deployed to a Windows Server with WSL2. Adds a second SSH target to the GitHub Actions deploy job. Useful for DR / sovereignty / offline access. Doubles ops burden (two backups, two monitoring targets, sync concerns).

**Current state:** local dev only, since we don't have a production VPS yet ([0015](0015-vps-deployment.md)). The "production replica" decision becomes real if/when CGoC asks for it post-launch.

## Runbooks to write (Slice 0)

- `wiki/runbooks/mac-dev-setup.md`
- `wiki/runbooks/windows-dev-setup.md`
- `wiki/runbooks/windows-server-prod-setup.md` (only if CGoC requests local prod replica)

## Cross-references

- [0008](0008-dev-environment.md) — Docker Compose as the abstraction layer.
- [0015](0015-vps-deployment.md) — production VPS deployment.
- [0003](0003-relationship-to-existing-cg-system.md) — no relationship to CGoC's existing systems (informs the "fresh server" call).
