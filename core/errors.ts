/**
 * Shared error helpers.
 */

/**
 * True when `err` looks like a raw Postgres error from the `postgres` driver
 * (they carry a string SQLSTATE `code`, e.g. '23505'). Used at module
 * boundaries to decide whether an error still needs annotating versus one of
 * our own already-shaped Errors (plain-language or `[module/fn]`-prefixed).
 */
export function isPgError(err: unknown): err is { code: string; message?: string } {
  return typeof (err as { code?: unknown } | null | undefined)?.code === 'string';
}
