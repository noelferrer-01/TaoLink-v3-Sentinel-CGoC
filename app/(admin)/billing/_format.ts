// Shared date + period helpers for the billing UI. Centralised so the list
// page, the SOA detail page, and the generate form format dates and encode the
// pay-run period identically. Pure functions — safe to import from both server
// and client components.

const PH_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

/** Format a YYYY-MM-DD as "Mon D, YYYY" in local Y/M/D (no timezone drift). */
export function formatPhDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-PH', PH_DATE);
}

/**
 * Format a timestamp (a real instant, e.g. a `timestamptz` column) as
 * "Mon D, YYYY" in **Manila time**. Use this instead of `.toISOString().slice(0,10)`,
 * which renders the UTC calendar day and shows the previous day for the 00:00–07:59
 * Manila window (PH is UTC+8).
 */
export function formatPhInstant(at: Date): string {
  return at.toLocaleDateString('en-PH', { ...PH_DATE, timeZone: 'Asia/Manila' });
}

/**
 * Due date = periodEnd + termsDays calendar days. Built in local Y/M/D so the
 * day-overflow rolls the month correctly and no timezone shift creeps in.
 */
export function dueDate(periodEnd: string, termsDays: number): string {
  const [y, m, d] = periodEnd.split('-');
  if (!y || !m || !d) return '—';
  return new Date(Number(y), Number(m) - 1, Number(d) + termsDays).toLocaleDateString('en-PH', PH_DATE);
}

/** Encode a pay-run period as a `<select>` value `"start|end"` (both YYYY-MM-DD). */
export function encodePeriod(p: { start: string; end: string }): string {
  return `${p.start}|${p.end}`;
}

/** Inverse of `encodePeriod` — returns null if the value is missing or malformed. */
export function parsePeriod(raw: string | undefined): { start: string; end: string } | null {
  if (!raw) return null;
  const [start, end] = raw.split('|');
  if (!start || !end) return null;
  return { start, end };
}
