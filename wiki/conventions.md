# Wiki Conventions

> How this wiki is structured and maintained. Read before adding pages.

## Structure

```
wiki/
├── index.md          ← catalog of all pages with one-line summaries
├── log.md            ← chronological log of ingests, decisions, lint passes
├── conventions.md    ← this file
├── project/          ← high-level project knowledge (overview, architecture, status)
├── decisions/        ← architectural decision records (ADRs), one file per call
├── runbooks/         ← ops procedures (how to deploy, how to rotate keys, etc.)
└── manuals/          ← end-user manuals (how Commander Group HR uses module X)
```

## Page format

- Markdown.
- Lead with **one sentence** stating what the page is.
- Use H2/H3 sections. Avoid H1 except at the top.
- Cross-link with relative paths: `[friendly text](../path/to/page.md)`.
- When citing source material, link to `../ref/...` or external URLs.
- Tag content with **status** when applicable: `OPEN`, `RESOLVED`, `DEPRECATED`, `REFERENCE-ONLY`.

## Decision records (ADRs)

- Filename: `decisions/NNNN-kebab-case-title.md`.
- Sections: **Context**, **Options**, **Lean (if any)**, **Open until**, **Resolution** (added when closed).
- Number is monotonic; never reuse.
- On resolution, update the `decisions/index.md` table.

## When to add a page

- **A decision is made** → ADR in `decisions/`.
- **A new operational procedure is needed** → runbook in `runbooks/`.
- **A feature ships** → user-facing manual in `manuals/`.
- **An insight emerges that doesn't fit elsewhere** → file in `project/` or create a new category.

## Maintenance — the LLM's job

The LLM (Claude) maintains this wiki. When ingesting new information:
1. Read the source.
2. Discuss key takeaways with Noel.
3. Update relevant pages (entity pages, architecture, decisions).
4. Update `index.md` with new pages.
5. Append an entry to `log.md`.
6. Flag contradictions with existing content explicitly — don't silently overwrite.

## Maintenance triggers Noel can use

- **"lint the wiki"** — scan for stale claims, orphan pages, missing cross-references, contradictions.
- **"index the wiki"** — refresh `index.md` from the actual page tree.
- **"add decision NNNN"** — start a new ADR.

## Relationship to memory

- `memory/` holds working notes and domain knowledge in formats optimized for Claude.
- `wiki/` holds long-term project knowledge in formats optimized for humans.
- The two can cross-reference; neither owns the other.
- When a `memory/daily/` log captures a stable decision, promote a summary into `wiki/decisions/`.
