# Agent Instructions — TAOLINK

> This file is the canonical operating brief for any AI agent working on TAOLINK. `CLAUDE.md` and `GEMINI.md` are symlinks to this file so the same instructions load in any agent environment.

---

## 1. What this project is

**TAOLINK** is a Philippine HRIS + payroll system for SMBs and enterprises (up to ~10,000 employees). It is the next-generation rebrand and upgrade of the **Payroll Central** codebase that currently runs in production at `taolink.sistemahub.com` on the VPS.

- **Product surface:** Payroll engine, Attendance (clock in/out, selfie + GPS), Employee 201 files, Leaves, Loans, Government remittances (SSS, PhilHealth, Pag-IBIG, BIR), ESS portal, 2FA + audit trail.
- **Marketing surface:** `taolink-website/` subfolder — separate Next.js project for the public-facing site.
- **Owner / business:** SistemaHub. Jenefer Ayson, Co-Founder.

**Current state of this workspace:** Local development copy. The VPS keeps running Payroll Central; TAOLINK v2 is being built up locally first, with planned GitHub repo `TAOLINK v2` and eventual VPS migration once parity + upgrades are verified.

**Rename still in progress:** `package.json` still says `"name": "payroll-central"`, the DB backup file is `payroll_central_db_*.sql.gz`, and several docs reference Payroll Central. Rename work is open.

---

## 2. Tech stack (actual, not aspirational)

| Layer | Tech | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, Server Actions) | `src/app/` |
| Language | TypeScript 5 | strict |
| Database | **MySQL** via **Drizzle ORM 0.45** | Local: MAMP on port 8889. Migrations in `src/db/migrations/`. |
| Auth | **Lucia 3** (+ arctic, MySQL adapter) | `src/lib/auth.ts` |
| Background jobs | Custom worker (`src/workers/`) | `npm run worker` / `npm run dev:all` |
| Email | Nodemailer | `src/lib/email.ts` |
| PDF | pdfkit | payslips, BIR forms |
| Testing | Vitest (unit) + Playwright (e2e) | `npm test`, `npm run test:e2e` |
| Styling | Tailwind 4 | brand: Pinoy Teal `#0D9488`, Trust Obsidian `#111827`, Growth Lime `#22C55E`; font Plus Jakarta Sans |
| Process mgmt (VPS) | PM2 (`ecosystem.config.js`) | nginx in `deploy/nginx-taolink.conf` |

Run locally: `npm run dev` (web) or `npm run dev:all` (web + worker).

---

## 3. Folder layout (actual)

```
TaoLink/
├── AGENTS.md / CLAUDE.md / GEMINI.md   # this file (CLAUDE.md & GEMINI.md are symlinks)
├── README.md                            # next.js boilerplate — replace eventually
├── memory/                              # Claude's persistent memory (see §6)
├── wiki/                                # user-facing knowledgebase / runbook (see §7)
├── docs/                                # plan docs, design docs
├── deploy/                              # nginx + deploy scripts (VPS)
├── database/                            # SQL backups
├── e2e/                                 # Playwright tests
├── public/                              # static assets
├── scripts/                             # one-off TS scripts
├── src/
│   ├── app/                             # Next.js routes ((admin), (auth), api/, clock/, ess/)
│   ├── components/
│   ├── db/                              # Drizzle schema + migrations + seeds
│   ├── lib/                             # cross-cutting utilities
│   ├── middleware.ts
│   ├── modules/                         # FEATURE MODULES — see §4
│   │   ├── attendance/
│   │   ├── audit/
│   │   ├── auth/
│   │   ├── compliance/
│   │   ├── dashboard/
│   │   ├── employees/
│   │   ├── leave/
│   │   ├── loans/
│   │   ├── payroll/
│   │   └── settings/
│   └── workers/                         # background job runners
├── taolink-website/                     # separate Next.js project (marketing site)
├── llm-wiki.md                          # spec for the wiki/ pattern (reference, don't run)
├── memory-system-architect.md           # spec for memory/ setup (reference, don't re-run)
├── AUDIT.md, WEBAPP-AUDIT*.md, …        # legacy audit docs — to be indexed by wiki/
├── HR_MANAGER_GUIDE.md, USER_GUIDE.md   # legacy user docs — to be indexed by wiki/
└── .memsearch/                          # local semantic search index over markdown
```

---

## 4. Modular construction (HARD RULES)

Default to modular. Each feature lives under `src/modules/<feature>/`. Break this rule only with a documented reason.

The goal is **fault isolation** — when something breaks, the error must be traceable to one module within seconds, not a mystery cascading across files.

1. **One feature = one module.** If you can't explain the module in one sentence, it's doing too much.
2. **Declare dependencies at the boundary.** Every module's `index.ts` re-exports only the public surface and states at the top what it needs (other modules, env vars, services). Missing dep → fail loudly at load time.
3. **Own your errors.** Wrap external-facing functions in `try/catch`. Log with the module name as prefix. Re-raise with context or return a structured error. Never let a raw library exception leak unannotated.
4. **Public vs private is explicit.** Other modules import only from the module's `index.ts`. Never reach into internals.
5. **No shared mutable state between modules.** Pass data as args or via a documented store (DB, queue, config).
6. **Communication is per-project.** Default is direct calls via entry point. Escalate to registry/events only when behavior is genuinely async or broadcast. Pick once, document, stick with it. TAOLINK currently uses direct calls + the background worker queue for async.

### Module README

Every module should have a `README.md` with exactly four sections:

- **Purpose** — one sentence
- **Public API** — what other modules / routes can call
- **Dependencies** — other modules, env vars, external services
- **Known failure modes** — what breaks it, what the error looks like, how to diagnose

This README compounds over time into the project's debugging index. When something breaks, the first move is to open the module README's "Known failure modes." If the current error isn't listed, add it once diagnosed.

Many existing modules don't have READMEs yet — that's a backlog item, not a blocker. Add them as you touch each module.

---

## 5. Dev-time vs Run-time

Two modes. Know which one you're in before you start.

**Run-time (default):** Operating the existing system — investigating bugs, answering questions, running queries, small fixes. Don't impose ceremony when none is needed. A typo fix or env-var swap stays in run-time.

**Dev-time:** Building a new module, materially extending an existing one, schema changes, new directives or workflows. Use the Superpowers methodology:

1. **`brainstorming`** — pull the real requirement out before any code. Input/output shape, failure modes, simplest version that works.
2. **`writing-plans`** — break into 2–5 min tasks with exact file paths and verification steps. Show the plan before executing.
3. **`test-driven-development`** — every new module gets tests. "It's just a simple script" is how scripts become 400-line monsters.
4. **`subagent-driven-development`** — for multi-file work. Parallel where independent, serial where not.
5. **`verification-before-completion`** — run the tests, run the feature end-to-end in the dev server, show output. "Should work" is not done.
6. **`systematic-debugging`** — when things break. Reproduce, hypothesize, test, fix, verify.

Once code works, switch back to run-time: update the module README's failure modes and the wiki page that covers the feature.

---

## 6. Memory system (Claude's persistent memory)

Architecture: **markdown-first, local, inspectable.** Implemented per `memory-system-architect.md` spec, adapted (we use `.md` not `.mmd`, and we integrate with `.memsearch/` rather than duplicating).

Folder:

```
memory/
├── memory.md          # index — single source of truth for navigation
├── general.md         # cross-domain facts (env, conventions, preferences)
├── domains/           # domain knowledge (one .md per area)
│   ├── product.md
│   ├── architecture.md
│   ├── payroll.md
│   ├── attendance.md
│   ├── auth.md
│   ├── compliance.md
│   └── deployment.md
├── tools/             # tool-specific notes
│   ├── drizzle.md
│   ├── lucia.md
│   ├── nextjs.md
│   ├── mysql.md
│   └── memsearch.md
└── daily/             # one file per day, YYYY-MM-DD.md
```

**Trigger phrases:**

- **"reorganize memory"** → scan `memory/` + `.memsearch/memory/`. Delete empty/trivial files, dedupe, merge related entries, split overgrown files, refresh `memory/memory.md` as the index. Report changes as a checklist.
- **"summarize today's work into memory"** → write a concise note to `memory/daily/YYYY-MM-DD.md`. Promote durable facts into `general.md` or the relevant domain file.
- **"promote recurring items to long-term memory"** → scan recent daily notes for things mentioned 2+ times, promote to long-term, mark stale items for archive.

**Caveat:** `.memsearch/` already exists and indexes the workspace. Don't fight it — let memsearch keep its own `.memsearch/memory/YYYY-MM-DD.md` for chunked semantic search, while `memory/daily/` carries the curated narrative.

---

## 7. Wiki system (user-facing knowledgebase)

Implemented per `llm-wiki.md` pattern, adapted for a software project (sources = codebase + audit docs, not external articles).

Folder:

```
wiki/
├── index.md           # catalog of all wiki pages
├── log.md             # append-only chronicle of ingests/edits
├── README.md          # explains how this wiki is used
├── sources/           # pointers to raw sources (audits, codebase paths, SQL backups)
└── pages/             # Claude-generated/maintained pages
    ├── taolink-overview.md
    ├── payroll-engine.md
    ├── attendance.md
    ├── ess-portal.md
    ├── compliance-bir-sss.md
    ├── deployment-runbook.md
    └── ...
```

**Purpose:** Become the **runbook / manual / guide** the user keeps asking for. Pages are written by Claude, maintained by Claude, read by humans (including non-technical clients).

**Trigger phrases:**

- **"ingest into wiki: <source>"** → read the source, write a summary page, update index, cross-link, append to log.
- **"lint the wiki"** → find orphan pages, contradictions, stale claims, missing cross-references.

The wiki is the **deliverable layer**. Memory is for Claude; wiki is for humans.

---

## 8. Self-annealing loop

Errors are learning opportunities. When something breaks:

1. Fix it
2. Test it
3. Update the module README's "Known failure modes"
4. If it's a recurring class of issue, add a note to the relevant `memory/domains/*.md`
5. If it changes how users should operate the system, update the relevant `wiki/pages/*.md`

System is now stronger.

---

## 9. File hygiene

- **`.env` / `.env.local`** — gitignored. `DATABASE_URL`, `SESSION_SECRET`, SMTP creds, etc.
- **`.tmp/`** — intermediate files (exports, scratch). Always regeneratable.
- **`.next/`, `node_modules/`, `playwright-report/`, `test-results/`, `tsconfig.tsbuildinfo`** — gitignored.
- **Legacy docs in root** (`AUDIT.md`, `WEBAPP-AUDIT-V*.md`, `HR_MANAGER_GUIDE.md`, `PRESENTATION-DECK.*`, `TaoLink-BrandIdentity.html`, `checkpoint.md`, `task.md`, `payroll_system_backlog.md`) → eventually fold into `wiki/sources/` index and trim from root. Don't bulk-delete; index them first, then archive.

---

## 10. When rules conflict

Precedence (highest first):

1. User's explicit instructions in the current conversation
2. Project-level directives (this file, `wiki/pages/*`)
3. Global Soul preferences in `~/.claude/CLAUDE.md` (SistemaHub business identity, modular preference, etc.)
4. Superpowers skill defaults
5. Default model behavior

Example: if a Superpowers skill says "always TDD" but a feature is genuinely a one-off scratch script, the scratch decision wins — document it in `memory/daily/`.

---

## 11. Summary

You are the orchestrator between human intent and a real production payroll system. Read instructions, make decisions, call tools, handle errors, continuously improve the system.

- **CLAUDE.md (this file)** → how to operate
- **memory/** → what Claude remembers
- **wiki/** → what the user reads

Build modular. Fail loudly. Test before claiming done. Self-anneal. Be pragmatic.
