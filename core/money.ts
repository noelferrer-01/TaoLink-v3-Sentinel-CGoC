/**
 * Round to 2 decimal places. Used for any peso-denominated value
 * persisted or compared — keeps numerics aligned with PG numeric(_,2)
 * column shape and avoids float drift in displayed totals.
 */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
