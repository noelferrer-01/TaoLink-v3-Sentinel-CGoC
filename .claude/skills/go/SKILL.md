---
name: go
description: Sentinel ship-it workflow for finishing a piece of work. Use when the user types /go, says "ship it", "let's go", "finish this up", "wrap it up", or otherwise signals that a chunk of work is done and they want it tested, cleaned, and put up as a PR. Runs five phases — end-to-end test, /simplify, conditional security-review, PR + code-review, conditional housekeeping (memory / slice-contract / module README) — in order, without asking for confirmation between phases. Extras only fire when their trigger matches the diff. Prefer this over manually running tests + simplify + PR commands separately.
---

# /go — Sentinel: Test, Simplify, Ship (with conditional extras)

You're being invoked because the user has finished a chunk of work and wants it shipped. Run these phases **in order, without pausing between them**. The user does not want to be asked "ready for phase 2?" — just go.

If a phase fails, stop and report. Do not skip ahead.

This is the **Sentinel-local** variant of `/go`. It extends the global lean flow (test + simplify + PR + code-review) with conditional Sentinel-specific steps. Extras only fire when their trigger matches the diff — lean path stays lean for typos, doc tweaks, simple refactors.

---

## Pre-flight — Trigger detection (do this first, silently)

Before Phase 1, compute the diff and figure out which optional extras will fire. This is bookkeeping — don't narrate it, just record the flags for later phases.

```bash
git status
git diff --stat
git diff --name-only origin/$(git symbolic-ref --short HEAD 2>/dev/null || echo main)..HEAD 2>/dev/null || git diff --name-only HEAD~1
git log --oneline origin/$(git symbolic-ref --short HEAD 2>/dev/null || echo main)..HEAD 2>/dev/null || git log --oneline -10
```

Evaluate these triggers against the changed file list:

| Flag | Trigger condition |
|---|---|
| `SECURITY_REVIEW` | Any changed path matches `modules/auth/**`, `modules/payroll/**`, `modules/compliance*/**`, `.env*`, or any file name/diff content contains `secret`, `token`, `password`, `credential` |
| `MEMORY_PROMPT` | Diff fixes a previously-failing test, OR a module README's "Known failure modes" section was edited this session, OR the user corrected your approach mid-session, OR you discovered a non-obvious convention worth saving |
| `SLICE_CONTRACT_SYNC` | An implementation file under `modules/**` changed but no corresponding `wiki/slices/*-*.md` was touched in the same diff, AND the branch or recent commits reference a slice (e.g. `slice-N-*` tag, commit subject contains `slice N`) |
| `README_BUMP` | A `modules/*/` source file gained a new `try/catch` branch or a new user-facing error string, but the module's `README.md` wasn't touched |

Announce the checklist once at the top so the user can strike items:

```
/go checklist for this run:
  [✓] Phase 1 — test
  [✓] Phase 2 — simplify
  [<✓ or skip>] Phase 2.5 — security-review (SECURITY_REVIEW trigger: <yes/no>)
  [✓] Phase 3 — commit + push + PR + code-review
  [<✓ or skip>] Phase 4 — Sentinel housekeeping (MEMORY_PROMPT: <y/n>, SLICE_CONTRACT_SYNC: <y/n>, README_BUMP: <y/n>)
Proceeding unless you say otherwise.
```

Then start Phase 1. Don't wait for confirmation — auto mode means proceed.

---

## Phase 1 — End-to-end test the changes

**Goal:** verify the work actually works, beyond what type-checks and unit tests prove.

Pick the right test method based on what changed. **Do not just run the type-checker and call it tested** — type-checks verify code correctness, not feature correctness.

| What changed | How to test |
|---|---|
| Backend logic, scripts, CLI, data transforms | **Bash** — run the script, hit the endpoint with `curl`, run the relevant test suite, check output is what you expect |
| Web UI, webapp pages, components | **Browser** via `mcp__plugin_playwright_playwright__*` — navigate to the page, click through the golden path, screenshot, check console for errors |
| Desktop apps, native features | **Computer use** — drive the actual app and verify behavior |
| Database/migrations | **Bash** — run migration, verify schema, run a query that exercises the change |
| Mixed changes | Test each surface separately. Don't skip the boring one. |

Test the **golden path** plus at least one **edge case** (empty state, error state, or boundary condition). For UI, monitor for regressions in adjacent features.

If you cannot test something (no dev server, no test data, environment unavailable), **say so explicitly** rather than skipping.

Capture evidence: command output, screenshot path, or a one-line note of what you verified. This goes into the PR body later.

If a test fails: fix it, retest, then continue. Don't proceed with broken work.

---

## Phase 2 — Run /simplify

Invoke the `simplify` skill via the Skill tool:

```
Skill(skill="simplify")
```

Let it do its thing. After it returns, `git status` / `git diff` to see what it changed. If simplify touched logic, re-run the affected test from Phase 1; skip if it only touched cosmetics.

If simplify made non-trivial changes, briefly note them — they'll show up in the PR diff.

---

## Phase 2.5 — Security review (CONDITIONAL — only if `SECURITY_REVIEW` flag set)

If the pre-flight set `SECURITY_REVIEW`, run the security-review skill before opening the PR:

```
Skill(skill="security-review")
```

This catches credential exposure, injection vectors, auth bypass, unsafe SQL, secret leakage. For payroll/compliance changes it also catches PII handling issues.

If findings are critical (exposed secrets, auth bypass, SQLi), **stop and report** — don't push secrets into a PR. The user decides whether to fix-then-ship or ship-then-fix-in-followup.

If `SECURITY_REVIEW` was not set, skip silently.

---

## Phase 3 — Commit, push, PR, code-review

Four sub-steps, in order. Don't pause between them.

### 3a. Commit
Stage and commit anything still uncommitted from Phase 1 fixes, Phase 2 simplify, or Phase 2.5 security fixes. Use focused commits — separate "fix from testing" from "simplify pass" from "security fix" if multiple happened. Follow the repo's existing commit-message style (`git log --oneline -10`).

### 3b. Push
Push to remote (`-u` if needed). Reminder: this repo is on the `noelferrer-01` GitHub account — if `gh` push auth fails, run `gh auth switch -u noelferrer-01`, push, then switch back to `noelferrer`. (See user memory `reference_github_auth.md`.)

### 3c. PR
Create with `gh pr create`. PR body must include:
- **Summary** — 1–3 bullets of what + why
- **Test plan** — what you actually verified in Phase 1 (with evidence: command snippet, screenshot path, or "verified by clicking X → Y → Z"). A record of what passed, not a TODO.
- **Simplify pass** — one line on what /simplify changed, or "no changes"
- **Security review** — only if Phase 2.5 ran: one line on result

Title under 70 chars. Match repo's PR style (`gh pr list --state merged --limit 5` if unsure). Capture the PR URL.

### 3d. Code-review
Invoke the code-review skill on the PR you just opened:

```
Skill(skill="code-review:code-review")
```

Pass it the PR number/URL. Let it post comments. After it returns, note in the end-of-turn report whether it flagged anything substantive or was a clean pass.

Do **not** act on review feedback automatically — the user decides.

---

## Phase 4 — Sentinel housekeeping (CONDITIONAL — only if any flag set)

If none of `MEMORY_PROMPT`, `SLICE_CONTRACT_SYNC`, `README_BUMP` are set, skip this phase entirely. Otherwise run the relevant sub-steps:

### 4a. Memory prompt (if `MEMORY_PROMPT`)
Ask the user one focused question — don't enumerate every possible memory:

> "From this work — anything worth saving as feedback or project memory? I'm thinking [specific candidate based on what happened, e.g. 'the rule that X always needs Y'] but you call it."

If they say yes, write to `~/.claude/projects/-Volumes-1TB-Antigravity-Workflows-Taolink-v3---Sentinel/memory/` per the auto-memory format (`Why:` + `How to apply:` lines for feedback/project types). Update `MEMORY.md` index.

### 4b. Slice contract sync (if `SLICE_CONTRACT_SYNC`)
Implementation diverged from the slice contract. Ask:

> "Implementation diverged from `wiki/slices/<slice>.md` (specifically: <one-line summary of divergence>). Want me to update the contract to match, or is the divergence a known deviation I should just note in the slice's daily log?"

Don't silently rewrite the contract — slice contracts are agreements, not scratch pads.

### 4c. Module README bump (if `README_BUMP`)
A module gained a new failure path but its README didn't get updated. Per CLAUDE.md's "self-annealing loop" rule, the README's **Known failure modes** section should compound over time. Either:

- Update the module's README directly with the error signature and the fix (preferred if the failure is well-defined), OR
- Ask the user to one-line the new failure mode if you're not sure of the wording.

Do this for each module that triggered the flag.

---

## Guardrails

- **Don't push to main directly.** If current branch is `main` or `master`, stop and ask the user which branch to use.
- **Don't `--force` push.** If push is rejected, investigate first.
- **Don't skip hooks.** If pre-commit fails, fix the issue and create a new commit. Never `--no-verify`.
- **Don't merge the PR.** Stop at "PR created and URL returned." Merging is the user's call.
- **If there's nothing to ship** (clean tree, branch identical to main), say so and stop — no empty PRs.
- **GitHub auth.** Repo is on `noelferrer-01`. If you switched accounts to push, switch back to `noelferrer` after.

## Reporting

End-of-turn: 2–3 lines max.
- Line 1: what was tested + what simplify did
- Line 2: PR URL + whether code-review was clean or flagged
- Line 3 (only if Phase 2.5 or Phase 4 ran): security-review result + housekeeping summary

That's it.
