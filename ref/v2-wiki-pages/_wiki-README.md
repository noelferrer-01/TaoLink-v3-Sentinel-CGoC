# TAOLINK Wiki

> The Claude-maintained knowledgebase for TAOLINK. Implements the `llm-wiki.md` pattern, adapted for a software project.

## What this is

A persistent, compounding wiki that grows alongside the project. Unlike scattered audit docs and one-off READMEs, this wiki is **maintained** — when a source document is added or a fact changes, the relevant wiki pages are updated, cross-references are kept in sync, and contradictions are flagged.

**The wiki is written by Claude, maintained by Claude, and read by humans** (developers, the SistemaHub team, eventually clients reading a runbook or manual).

## Layers

There are three layers, per `llm-wiki.md`:

1. **Raw sources** (`wiki/sources/`) — pointers to the immutable source-of-truth documents. The codebase, the audit reports (`AUDIT.md`, `WEBAPP-AUDIT-V4.md`, `TAOLINK-HRIS-CLIENT-AUDIT.md`), database backups, design docs, presentations. Claude reads from these; never modifies them.

2. **The wiki** (`wiki/pages/`) — Claude-generated and -maintained markdown pages. Summaries, feature pages, module deep-dives, runbooks, how-tos. This is the layer that gets read.

3. **The schema** ([AGENTS.md](../AGENTS.md) §7 + this README) — tells Claude how the wiki is structured and what to do when ingesting or maintaining.

## Operations

### Ingest a new source

> User: "ingest into wiki: AUDIT.md"

Claude:
1. Reads the source.
2. Writes (or updates) the relevant page(s) in `pages/`.
3. Cross-links to related pages.
4. Updates `index.md` if new pages were created.
5. Appends an entry to `log.md`.

### Query

User asks a question. Claude reads `index.md`, drills into relevant pages, synthesizes an answer with citations. If the answer is valuable, **file it back as a new wiki page** — explorations should compound, not disappear into chat history.

### Lint

> User: "lint the wiki"

Claude checks for:
- Orphan pages (no inbound links)
- Contradictions between pages
- Stale claims (newer source has superseded them)
- Important concepts mentioned but lacking their own page
- Missing cross-references

## Conventions

- **One topic per page.** If a page covers more than one topic, split it.
- **Cross-link aggressively.** Use `[[page-name]]` or relative markdown links.
- **Cite sources.** Each claim that came from a source doc should reference where (e.g. "per AUDIT.md §C-1").
- **Frontmatter (optional):** YAML at the top with `tags:`, `last_updated:`, `source_count:` if useful for Dataview/Obsidian.
- **Use Obsidian.** This workspace is already an Obsidian vault (`.obsidian/`); the graph view and Dataview plugin are useful for navigation.

## Files

- `index.md` — catalog of pages (read this first)
- `log.md` — append-only chronicle of ingests / queries / lints
- `README.md` — this file
- `sources/` — pointers to raw source documents
- `pages/` — the actual wiki content
