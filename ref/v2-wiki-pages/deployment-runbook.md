# Deployment Runbook

> Operational runbook for the TAOLINK production deployment on the SistemaHub VPS. Backfill other sections (deploy, rollback, backups) in later passes.

## First-time swap from Payroll Central (v1) to TAOLINK V2

This section covers the **one-shot cutover** that replaces the running v1 instance at `https://taolink.sistemahub.com/app` with the V2 build. The marketing site at the bare domain is untouched (different PM2 process on port 3001).

**Decision basis:** v1's database is demo / throwaway (no real client data), so we don't migrate rows — V2 starts on a fresh database with the Sandigan Security Services seed. v1's data is backed up before drop in case anyone wants it later.

**Estimated downtime:** 2–5 minutes of `/app` availability while PM2 stops one process and starts another.

### Isolation guarantee — what this DOES and DOES NOT touch

If other websites, apps, or services share this VPS, this is what they need to know:

**The swap touches ONLY:**

- `/var/www/taolink/` (the code directory — `git pull` + `npm ci` + `npm run build`)
- The MySQL databases `payroll_central_db` (read-only — backed up via `mysqldump`) and `taolink` (created fresh — fails loud if it already has tables from another tenant)
- PM2 processes named `payroll-central` (the v1 process — stopped), and `taolink-hris` / `taolink-website` / `taolink-worker` (started). The pre-flight prints the current PM2 list with a "managed" vs "leaving alone" tag for each process so you can verify before pressing `y`.
- Ports `3000` and `3001` (the script aborts if either is held by a process we don't own)

**The swap does NOT touch:**

- nginx config / `/etc/nginx/*` — existing routing already sends `/app/*` → `:3000` and `/` → `:3001`. The swap doesn't reload, edit, or remove any nginx file.
- System packages — no `apt-get`, no global `npm install -g`. If you need to install Node or PM2 for the first time, run `deploy/deploy.sh` instead (one-time bootstrap), not the swap script.
- Other PM2 processes — only the named ones above. Any process you have for unrelated apps stays running.
- Other MySQL databases — the script never issues `DROP` or `TRUNCATE` against any DB. It creates `taolink` with `IF NOT EXISTS` and refuses to proceed if that DB already has tables (would indicate another tenant owns it).
- systemd units — the `pm2 startup` hook is off by default. Pass `--setup-systemd` only if pm2 is not already wired to start on reboot, and confirm it once at the prompt.
- TLS certificates — Let's Encrypt / certbot config is untouched.
- The marketing site at `/` (port 3001) — only restarted via `pm2 start ecosystem.config.js` if it's part of the same ecosystem file. If the marketing site is on a different VPS or different PM2 setup, set `WEBSITE_PORT` to a free port to skip the conflict check.

If anything in the pre-flight prints "leaving alone" for processes you don't recognize, that's expected — the script will only stop/start the names it manages.

### Pre-flight (do these once before the swap)

1. **Stage the swap helper script.** It lives in the repo at `deploy/swap-to-v2.sh`. The VPS pulls it via `git pull origin main` along with the rest of the code.
2. **Decide the new DB name.** Default: `taolink`. The v1 DB (`payroll_central_db`) stays on disk as a backup until you delete it manually.
3. **Confirm `.env` on the VPS has these set** (the script will refuse to proceed otherwise):
   - `DATABASE_URL=mysql://user:pass@127.0.0.1:3306/taolink` — note the new DB name
   - `SESSION_SECRET=<random>` — Lucia session signing
   - `ENCRYPTION_KEY=<64-char hex>` — AES-256-GCM for SSS/PHIC/HDMF/TIN/bank PII. **Once set, do not rotate without re-encrypting**, or all employee detail pages will show `null` for those fields.
   - `SMTP_*` — payslip emails. After swap, re-save the SMTP password in Settings → SMTP because the password is encrypted under `ENCRYPTION_KEY` and the v1 ciphertext won't carry over.
   - `INTERNAL_METRICS_TOKEN` — random hex, see "Queue-depth metric" below.
   - `NEXT_PUBLIC_APP_URL=https://taolink.sistemahub.com/app`
   - `TZ=Asia/Manila`
   - (Optional) `SENTRY_DSN`, `SENTRY_ENVIRONMENT` — see "Observability" below.
4. **SSH login.** Have your VPS SSH session ready. The script needs root or sudo for nginx + PM2.

### The swap (run on VPS)

```bash
# 1. SSH in
ssh root@taolink.sistemahub.com    # or your VPS hostname

# 2. Pull the latest V2 code + the swap helper
cd /var/www/taolink
git fetch origin
git checkout main
git pull origin main

# 3. Read what the script is about to do (sanity check)
cat deploy/swap-to-v2.sh

# 4. Execute the swap (dry-run first if uncertain)
bash deploy/swap-to-v2.sh --dry-run    # prints what it would do without running it
bash deploy/swap-to-v2.sh              # for real
```

The script does:

1. Confirms `.env` is present and the required keys are non-empty (refuses to continue if `ENCRYPTION_KEY` is missing — silent decrypt failures are worse than loud crashes).
2. Stops the v1 PM2 process (`payroll-central` or `taolink-hris-v1` — whichever is running on port 3000).
3. `mysqldump` of the v1 DB → `~/backups/payroll_central_db_pre_v2_swap_<timestamp>.sql.gz`. Aborts if the dump fails.
4. Creates the V2 DB (`CREATE DATABASE IF NOT EXISTS taolink`).
5. `npm ci && npm run build` for the HRIS and marketing site.
6. `npm run db:migrate` — runs all migrations against the fresh DB (drizzle journal goes from 0 → 0026).
7. `npm run db:seed` — seeds compliance + holidays + Sandigan Security Services agency demo data + draft pay run.
8. `pm2 start ecosystem.config.js` — starts `taolink-hris`, `taolink-website`, `taolink-worker`.
9. `pm2 save` so the new process layout persists across reboots.

### Smoke test

```bash
# Marketing site still up
curl -sI https://taolink.sistemahub.com/ | head -1   # 200 OK

# HRIS is V2 and basePath redirect works
curl -sI https://taolink.sistemahub.com/app/login | head -1  # 200 OK

# Worker is polling
pm2 logs taolink-worker --lines 30  # should show "poll … 0 pending"

# Queue depth endpoint
curl -s -H "X-Internal-Token: $INTERNAL_METRICS_TOKEN" \
  https://taolink.sistemahub.com/app/api/internal/queue-depth | jq
```

Manual checks (in a browser):
- `/app/login` — admin can sign in (`admin@example.com` from the seed if you ran it, or whatever your real admin email is)
- `/app/dashboard` — KPIs render, headcount = 36 Sandigan employees
- `/app/employees` — roster shows 36 PH names, no encrypted-decrypt warnings in `pm2 logs taolink-hris`
- `/app/pay-runs` — draft pay run for the current period exists
- `/app/attendance` — last 14 days of logs visible
- `/clock/[locationId]` — clock-in works (HTTPS required for `getUserMedia` selfie capture)
- `/ess/payslips` — log in as an employee and confirm ESS portal renders

### Rollback

If anything is wrong:

```bash
pm2 stop taolink-hris taolink-worker
# v1 was backed up but still configured — restart it if you have the old ecosystem entry
# Or restore the v1 DB and re-point DATABASE_URL back to payroll_central_db
pm2 start <v1-pm2-name>
```

The v1 DB dump lives at `~/backups/payroll_central_db_pre_v2_swap_<timestamp>.sql.gz` — restore with:

```bash
gunzip < ~/backups/payroll_central_db_pre_v2_swap_<ts>.sql.gz | mysql -uroot -p payroll_central_db
```

### Post-swap cleanup (after a few demo days, when you're sure V2 is sticking)

- Drop the v1 DB: `mysql -uroot -p -e "DROP DATABASE payroll_central_db;"`
- Delete the v1 backup if you don't need it: `rm ~/backups/payroll_central_db_pre_v2_swap_*.sql.gz`
- Remove the v1 PM2 entry from `~/.pm2/dump.pm2` if any leftover, then `pm2 save`

## Observability

TAOLINK has two server-side observability surfaces. Both are optional — the app runs fine without them — but production deployments should configure both.

### Sentry (errors + traces)

A single Sentry project covers both the Next.js web process and the background worker. The browser is **not** instrumented in v1 (deferred — see spec follow-ups in `docs/superpowers/specs/2026-05-21-sentry-queue-depth-design.md` §10).

**Configure:**

- `SENTRY_DSN` — the project DSN from Sentry's Settings -> Projects -> Client Keys. When unset, both SDKs silently no-op; the app behaves exactly as if Sentry wasn't installed.
- `SENTRY_ENVIRONMENT` — optional tag to separate prod from staging when both share one Sentry project. Defaults to `NODE_ENV`.

Both vars must be present in `/var/www/taolink/.env` (read by PM2 for both web and worker — see `ecosystem.config.js`). If only one process sees the DSN, only that process's errors reach Sentry.

**What gets captured:**

- Web: Server-side throws — server actions, route handlers, RSC renders, middleware. Sampled at 10% (`tracesSampleRate: 0.1`).
- Worker: Job-handler exceptions, retention sweep errors, `unhandledRejection`, `uncaughtException`. Sampled at 100% (`tracesSampleRate: 1.0`) — low cardinality, low volume.
- Anything routed through `logger.error()` is automatically forwarded to Sentry via `src/lib/sentry-bridge.ts`. Callers don't need to remember.

**Deferred (not yet wired):**

- `Sentry.startSpan` around `pollForJobs` and per-job dispatches. Add once basic error capture is healthy in a real Sentry project — current scope is errors, not traces. See spec §5.1.
- Source-map symbolication (`SENTRY_AUTH_TOKEN`). Wire up alongside CI in Priority #4.
- Client-side browser SDK. PII review needed on punch-selfie pages first.

### Queue-depth metric

`GET /app/api/internal/queue-depth` returns a JSON snapshot of the `bg_jobs` table:

```json
{
  "pending": 4,
  "processing": 1,
  "completed_last_24h": 372,
  "failed_last_24h": 0,
  "oldest_pending_age_seconds": 17
}
```

**Configure:**

- `INTERNAL_METRICS_TOKEN` — long random string. Required for the endpoint to return 200. If unset, the endpoint returns **503** (not a misleading 200) so operators see they forgot to configure it.

  Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Use:**

```bash
curl -s -H "X-Internal-Token: $INTERNAL_METRICS_TOKEN" \
     https://taolink.sistemahub.com/app/api/internal/queue-depth | jq
```

**Status codes:**

- `200` — payload returned (even when all counts are zero).
- `401` — header missing or wrong.
- `503` — `INTERNAL_METRICS_TOKEN` not set on the server.

**Alerting hint:** A non-zero `oldest_pending_age_seconds` that keeps growing across consecutive polls indicates the worker is not draining the queue. Either the worker is down (PM2 likely already restarting it — check `pm2 logs taolink-worker`) or it is crash-looping on a poisonous job (check Sentry for the recurring exception, then `bg_jobs.error_message` and `attempt_count` for the offending row).
