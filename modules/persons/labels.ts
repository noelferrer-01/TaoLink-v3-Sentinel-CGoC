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

import type { personAnchorIdType, personCredType, personCredStatus } from './schema';

// Re-export as a plain type alias so callers don't need to import from schema.
export type AnchorIdType = typeof personAnchorIdType.enumValues[number];

// Credential type aliases (Slice 3b) — same pattern: callers import from here.
export type CredType   = typeof personCredType.enumValues[number];
export type CredStatus = typeof personCredStatus.enumValues[number];

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

// ─── Credentials (Slice 3b — ADR 0018) ─────────────────────────────────────────

/**
 * Human-readable names for each credential type. Spellings mirror the
 * recruitment doc-type labels (DOC_TYPE_LABELS) so the same clearance reads
 * identically on the applicant document checklist and the employee wallet.
 */
export const CRED_TYPE_LABELS: Record<CredType, string> = {
  nbi_clearance:         'NBI clearance',
  police_pnp_clearance:  'PNP / police clearance',
  barangay_clearance:    'Barangay clearance',
  drug_test:             'Drug test',
  medical_exam:          'Medical exam',
  neuro_psych:           'Neuro-psychological exam',
  training_cert_sbr_rtc: 'Security training cert (SBR/RTC)',
  sosia_license:         'SOSIA license',
  ltopf_license:         'LTOPF license (firearms)',
};

/** Human-readable names for the stored credential status. */
export const CRED_STATUS_LABELS: Record<CredStatus, string> = {
  valid:   'Valid',
  expired: 'Expired',
  pending: 'Pending',
  revoked: 'Revoked',
};

/**
 * The derived DISPLAY state of a credential. Layers `expiring` (a still-valid
 * licence inside its renewal window) on top of the four stored statuses.
 * `revoked` is kept distinct from `expired` — never collapse the two.
 */
export type CredState = 'valid' | 'expiring' | 'expired' | 'revoked' | 'pending';

/**
 * Derives the display state from a credential's expiry + stored status.
 *
 *   revoked / pending  → pass through (revoked stays revoked, NOT expired)
 *   no expiry          → valid (e.g. a one-off clearance with no lapse date)
 *   expiry in the past → expired
 *   expiry within window (inclusive of today) → expiring
 *   otherwise          → valid
 *
 * `today` and `expiresOn` are ISO `YYYY-MM-DD` strings (date columns). The
 * string `<` compares lexicographically, which is correct for zero-padded ISO
 * dates; the window check uses millisecond math on UTC-midnight parses.
 */
export function deriveCredState(
  expiresOn: string | null,
  status: string,
  today: string,
  windowDays = 60,
): CredState {
  if (status === 'revoked') return 'revoked';   // kept DISTINCT from expired
  if (status === 'pending') return 'pending';
  if (!expiresOn) return 'valid';
  if (expiresOn < today) return 'expired';
  return (Date.parse(expiresOn) - Date.parse(today)) <= windowDays * 86_400_000 ? 'expiring' : 'valid';
}

/**
 * The required CREDENTIAL set for readiness — licences/clearances only. This is
 * deliberately NOT the applicant document checklist (`requiredDocsFor` in
 * recruitment/labels.ts), which includes `resume_biodata`; a résumé is a hiring
 * document, not a credential a guard must keep current. Armed posts additionally
 * require a firearms licence (LTOPF).
 */
export const READINESS_CRED_SET = (isArmedPost: boolean): readonly CredType[] => {
  const base: readonly CredType[] = [
    'nbi_clearance',
    'police_pnp_clearance',
    'barangay_clearance',
    'drug_test',
    'medical_exam',
    'neuro_psych',
    'training_cert_sbr_rtc',
    'sosia_license',
  ];
  return isArmedPost ? [...base, 'ltopf_license'] : base;
};

/**
 * Per-credential renewal windows (days) for the readiness radar — not one size.
 * A firearms licence needs a longer lead time to renew than a drug test. Types
 * absent here fall back to the caller's default window.
 */
export const CRED_WINDOW_DAYS: Partial<Record<CredType, number>> = {
  ltopf_license: 90,
  sosia_license: 90,
  nbi_clearance: 60,
  drug_test:     30,
};
