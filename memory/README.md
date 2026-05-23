# Memory System — How to Use

This memory tree is Claude's working memory for the Sentinel project. It is **separate from** the wiki (`../wiki/`) and the reference material (`../ref/`).

## What goes where

| Layer | Purpose | Who reads |
|---|---|---|
| `memory/` (this tree) | Claude's working memory. Index + domain knowledge + daily logs. Indexes link out; bodies live in domain/tool/daily files. | Claude, primarily |
| `wiki/` | Long-term human-readable project knowledge. Manuals, runbooks, decisions, architecture. Cross-linked, LLM-maintained, Obsidian-style. | Claude + Noel + future team |
| `ref/` | Immutable reference material from v1/v2 history. Source of truth for prior thinking; not binding for v3 decisions. | Read-only input |

## File layout

```
memory/
├── memory.md              ← lean index (auto-injected by session-start hook)
├── general.md             ← cross-cutting project facts
├── README.md              ← this file
├── domains/               ← topical knowledge, one file per area
│   ├── architecture.md
│   ├── commander-group.md
│   ├── compliance.md
│   └── workflows.md
├── tools/                 ← per-tool notes (e.g. slack.md, github.md) — empty for now
└── daily/                 ← chronological logs, one file per day (YYYY-MM-DD.md)
```

## Conventions

- **Keep files under ~200 lines.** If a file grows past that, split into smaller topical files in `domains/`.
- **`memory.md` is an index, not a dumping ground.** New content goes in a domain file; the index links to it.
- **Use plain markdown.** No frontmatter required, no binary formats.
- **Daily logs are append-only.** Add to today's `daily/YYYY-MM-DD.md`. Promote stable facts to a domain file when they crystallize.
- **Cross-link liberally** — `[friendly text](relative/path.md)`.

## Trigger phrases (per `../memory-system-architect.md`)

- **"reorganize memory"** — scan all files, dedupe, merge related entries, split over-broad files, refresh the index. Report changes.
- **"summarize today's work into memory"** — write today's `daily/` entry; promote durable facts to `general.md` or `domains/`.

## Resume points (`/getres` and `/postres`)

- **Per-session resume point** (`/getres` writes, `/postres` reads): `memory/resume.md`. Created on demand; not present at scaffold time.
- **Canonical project brief**: `../ref/00-RESUME-POINT.md`. Always read this first in a fresh session. Different artifact, different purpose.

## Session-start hook

`.claude/settings.json` runs `.claude/scripts/inject_memory_index.sh` on session start, which injects `memory/memory.md` as additional context. You shouldn't need to manually re-read the index; just follow links into domain files.
