/**
 * db/stress/run.ts — Identity-spine stress test orchestrator.
 *
 * Proves (or breaks) the Person identity spine at production scale BEFORE we
 * build the T13 UI on top of it. Runs entirely against a THROWAWAY
 * `sentinel_stress` database — never dev, never test.
 *
 * Pipeline:
 *   1. Derive + guard the stress DB URL (triple-guarded against dev/test).
 *   2. Drop + recreate the stress DB; apply ALL migrations in-process.
 *   3. Override DATABASE_URL → stress, then import the REAL service code so
 *      every getDb() in the app hits the stress DB. The code path is unmodified.
 *   4. Seed a volume + adversarial dataset (db/stress/seed.ts) and ANALYZE.
 *   5. Measure: wall-clock latency of the real exported functions + EXPLAIN
 *      ANALYZE on mirrored queries (the "why" behind the latency).
 *   6. Assert: 12 adversarial correctness checks on the safety behaviors.
 *   7. Report to console + .tmp/stress/<timestamp>.md.
 *   8. Tear down (drop the DB unless --keep).
 *
 * Exit code is non-zero on any correctness failure or latency blow-up, so this
 * can gate a release.
 *
 * Usage:
 *   pnpm db:stress              # default 12,000 persons
 *   pnpm db:stress 25000        # push harder
 *   pnpm db:stress 12000 --keep # leave the DB up for manual inspection
 *   pnpm db:stress --seed=42    # different deterministic dataset
 *
 * See db/stress/README.md.
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { getEnv, resetEnvForTests } from '../../core/env';
import { seedStress, type SeedResult } from './seed';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../drizzle/migrations');
const REPORT_DIR = path.resolve(__dirname, '../../.tmp/stress');

// Latency verdict thresholds (p95, ms) at the seeded volume.
const LAT_PASS = 75;
const LAT_FAIL = 250;

function redact(url: string): string {
  return url.replace(/(postgres:\/\/[^:]+:)[^@]+(@)/i, '$1***$2');
}

// ─── 1. Derive + guard the stress DB URL ──────────────────────────────────────

function resolveStressUrl(stressName: string): { stressUrl: string; adminUrl: string; stressName: string } {
  const env = getEnv();
  const devUrl = new URL(env.DATABASE_URL);
  const devName = devUrl.pathname.replace(/^\//, '');
  const testName = env.TEST_DATABASE_URL ? new URL(env.TEST_DATABASE_URL).pathname.replace(/^\//, '') : null;

  // Triple guard — an accidental dev/test wipe must be impossible.
  if (!/stress/i.test(stressName)) {
    throw new Error(`[stress] refusing: target DB name "${stressName}" does not contain "stress".`);
  }
  if (stressName === devName) {
    throw new Error(`[stress] refusing: stress DB name "${stressName}" equals the dev DB.`);
  }
  if (testName && stressName === testName) {
    throw new Error(`[stress] refusing: stress DB name "${stressName}" equals the test DB.`);
  }

  const stress = new URL(env.DATABASE_URL);
  stress.pathname = `/${stressName}`;
  const admin = new URL(env.DATABASE_URL);
  admin.pathname = '/postgres';
  return { stressUrl: stress.toString(), adminUrl: admin.toString(), stressName };
}

// ─── 2. Recreate + migrate the stress DB ──────────────────────────────────────

async function recreateDatabase(adminUrl: string, stressName: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1, prepare: false });
  try {
    // Kick off any lingering connections so DROP can proceed.
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = '${stressName}' AND pid <> pg_backend_pid()`,
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS "${stressName}"`);
    await admin.unsafe(`CREATE DATABASE "${stressName}"`);
    console.log(`[stress] recreated database "${stressName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/**
 * Applies every migration .sql file to the stress DB using an EXPLICIT client.
 *
 * This is a deliberate, self-contained mirror of drizzle/migrate.ts's apply loop
 * (kept here rather than reused) so the throwaway-DB tooling targets the stress
 * URL by direct argument and can never be perturbed by --env-file precedence or
 * the dev/test singleton. If migrate.ts's loop changes materially, mirror it.
 */
async function migrateStress(stressUrl: string): Promise<void> {
  const sqlc = postgres(stressUrl, { max: 1, prepare: false });
  try {
    await sqlc`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const body = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await sqlc.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
    }
    console.log(`[stress] applied ${files.length} migrations`);
  } finally {
    await sqlc.end({ timeout: 5 });
  }
}

// ─── 5. Measurement helpers ───────────────────────────────────────────────────

type Latency = { label: string; p50: number; p95: number; max: number; mean: number; n: number; verdict: 'PASS' | 'WARN' | 'FAIL' };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function measure(label: string, fn: (i: number) => Promise<unknown>, iters = 30): Promise<Latency> {
  for (let i = 0; i < 3; i++) await fn(i); // warm up (discarded)
  const times: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t = performance.now();
    await fn(i);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const p95 = percentile(times, 95);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const verdict = p95 < LAT_PASS ? 'PASS' : p95 < LAT_FAIL ? 'WARN' : 'FAIL';
  return { label, p50: percentile(times, 50), p95, max: times[times.length - 1]!, mean, n: iters, verdict };
}

type PlanInfo = { label: string; expectIndex: string | null; indexes: string[]; seqScanRelations: string[]; execMs: number | null; note: string };

function analyzePlan(label: string, planValue: unknown, expectIndex: string | null, note: string): PlanInfo {
  const arr = Array.isArray(planValue) ? planValue : [planValue];
  const root = arr[0] as Record<string, unknown> | undefined;
  const execMs = (root?.['Execution Time'] as number | undefined) ?? null;
  const indexes = new Set<string>();
  const seqScanRels = new Set<string>();
  const walk = (n: Record<string, unknown> | undefined) => {
    if (!n) return;
    if (n['Index Name']) indexes.add(String(n['Index Name']));
    if (n['Node Type'] === 'Seq Scan' && n['Relation Name']) seqScanRels.add(String(n['Relation Name']));
    for (const c of (n['Plans'] as Record<string, unknown>[] | undefined) ?? []) walk(c);
  };
  walk(root?.['Plan'] as Record<string, unknown> | undefined);
  return { label, expectIndex, indexes: [...indexes], seqScanRelations: [...seqScanRels], execMs, note };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const keep = argv.includes('--keep');
  const seedArg = argv.find((a) => a.startsWith('--seed='));
  const nArg = argv.find((a) => /^\d+$/.test(a));
  const N = nArg ? parseInt(nArg, 10) : 12_000;
  const seed = seedArg ? parseInt(seedArg.split('=')[1]!, 10) : undefined;
  const stressName = 'sentinel_stress';

  const { stressUrl, adminUrl } = resolveStressUrl(stressName);
  console.log(`[stress] target: ${redact(stressUrl)}  |  persons=${N}  keep=${keep}`);

  // ── Recreate + migrate ──
  await recreateDatabase(adminUrl, stressName);
  await migrateStress(stressUrl);

  // ── Point the app at the stress DB, then import the REAL code ──
  process.env.DATABASE_URL = stressUrl;
  delete process.env.VITEST; // ensure we are NOT treated as a test context
  Object.assign(process.env, { NODE_ENV: 'development' }); // …and not test via NODE_ENV either
  resetEnvForTests();

  const { getDb, closeDb } = await import('../../core/db');
  const hr = await import('../../modules/hr/service');
  const rec = await import('../../modules/recruitment/service');
  const ppl = await import('../../modules/persons');

  const db = getDb();

  // Sanity: confirm the singleton really points at the stress DB before we write.
  const dbNameRows = (await db.execute(sql`SELECT current_database() AS db`)) as unknown as { db: string }[];
  const connectedDb = dbNameRows[0]?.db;
  if (connectedDb !== stressName) {
    await closeDb();
    throw new Error(`[stress] ABORT: connected to "${connectedDb}", expected "${stressName}". Refusing to seed.`);
  }
  console.log(`[stress] confirmed connection to "${connectedDb}"`);

  let seeded: SeedResult;
  const correctness: { name: string; pass: boolean; detail: string }[] = [];
  const latencies: Latency[] = [];
  const plans: PlanInfo[] = [];

  try {
    // ── 4. Seed ──
    console.time('[stress] seed');
    seeded = await seedStress(db, { persons: N, seed });
    console.timeEnd('[stress] seed');
    const c = seeded.counts;
    console.log(`[stress] seeded: ${c.persons} persons, ${c.employees} employees, ${c.applicants} applicants, ${c.blacklist} blacklist (Jan-1 cluster: ${seeded.needles.hotDobClusterSize})`);
    const n = seeded.needles;

    // ── 5a. Latency of the real functions ──
    console.log('[stress] measuring latency…');
    const deepOffset = Math.max(0, c.persons - 100);
    latencies.push(await measure('hr.listEmployeesPage (GIN name search)', () => hr.listEmployeesPage({ query: n.searchSurname, limit: 50 })));
    latencies.push(await measure('hr.listEmployeesPage (deep offset, no query)', () => hr.listEmployeesPage({ limit: 50, offset: deepOffset })));
    latencies.push(await measure('hr.searchEmployees (typeahead)', () => hr.searchEmployees(n.searchSurname)));
    latencies.push(await measure('rec.listApplicantsPage (GIN name search)', () => rec.listApplicantsPage({ query: n.searchSurname, limit: 20, offset: 0 })));
    latencies.push(await measure('rec.listApplicantsPage (SSS numeric search)', () => rec.listApplicantsPage({ query: n.quarantined.sss, limit: 20, offset: 0 })));
    latencies.push(await measure('rec.checkMatches (exact, by SSS)', () => rec.checkMatches({ personId: null, firstName: n.activeEmp.firstName, lastName: n.activeEmp.lastName, sssNumber: n.activeEmp.sss })));
    latencies.push(await measure('rec.checkMatches (fuzzy, Jan-1 cluster worst case)', () => rec.checkMatches({ personId: null, firstName: n.hotDobUniqueName.firstName, lastName: n.hotDobUniqueName.lastName, dateOfBirth: n.hotDobUniqueName.dateOfBirth })));
    latencies.push(await measure('persons.findPossibleDuplicates (Jan-1 cluster)', () => ppl.findPossibleDuplicates({ firstName: n.hotDobUniqueName.firstName, lastName: n.hotDobUniqueName.lastName, dateOfBirth: n.hotDobUniqueName.dateOfBirth })));
    latencies.push(await measure('persons.findPersonByAnyId (quarantine LIKE path)', () => ppl.findPersonByAnyId('sss', n.quarantined.sss)));
    latencies.push(await measure('persons.findPersonByAnyId (anchor index path)', () => ppl.findPersonByAnyId('sss', n.activeEmp.sss)));

    // ── 5b. EXPLAIN ANALYZE on mirrored queries (the "why") ──
    console.log('[stress] capturing query plans…');
    // Employee search join — mirrors listEmployeesPage; needs the SET LOCAL threshold.
    const empPlan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL pg_trgm.similarity_threshold = 0.2`);
      const r = await tx.execute(sql`EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS)
        SELECT e.id FROM hr_employees e JOIN persons p ON e.person_id = p.id
        WHERE (p.first_name || ' ' || p.last_name) % ${n.searchSurname}
        ORDER BY similarity(p.first_name || ' ' || p.last_name, ${n.searchSurname}) DESC NULLS LAST, e.id
        LIMIT 50`);
      return (r as unknown as Record<string, unknown>[])[0]?.['QUERY PLAN'];
    });
    plans.push(analyzePlan('employee name search (JOIN + GIN)', empPlan, 'persons_fullname_trgm', 'The open T10 question: does the planner use the GIN index inside the join?'));

    // Applicant NAME search now uses the same GIN trigram path as employees.
    const appPlan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL pg_trgm.similarity_threshold = 0.2`);
      const r = await tx.execute(sql`EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS)
        SELECT a.id FROM recruitment_applicants a JOIN persons p ON a.person_id = p.id
        WHERE (p.first_name || ' ' || p.last_name) % ${n.searchSurname}
        ORDER BY similarity(p.first_name || ' ' || p.last_name, ${n.searchSurname}) DESC NULLS LAST, a.applied_on DESC
        LIMIT 20`);
      return (r as unknown as Record<string, unknown>[])[0]?.['QUERY PLAN'];
    });
    plans.push(analyzePlan('applicant name search (GIN trigram)', appPlan, 'persons_fullname_trgm', 'Now the same GIN path as employees (was a leading-wildcard ILIKE seq scan).'));

    // Applicant SSS search is a numeric-only branch — substring on sss_number,
    // still a seq scan but rare and small, and it no longer drags the name path down.
    const appSssPlan = (await db.execute(sql`EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS)
      SELECT a.id FROM recruitment_applicants a JOIN persons p ON a.person_id = p.id
      WHERE p.sss_number ILIKE ${'%' + n.activeEmp.sss + '%'}
      ORDER BY a.applied_on DESC LIMIT 20`) as unknown as Record<string, unknown>[])[0]?.['QUERY PLAN'];
    plans.push(analyzePlan('applicant SSS search (numeric branch)', appSssPlan, null, 'Substring SSS lookup — seq scan by nature; rare path, off the common name search.'));

    const dobPlan = (await db.execute(sql`EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS) SELECT id FROM persons WHERE date_of_birth = ${n.hotDob}`) as unknown as Record<string, unknown>[])[0]?.['QUERY PLAN'];
    plans.push(analyzePlan('matcher DOB candidate scan (Jan-1 cluster)', dobPlan, 'persons_dob_idx', 'findPossibleDuplicates loads every same-DOB row into JS for name filtering.'));

    const quarPlan = (await db.execute(sql`EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS) SELECT id FROM persons WHERE sss_number = ${n.quarantined.sss} OR quarantined_ids LIKE ${'%sss:' + n.quarantined.sss + '%'}`) as unknown as Record<string, unknown>[])[0]?.['QUERY PLAN'];
    plans.push(analyzePlan('findPersonByAnyId quarantine LIKE', quarPlan, null, 'quarantined_ids has no index — representative of the un-indexed LIKE branch.'));

    const sssPlan = (await db.execute(sql`EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS) SELECT id FROM persons WHERE sss_number = ${n.activeEmp.sss}`) as unknown as Record<string, unknown>[])[0]?.['QUERY PLAN'];
    plans.push(analyzePlan('anchor SSS exact lookup', sssPlan, 'persons_sss_uq', 'Baseline — partial unique index should be used.'));

    // ── 6. Adversarial correctness ──
    console.log('[stress] running correctness assertions…');
    const add = (name: string, pass: boolean, detail: string) => correctness.push({ name, pass, detail });
    const kinds = (ms: { kind: string }[]) => ms.map((m) => m.kind);

    const c1 = await rec.checkMatches({ personId: null, firstName: n.activeEmp.firstName, lastName: n.activeEmp.lastName, sssNumber: n.activeEmp.sss });
    add('C1 active employee → double-hire flag', kinds(c1).includes('active_employee'), `kinds=[${kinds(c1)}]`);

    const c2 = await rec.checkMatches({ personId: null, firstName: n.concurrentApplicant.firstName, lastName: n.concurrentApplicant.lastName, sssNumber: n.concurrentApplicant.sss });
    add('C2 in-flight applicant → concurrent flag', kinds(c2).includes('concurrent_applicant'), `kinds=[${kinds(c2)}]`);

    const c3 = await rec.checkMatches({ personId: null, firstName: n.terminatedEmp.firstName, lastName: n.terminatedEmp.lastName, sssNumber: n.terminatedEmp.sss });
    add('C3 terminated employee flagged', kinds(c3).includes('terminated_employee'), `kinds=[${kinds(c3)}]`);

    const c4 = await rec.checkMatches({ personId: n.blacklistByPersonId.personId, firstName: n.blacklistByPersonId.firstName, lastName: n.blacklistByPersonId.lastName });
    add('C4 blacklist by personId', kinds(c4).includes('blacklist'), `kinds=[${kinds(c4)}]`);

    const c5 = await rec.checkMatches({ personId: null, firstName: n.blacklistBySssSnapshot.firstName, lastName: n.blacklistBySssSnapshot.lastName, sssNumber: n.blacklistBySssSnapshot.sss });
    add('C5 blacklist by SSS snapshot (personId null)', kinds(c5).includes('blacklist'), `kinds=[${kinds(c5)}]`);

    const c6 = await rec.checkMatches({ personId: null, firstName: n.fuzzyPair.firstName, lastName: 'de la Cruz', dateOfBirth: n.fuzzyPair.dateOfBirth });
    add('C6 fuzzy name+DOB → possible match', c6.some((m) => m.confidence === 'possible'), `matches=${JSON.stringify(c6.map((m) => ({ k: m.kind, c: m.confidence })))}`);

    let c7pass = false; let c7detail = '';
    try { await ppl.assertAnchored(n.provisionalPersonId); c7detail = 'did NOT throw on provisional (BUG)'; }
    catch { try { await ppl.assertAnchored(n.anchoredPersonId); c7pass = true; c7detail = 'throws on provisional, resolves on anchored'; } catch (e) { c7detail = `threw on anchored too: ${(e as Error).message}`; } }
    add('C7 hire gate (assertAnchored)', c7pass, c7detail);

    const c8 = await ppl.findPersonByAnyId('sss', n.quarantined.sss);
    add('C8 quarantined SSS still findable', c8?.id === n.quarantined.personId, `found=${c8?.id ?? 'null'} expected=${n.quarantined.personId}`);

    const c9 = await ppl.findPossibleDuplicates({ firstName: n.fuzzyPair.firstName, lastName: n.fuzzyPair.lastName, dateOfBirth: n.fuzzyPair.dateOfBirth });
    add('C9 particle-variant duplicates detected', c9.length >= 2, `count=${c9.length}`);

    // C10 idPending nudge (writes audit — fine).
    const advProv = await rec.advanceStage(n.provisionalApplicant.applicantId, 'contacted');
    const advAnch = await rec.advanceStage(n.anchoredApplicant.applicantId, 'documents');
    add('C10 idPending nudge tracks anchor', advProv.idPending === true && advAnch.idPending === false, `provisional.idPending=${advProv.idPending}, anchored.idPending=${advAnch.idPending}`);

    const c11 = await rec.checkMatches({ personId: n.concurrentApplicant.personId, firstName: n.concurrentApplicant.firstName, lastName: n.concurrentApplicant.lastName, excludeApplicantId: n.concurrentApplicant.applicantId });
    add('C11 self-row excluded from matcher', !kinds(c11).includes('concurrent_applicant'), `kinds=[${kinds(c11)}] (own applicant must be excluded)`);

    const c12 = await ppl.findPossibleDuplicates({ firstName: n.hotDobUniqueName.firstName, lastName: n.hotDobUniqueName.lastName, dateOfBirth: n.hotDobUniqueName.dateOfBirth });
    add(`C12 Jan-1 cluster does not false-flag (cluster=${seeded.needles.hotDobClusterSize})`, c12.length <= 3, `unique name in ${seeded.needles.hotDobClusterSize}-row cluster returned ${c12.length} dup(s)`);

    // ── 7. Report ──
    await writeReport(seeded, latencies, plans, correctness, N);
    printSummary(seeded, latencies, plans, correctness);
  } finally {
    await closeDb();
    if (!keep) {
      await recreateDropOnly(adminUrl, stressName);
      console.log(`[stress] dropped "${stressName}" (use --keep to retain)`);
    } else {
      console.log(`[stress] kept "${stressName}" for inspection: ${redact(stressUrl)}`);
    }
  }

  // Exit code: fail on any correctness failure or latency blow-up.
  const corruptions = correctness.filter((c) => !c.pass);
  const blowups = latencies.filter((l) => l.verdict === 'FAIL');
  if (corruptions.length > 0 || blowups.length > 0) {
    console.error(`\n[stress] ❌ FAILED: ${corruptions.length} correctness, ${blowups.length} latency blow-ups.`);
    process.exit(1);
  }
  console.log('\n[stress] ✅ PASSED.');
}

async function recreateDropOnly(adminUrl: string, stressName: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await admin.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${stressName}' AND pid <> pg_backend_pid()`);
    await admin.unsafe(`DROP DATABASE IF EXISTS "${stressName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

// ─── Report rendering ─────────────────────────────────────────────────────────

function ms(x: number | null): string {
  return x == null ? 'n/a' : `${x.toFixed(1)}ms`;
}

function printSummary(seeded: SeedResult, latencies: Latency[], plans: PlanInfo[], correctness: { name: string; pass: boolean; detail: string }[]) {
  console.log('\n══════════════════════ STRESS REPORT ══════════════════════');
  console.log(`Volume: ${seeded.counts.persons} persons · ${seeded.counts.employees} employees · ${seeded.counts.applicants} applicants · ${seeded.counts.blacklist} blacklist`);

  console.log('\n── Latency (p95) ──');
  for (const l of latencies) {
    const mark = l.verdict === 'PASS' ? '✅' : l.verdict === 'WARN' ? '⚠️ ' : '❌';
    console.log(`  ${mark} ${l.label.padEnd(48)} p50=${l.p50.toFixed(1)}ms p95=${l.p95.toFixed(1)}ms max=${l.max.toFixed(1)}ms`);
  }

  console.log('\n── Query plans ──');
  for (const p of plans) {
    const seq = p.seqScanRelations.includes('persons');
    const usedExpected = p.expectIndex ? p.indexes.includes(p.expectIndex) : true;
    const mark = seq && p.expectIndex ? '⚠️ ' : usedExpected ? '✅' : '⚠️ ';
    console.log(`  ${mark} ${p.label.padEnd(40)} exec=${ms(p.execMs)} indexes=[${p.indexes.join(', ') || 'none'}]${seq ? ' SEQ-SCAN:persons' : ''}`);
  }

  console.log('\n── Correctness ──');
  for (const c of correctness) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}${c.pass ? '' : ` — ${c.detail}`}`);
  }
  console.log('════════════════════════════════════════════════════════════');
}

async function writeReport(seeded: SeedResult, latencies: Latency[], plans: PlanInfo[], correctness: { name: string; pass: boolean; detail: string }[], N: number) {
  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(REPORT_DIR, `stress-report-${stamp}.md`);
  const passCorr = correctness.filter((c) => c.pass).length;
  const lines: string[] = [];
  lines.push(`# Identity-spine stress report`);
  lines.push(`\n_Generated ${new Date().toISOString()} · target N=${N}_\n`);
  lines.push(`**Volume:** ${seeded.counts.persons} persons · ${seeded.counts.employees} employees · ${seeded.counts.applicants} applicants · ${seeded.counts.blacklist} blacklist · Jan-1 cluster ${seeded.needles.hotDobClusterSize}`);
  lines.push(`\n**Correctness:** ${passCorr}/${correctness.length} passed · **Latency blow-ups (>${LAT_FAIL}ms p95):** ${latencies.filter((l) => l.verdict === 'FAIL').length}\n`);

  lines.push(`## Latency\n`);
  lines.push(`| Function | p50 | p95 | max | verdict |`);
  lines.push(`|---|---|---|---|---|`);
  for (const l of latencies) lines.push(`| ${l.label} | ${l.p50.toFixed(1)}ms | ${l.p95.toFixed(1)}ms | ${l.max.toFixed(1)}ms | ${l.verdict} |`);

  lines.push(`\n## Query plans (EXPLAIN ANALYZE)\n`);
  lines.push(`| Query | exec | indexes used | seq scan on persons? | note |`);
  lines.push(`|---|---|---|---|---|`);
  for (const p of plans) lines.push(`| ${p.label} | ${ms(p.execMs)} | ${p.indexes.join(', ') || '—'} | ${p.seqScanRelations.includes('persons') ? '**YES**' : 'no'} | ${p.note} |`);

  lines.push(`\n## Correctness\n`);
  lines.push(`| Check | Result | Detail |`);
  lines.push(`|---|---|---|`);
  for (const c of correctness) lines.push(`| ${c.name} | ${c.pass ? '✅ pass' : '❌ FAIL'} | ${c.detail} |`);

  await writeFile(file, lines.join('\n') + '\n', 'utf8');
  console.log(`[stress] report → ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error('[stress] FATAL:', err);
  process.exit(1);
});
