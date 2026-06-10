/**
 * Shared date helpers.
 *
 * Sentinel serves one country (Philippines, UTC+8) but may run on servers in
 * any timezone, so "today" is pinned to Asia/Manila explicitly. The previous
 * page-local idiom — `new Date().toISOString().slice(0, 10)` — is UTC: between
 * midnight and 08:00 Manila time it returns YESTERDAY's date, which silently
 * wrong-foots clerk-facing date defaults (hire date, DTR day, date applied).
 */

/** Today's date as YYYY-MM-DD in Asia/Manila, regardless of server timezone. */
export function todayIso(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}
