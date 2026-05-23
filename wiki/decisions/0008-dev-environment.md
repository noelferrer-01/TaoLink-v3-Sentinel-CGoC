# 0008 — Dev environment: Docker vs native

**Status:** OPEN (lean Docker Compose)
**Filed:** 2026-05-23
**Touches:** Local development experience, onboarding, CI/CD reproducibility.

## Context

Raised by Noel on 2026-05-23: "I heard it's better to use Docker than MAMP? Not sure if that's relevant or something."

Quick framing:
- **MAMP** (and XAMPP/WAMP) are legacy LAMP-stack bundles for PHP + MySQL + Apache. Useful only if the stack is PHP-based.
- **Docker / Docker Compose** is the modern default for reproducible local development across any stack (Node, Python, Postgres, Redis, etc.).
- Sentinel will not be PHP. MAMP is not relevant.

## Options

### A. Docker Compose for local dev

- One `docker-compose.yml` runs Postgres + Redis (+ Sentinel app + worker).
- Same containers run in CI; close-to-prod-parity.
- New contributors clone repo + `docker compose up` and they're running.
- **Pro:** Reproducible. No "works on my machine." Easy CI.
- **Con:** Adds Docker as a developer prerequisite. Slight overhead on first-time setup.

### B. Native installs (Postgres / Redis via Homebrew, Node/Python via mise/asdf)

- Lighter touch, faster startup once installed.
- Each contributor manages their own services.
- **Pro:** Lightest setup overhead per session.
- **Con:** "Works on my machine" risk. CI environment diverges from local.

### C. Hybrid — Docker for services, native for app

- Run Postgres / Redis in Docker; run the app/worker natively.
- **Pro:** Fast hot-reload locally, isolated services.
- **Con:** Two systems to manage.

## Lean

**A (Docker Compose).** Standard for any modern non-trivial backend. Locks in CI/prod parity from day one. The 10-minute overhead per developer for first-time Docker setup is dwarfed by the time saved on debugging environment drift across the project's lifetime.

## Open until

Noel makes the call (typically follows the stack call — [0005](0005-stack.md)).

## Resolution

_(Pending.)_
