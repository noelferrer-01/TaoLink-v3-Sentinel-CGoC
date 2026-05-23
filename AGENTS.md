# Agent Instructions

> **Project:** TaoLink v3 (codename **Sentinel**) — production-grade Philippine HRIS + payroll for **Commander Group of Companies** (security agency, 10,000+ guards, 100+ detachments).
> **Owner:** Noel Ferrer (SistemaHub). Client-doc identity: SistemaHub, signatory Jenefer Ayson — Co-Founder, jen@sistemahub.com.
> **Status:** Pre-Phase-0. The canonical brief is **[`ref/00-RESUME-POINT.md`](ref/00-RESUME-POINT.md)** — a fresh session must read it end-to-end before touching anything.
>
> **Hard gates before any Phase-0 code:**
> 1. Client questionnaire ([`ref/sentinel-docs/sentinel-client-questionnaire.md`](ref/sentinel-docs/sentinel-client-questionnaire.md)) answered by Commander Group department heads.
> 2. Stack call (TypeScript vs Python) locked. Lean is TypeScript.
> 3. Multi-tenancy, DB, and hosting calls also open — see resume point §6.
>
> **v1 is OFF-LIMITS.** PayrollCentral runs live on `taolink.sistemahub.com` and is the demo for Commander Group. Different repo, different concern.
>
> **Knowledge layers in this repo:**
> - **[`ref/`](ref/)** — reference only (v1/v2 history, prior architecture thinking, meeting notes, compliance corpus). Not binding for v3.
> - **[`memory/`](memory/)** — Claude's working memory: lean index ([`memory/memory.md`](memory/memory.md)), domain notes, daily logs. See [`memory/README.md`](memory/README.md). Auto-injected on session start via `.claude/settings.json`.
> - **[`wiki/`](wiki/)** — Long-term project knowledge: manuals, runbooks, decisions, architecture. LLM-maintained, human-readable. See [`wiki/conventions.md`](wiki/conventions.md).
>
> **v3 discipline change (non-negotiable):** read-as-you-build, README-before-code, contract-before-implementation, demo-ability is the done test, no "just dump it in." If a section of code can't be explained in two sentences, it's wrong. Full rules in [`ref/00-RESUME-POINT.md`](ref/00-RESUME-POINT.md) §5.

> This file is mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.

You operate within a 3-layer architecture that separates concerns to maximize reliability. LLMs are probabilistic, whereas most business logic is deterministic and requires consistency. This system fixes that mismatch.

## The 3-Layer Architecture

**Layer 1: Directive (What to do)**
- Basically just SOPs written in Markdown, live in `directives/`
- Define the goals, inputs, modules to call, outputs, and edge cases
- Natural language instructions, like you'd give a mid-level employee

**Layer 2: Orchestration (Decision making)**
- This is you. Your job: intelligent routing.
- Read directives, call execution tools in the right order, handle errors, ask for clarification, update directives with learnings
- You're the glue between intent and execution. E.g you don't try scraping websites yourself—you read `directives/scrape_website.md` and come up with inputs/outputs and then call the `scrape_site` module

**Layer 3: Execution (Doing the work)**
- Deterministic code organized as modules in `modules/` (Python or TypeScript, depending on the project)
- Environment variables, api tokens, etc are stored in `.env`
- Handle API calls, data processing, file operations, database interactions
- Reliable, testable, fast. Use code instead of manual work. Commented well.

**Why this works:** if you do everything yourself, errors compound. 90% accuracy per step = 59% success over 5 steps. The solution is push complexity into deterministic code. That way you just focus on decision-making.

## Operating Principles

**1. Check for tools first**
Before writing new code, check `modules/` per your directive. Only create new modules if none exist that fit the need.

**2. Self-anneal when things break**
- Read error message and stack trace
- Fix the module and test it again (unless it uses paid tokens/credits/etc—in which case you check w user first)
- Update the directive with what you learned (API limits, timing, edge cases)
- Example: you hit an API rate limit → you then look into API → find a batch endpoint that would fix → rewrite the module to accommodate → test → update directive.

**3. Update directives as you learn**
Directives are living documents. When you discover API constraints, better approaches, common errors, or timing expectations—update the directive. But don't create or overwrite directives without asking unless explicitly told to. Directives are your instruction set and must be preserved (and improved upon over time, not extemporaneously used and then discarded).

## Dev-time vs Run-time

Two modes. Know which one you're in before you start.

**Run-time (default):** Executing a directive. Read `directives/X.md`, call the appropriate module in `modules/`, handle errors, update the directive. The 3-layer flow above applies.

**Dev-time:** Building a new module, writing a new directive, or making non-trivial changes to either. Different methodology applies (below).

A trivial fix — typo, obvious missing import, swapping a hardcoded value for an env var — stays in run-time. If you'd need to think about the change for more than a minute, it's dev-time.

## Dev-time methodology

When building or materially extending modules or directives, use the Superpowers flow. These skills are available — invoke them, don't paraphrase them:

1. **`brainstorming`** — before any code. Pull the real requirement out through questions. Input shape, output shape, failure modes, simplest version that works. No jumping to code.
2. **`writing-plans`** — break the work into 2–5 minute tasks with exact file paths and verification steps. Show me the plan before you execute.
3. **`test-driven-development`** — red/green/refactor. Every new module gets tests. "It's just a simple script" is how scripts grow into unmaintainable 400-line monsters.
4. **`subagent-driven-development`** — for multi-file work. Parallel where tasks are independent, serial where they aren't.
5. **`verification-before-completion`** — run the tests, run the module end-to-end, show the output. "Should work" is not done.
6. **`systematic-debugging`** — when things break during dev. Reproduce, hypothesize, test, fix, verify. Don't rationalize.

Once the code works, **switch back to run-time:** write or update the directive that calls the new module. The dev-time artifact (the module) feeds the run-time artifact (the directive). That handoff is the point.

## When rules conflict

If a Superpowers skill conflicts with anything in this file or a directive, **this file and the directives win.** User instructions > skill defaults. Superpowers docs confirm this explicitly.

Example: skill says "always TDD," directive says "one-off data pull, skip tests" — follow the directive. If this file is silent on the point, follow the skill.

## Why this split exists

Run-time is about reliability of execution; dev-time is about reliability of construction. Mixing them is how you get either (a) undertested modules that fail in production, or (b) overengineered directives that take an hour to run a 30-second task. Keep the modes separate.

## Modular construction

**Default to modular. Break this rule only with a documented reason.**

The goal isn't theoretical Lego-brick purity — it's **fault isolation**. When something breaks, the error must be traceable to one module within seconds, not a mystery that cascades across files. When a module is added or removed, the rest of the system should fail loudly and immediately, not silently produce wrong results three hours later. The code should *expect* to be pulled apart and reassembled.

### Six rules

1. **One feature = one module.** Each feature lives in its own folder with its own files. If you can't explain what a module does in one sentence, it's doing too much.

2. **Declare dependencies at the boundary.** Every module states what it needs (other modules, env vars, config, external services) at the top of its entry file. If a dependency is missing at load time, fail immediately with a clear message naming the missing thing. No lazy failures six calls deep.

3. **Own your errors.** Every module wraps its external-facing functions (Python: `try/except`; JS/TS: `try/catch`). Catch, log with the module name as a prefix, then either re-raise with context or return a structured error. Never let a raw library exception leak out of a module unannotated.

4. **Public vs private is explicit.** Each module exposes one entry point. Python: `__init__.py` with an explicit `__all__`. JS/TS: an `index.ts` that re-exports only the public surface. Everything else is private. Other modules may only import from the entry point — never reach into internals.

5. **No shared mutable state between modules.** If two modules need the same data, pass it as arguments or go through a documented store (config object, database, queue). Never import a variable from another module and mutate it.

6. **Communication method is a per-project decision.** Direct calls through the entry point are the default (simplest). Escalate to a registry pattern when 3+ modules need to discover each other. Escalate to events/hooks only when behavior is genuinely async or broadcast. Pick once per project, document the choice, stick with it.

### Folder shape

```
project-root/
├── AGENTS.md                  # this file
├── CLAUDE.md                  # mirror of AGENTS.md
├── GEMINI.md                  # mirror of AGENTS.md
├── .env                       # secrets, gitignored
├── .env.example               # template showing required env vars
├── .tmp/                      # intermediate files, gitignored
├── directives/                # SOPs in Markdown (Layer 1)
├── core/                      # the boilerplate / base
│   ├── __init__.py            # or index.ts
│   ├── loader.{py,ts}         # loads modules, validates dependencies (add when needed)
│   └── contracts.{py,ts}      # shared interfaces/types (add when needed)
└── modules/                   # feature modules (Layer 3)
    ├── feature_a/
    │   ├── __init__.py        # or index.ts — public surface only
    │   ├── handler.{py,ts}    # private
    │   ├── tests/
    │   └── README.md
    └── feature_b/
        └── ...
```

### The module README — the thing that makes errors fast

Every module has its own `README.md` with exactly these sections:

- **Purpose** — one sentence
- **Public API** — what other modules can call
- **Dependencies** — other modules, env vars, external services
- **Known failure modes** — what breaks it, what the error looks like, how to diagnose

This is not optional. The module README is the single most important artifact for "fix errors fast." When something breaks, the first move is to open the module's README and check Known failure modes. If the current error isn't listed, add it once diagnosed. The READMEs compound over time into a debugging index.

### When to break the rule

Default is modular. Exceptions are allowed but must be written down:

- One-off scripts in `.tmp/` or `scratch/` — no ceremony needed
- Throwaway experiments — fine, but don't promote to `modules/` without modularizing first
- Genuine performance-critical tight coupling — document why in the module README

If you find yourself about to violate a rule, stop and document why. The documentation *is* the discipline.

### How this connects to dev-time methodology

When `brainstorming` a new feature, the first question is "what module does this live in, or do we need a new one?" When `writing-plans`, every task operates within one module's folder unless explicitly cross-cutting. Tests live inside the module they cover. When something breaks, `systematic-debugging` starts with "which module's error handler caught this, and is the failure mode in that module's README?"

## Self-annealing loop

Errors are learning opportunities. When something breaks:
1. Fix it
2. Update the module
3. Test it, make sure it works
4. Update directive to include new flow
5. **Update the module README's Known failure modes section** with the error signature and the fix
6. System is now stronger

Note: material fixes to a broken module cross the line into dev-time. Use the dev-time methodology above. A quick typo fix stays run-time.

## File Organization

**Deliverables vs Intermediates:**
- **Deliverables**: Google Sheets, Google Slides, or other cloud-based outputs that the user can access
- **Intermediates**: Temporary files needed during processing

**Directory structure:**
- `.tmp/` - All intermediate files (dossiers, scraped data, temp exports). Never commit, always regenerated.
- `core/` - The boilerplate/base. Loader, shared contracts/types. Add files here when the project needs them, not before.
- `modules/` - Feature modules. Each is self-contained with its own README and tests. This is where all deterministic execution code lives.
- `directives/` - SOPs in Markdown (the instruction set)
- `.env` - Environment variables and API keys. Always gitignored.
- `.env.example` - Template showing which env vars are required. Safe to commit.
- Credential files (e.g. `credentials.json`, `token.json`) - Add as needed when the project uses OAuth or similar. Always gitignored.

**Key principle:** Local files are only for processing. Deliverables live in cloud services (Google Sheets, Slides, etc.) where the user can access them. Everything in `.tmp/` can be deleted and regenerated.

## Summary

You sit between human intent (directives) and deterministic execution (modules). Read instructions, make decisions, call tools, handle errors, continuously improve the system.

Two modes: **run-time** (executing directives) is your default. **Dev-time** (building or materially changing modules or directives) switches you into the Superpowers methodology. User instructions always win over skill defaults.

Build modular by default. Each feature is a self-contained module with its own entry point, dependencies declared up front, errors caught and labeled at the boundary, and a README that grows into a debugging index. The goal is fault isolation — when something breaks, you know which module within seconds.

Be pragmatic. Be reliable. Self-anneal.
