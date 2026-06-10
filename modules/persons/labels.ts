/**
 * UI-facing labels + helpers for the Persons module.
 *
 * Key exports:
 *   ANCHOR_ID_LABELS  — human-readable names for each anchor ID type
 *   ID_TYPE_LADDER    — ordered preference ladder for picking the anchor type
 *   normalizeNameKey  — produces a collision-resistant name+DOB key for dedup
 *   checkIdFormat     — advisory format warning (NEVER hard-rejects)
 *
 * Design: wiki/slices/3-identity-and-credentials.md §5a
 * Build plan: wiki/slices/3a-person-identity-plan.md Task 1, Step 3
 */

import type { personAnchorIdType } from './schema';

// Re-export as a plain type alias so callers don't need to import from schema.
export type AnchorIdType = typeof personAnchorIdType.enumValues[number];

// ─── Labels ────────────────────────────────────────────────────────────────────

export const ANCHOR_ID_LABELS: Record<AnchorIdType, string> = {
  philsys:        'PhilSys (national ID)',
  sss:            'SSS number',
  tin:            'TIN (tax ID)',
  passport:       'Passport',
  umid:           'UMID',
  drivers_license: "Driver's license",
  none:           'No ID yet',
};

// ─── Ladder ────────────────────────────────────────────────────────────────────

/**
 * Preferred order for selecting an anchor ID type.
 * `none` is intentionally excluded — it is the fallback, not a preference.
 * Used by the backfill and intake logic to pick the strongest available anchor.
 */
export const ID_TYPE_LADDER = [
  'philsys',
  'sss',
  'tin',
  'passport',
  'umid',
  'drivers_license',
] as const;

export type AnchorIdTypeNonNone = typeof ID_TYPE_LADDER[number];

// ─── Name normalisation ────────────────────────────────────────────────────────

/**
 * Produces a collision-resistant dedup key from name + date-of-birth.
 * Normalises case, collapses common PH surname particles (de la / dela / de),
 * and strips extra whitespace.
 *
 * Key format: "last|first|dob"
 *
 * Examples:
 *   normalizeNameKey('Juan', 'Dela Cruz', '1990-04-02') → 'delacruz|juan|1990-04-02'
 *   normalizeNameKey('Juan', 'De La Cruz', '1990-04-02') → 'delacruz|juan|1990-04-02'
 *
 * Used by the backfill dedup pre-pass and `findPossibleDuplicates`.
 */
export function normalizeNameKey(
  first: string,
  last: string,
  dob: string | null | undefined,
): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      // Collapse common PH particles so "de la" and "dela" match.
      .replace(/\bde\s+la\b/g, 'dela')
      .replace(/\bde\s+los\b/g, 'delos')
      .replace(/\bde\b/g, 'de')
      // Collapse all whitespace (incl. non-breaking spaces) to nothing.
      .replace(/\s+/g, '');

  return `${norm(last)}|${norm(first)}|${dob ?? ''}`;
}

// ─── Advisory format check ────────────────────────────────────────────────────

/**
 * Checks whether a raw ID value looks plausible for the given type.
 * Returns a human-readable WARNING string when it looks unusual, or null when
 * it looks fine.
 *
 * NEVER throws. NEVER hard-rejects. The caller decides whether to surface the
 * warning or proceed silently. Legacy IDs and unconventional formats are
 * grandfathered — this is a UI nudge, not a gate.
 *
 * Format notes (advisory — confirm with client/PSA; do NOT treat as canon):
 *   philsys: 12-digit PSN or 16-digit card number (PSA convention)
 *   sss:     10 digits
 *   tin:     9 digits (base) or 12 digits (base + 3-digit branch code)
 *   others:  length ≥ 4 (lenient — passport/UMID/DL vary widely)
 *
 * Separators (spaces, hyphens) are stripped before checking — the raw value
 * from most government cards includes them.
 */
export function checkIdFormat(type: AnchorIdType, raw: string): string | null {
  if (type === 'none') return null;

  const v = raw.replace(/[\s-]/g, '');

  const ok =
    type === 'philsys'         ? /^\d{12}(\d{4})?$/.test(v) :   // 12-digit PSN or 16-digit card
    type === 'sss'             ? /^\d{10}$/.test(v) :
    type === 'tin'             ? /^\d{9}(\d{3})?$/.test(v) :     // 9 base or 12 with branch
    v.length >= 4;                                               // passport/umid/dl: lenient

  if (ok) return null;

  const label = ANCHOR_ID_LABELS[type] ?? type.toUpperCase();
  return `That ${label} number looks unusual — double-check it. You can still save it.`;
}
