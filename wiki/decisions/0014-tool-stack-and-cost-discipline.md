# 0014 — Tool stack & cost discipline (free-tier-first)

**Status:** RESOLVED 2026-05-24 by Noel.
**Filed:** 2026-05-24
**Touches:** Every operational surface — CI, monitoring, email, storage, AI, deployment.

## Context

Noel asked Claude to default to free tools whenever possible, only escalating to paid tier when genuinely needed. The picks below were walked through with Noel 2026-05-24 and approved.

## The picks

### Free-tier (all ship from Slice 0)

| Concern | Pick | Tier | Notes |
|---|---|---|---|
| Source control | **GitHub** | Free (private repos) | Repo: `noelferrer-01/TaoLink-v3-Sentinel-CGoC`. |
| CI/CD | **GitHub Actions** | Free (2,000 min/mo) | Sufficient for our build/test cadence. |
| Error monitoring | **Sentry** | Free (5,000 errors/mo) | v2 already used it; Noel knows the dashboard. |
| Transactional email | **Resend** | Free (3,000 emails/mo, 100/day) | Modern API; payslip notifications, password resets. |
| File / blob storage | **Cloudflare R2** | Free (10 GB) | S3-compatible. App stays stateless. For selfies, IDs, signed docs. |
| Reverse proxy + HTTPS | **Caddy** | Free, OSS | Auto-TLS via Let's Encrypt. Simpler than nginx. |
| Container runtime | **Docker** + **Docker Compose** | Free, OSS | Locked in [0008](0008-dev-environment.md). |
| Logging (early) | **Caddy → stdout → Docker logs → file** | Free | Upgrade to Better Stack free tier if we outgrow. |
| Backups | **`pg_dump` → R2 nightly** | Free (within R2 free tier) | Self-managed cron. Runbook to follow. |
| Uptime monitoring | **UptimeRobot** | Free (50 monitors) | External pings, alerts. |
| Domain registrar | (TBD) | (TBD) | Deferred per [0015](0015-vps-deployment.md) — no production domain yet. |

### Paid (only when Slice 7 ships)

| Concern | Pick | Tier | Why paid |
|---|---|---|---|
| **AI / LLM API** | **OpenRouter** (abstraction layer) | Pay-per-token, no markup | One API, 100+ models. We code against OpenRouter; pick the actual model at Slice 7 decision time. Strong likelihood = DeepSeek via US/EU host (Together AI / Fireworks AI) for cost + privacy. Anthropic Claude as quality fallback. |

**Expected Slice 7 cost:** ~$10–50/month at low volume. Scales with usage. Free models (Llama 3.x via OpenRouter) are an option but quality may not match HR-copilot bar.

## On the LLM choice — honest framing

Noel pushed back on Anthropic-by-default; the pushback was correct. Anthropic-direct is ~10x the cost of DeepSeek for similar quality on structured tool-use queries (which is most of what an HR copilot does). The right answer is **not** to lock a specific model now; it's to lock an **abstraction layer** (OpenRouter) and defer the model choice to Slice 7 — by then (~12+ months out), the model landscape will have shifted dramatically.

**Privacy note for PH HRIS:** DeepSeek's *direct hosted API* runs in China; that's a National Privacy Commission (NPC) concern for guard personal data. The mitigation is to use DeepSeek's *open weights* served by a US/EU host (Together AI, Fireworks AI). Same model quality, different jurisdiction.

## What we explicitly do NOT use

- **Vercel / Netlify hosting** — VPS-based per [0015](0015-vps-deployment.md). Vercel would add ~$20+/mo per environment.
- **Auth0 / Clerk / Supabase Auth** — hand-rolled session auth per [0005](0005-stack.md). Saves ~$25+/mo and matches the auditable-everything principle.
- **mem0** — dropped (Memsearch already covers semantic recall).
- **Datadog / New Relic** — overkill at our scale. Sentry + UptimeRobot is enough until we have evidence otherwise.
- **Managed Postgres (Neon / Supabase)** — VPS self-hosting per [0006](0006-database.md). We own the ops burden but eliminate the recurring cost.

## Total monthly cost picture

| Phase | Recurring services cost | Notes |
|---|---|---|
| Local dev (now, no VPS yet) | $0 | All local Docker. |
| Slice 0–6 in production | $0 | VPS cost CGoC pays regardless. Everything else free tier. |
| Slice 7+ (AI copilot live) | ~$10–50/mo | OpenRouter usage. Scales with volume. |
| Outgrowing free tiers | Flagged when it happens | Sentry $26/mo, Resend $20/mo, R2 $0.015/GB above 10 GB. |

## Cross-references

- [0005](0005-stack.md), [0006](0006-database.md), [0008](0008-dev-environment.md), [0015](0015-vps-deployment.md), [0016](0016-cross-platform-deployment.md).
- Delegation framework that authorized these picks: `~/.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/feedback_delegation_framework.md`.
