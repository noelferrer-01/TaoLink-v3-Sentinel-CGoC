/**
 * Persons name-search primitives — shared by every module that searches people
 * by name (hr employees, recruitment applicants). Lives here because `persons`
 * owns the name columns and the GIN trigram index (`persons_fullname_trgm`).
 *
 * Why shared: before this, hr/service.ts held private copies of these. The
 * recruitment applicant search needs the exact same GIN-accelerated path, and
 * modules may not import each other's internals — so the primitives live on the
 * table's owning module and both callers import them. One definition, no drift.
 */

import { sql, type SQL } from 'drizzle-orm';
import type { getDb, DbOrTx } from '@/core/db';
import { persons } from './schema';

/**
 * pg_trgm similarity threshold for person-name search. The `%` operator in
 * `personFullNameMatches` honours whatever the session threshold is; we pin it
 * to this value per-transaction via `withNameSearchThreshold` (SET LOCAL).
 */
export const NAME_SEARCH_THRESHOLD = 0.2;

/**
 * Escapes `%`, `_`, and `\` in a user-typed term before it is embedded in a
 * LIKE/ILIKE pattern, so "S_0002" matches that literal text instead of using
 * `_` as a one-character wildcard. Postgres's default LIKE escape char is `\`.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * SQL fragment: the persons full name (first + ' ' + last) fuzzy-matches `query`
 * via the trigram `%` operator. This is the GIN-accelerated form — at scale the
 * planner uses `persons_fullname_trgm` for it (verified by the stress harness).
 */
export function personFullNameMatches(query: string): SQL {
  return sql`(${persons.firstName} || ' ' || ${persons.lastName}) % ${query}`;
}

/** SQL fragment: ORDER BY trigram similarity of the full name to `query`, DESC NULLS LAST. */
export function personFullNameSimilarityDesc(query: string): SQL {
  return sql`similarity(${persons.firstName} || ' ' || ${persons.lastName}, ${query}) DESC NULLS LAST`;
}

/**
 * Runs `fn` inside a transaction with `pg_trgm.similarity_threshold` pinned to
 * NAME_SEARCH_THRESHOLD for the duration (SET LOCAL is pool-safe — it reverts
 * automatically on commit/rollback). `db` must be the full client (only it has
 * `.transaction()`); every caller passes `getDb()`.
 */
export async function withNameSearchThreshold<T>(
  db: ReturnType<typeof getDb>,
  fn: (tx: DbOrTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL pg_trgm.similarity_threshold = ${sql.raw(String(NAME_SEARCH_THRESHOLD))}`);
    return fn(tx);
  });
}
