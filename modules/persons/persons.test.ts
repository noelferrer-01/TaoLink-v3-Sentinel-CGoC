/**
 * persons.test.ts — unit tests for the pure helper functions in labels.ts.
 *
 * These tests cover `checkIdFormat` and `normalizeNameKey` — both are pure
 * (no DB, no network) so they run fast in any environment.
 *
 * TDD: red → green pass required before the commit.
 */

import { describe, it, expect } from 'vitest';
import { checkIdFormat, normalizeNameKey } from './labels';

// ─── checkIdFormat ────────────────────────────────────────────────────────────

describe('checkIdFormat', () => {
  // philsys — 12-digit or 16-digit (after stripping separators)
  it('accepts a valid 12-digit PhilSys number', () => {
    expect(checkIdFormat('philsys', '1234 5678 9012')).toBeNull();
  });

  it('accepts a valid 16-digit PhilSys card number', () => {
    expect(checkIdFormat('philsys', '1234-5678-9012-3456')).toBeNull();
  });

  it('warns on an 8-digit PhilSys number (too short)', () => {
    const result = checkIdFormat('philsys', '12345678');
    expect(result).not.toBeNull();
    expect(result).toMatch(/double-check/i);
    expect(result).toMatch(/still save/i);
  });

  // sss — exactly 10 digits
  it('accepts a valid 10-digit SSS number', () => {
    expect(checkIdFormat('sss', '12-3456789-0')).toBeNull();   // strips separators → 10 digits
  });

  it('warns on an 8-digit SSS number', () => {
    const result = checkIdFormat('sss', '12345678');
    expect(result).not.toBeNull();
    expect(result).toMatch(/SSS/i);
  });

  // tin — 9 digits (base) or 12 digits (base + branch)
  it('accepts a valid 9-digit TIN', () => {
    expect(checkIdFormat('tin', '123456789')).toBeNull();
  });

  it('accepts a valid 12-digit TIN with branch code', () => {
    expect(checkIdFormat('tin', '123-456-789-000')).toBeNull(); // strips → 12 digits
  });

  it('warns on a 7-digit TIN', () => {
    const result = checkIdFormat('tin', '1234567');
    expect(result).not.toBeNull();
    expect(result).toMatch(/TIN/i);
  });

  // passport — lenient (length >= 4 after stripping)
  it('accepts a passport number 4+ chars long', () => {
    expect(checkIdFormat('passport', 'P1234567A')).toBeNull();
  });

  it('accepts a short-ish passport (4 chars)', () => {
    expect(checkIdFormat('passport', 'AB12')).toBeNull();
  });

  it('warns on a passport number under 4 chars', () => {
    const result = checkIdFormat('passport', 'AB');
    expect(result).not.toBeNull();
    expect(result).toMatch(/double-check/i);
  });

  // umid / drivers_license — same lenient rule
  it('accepts a UMID with 4+ chars', () => {
    expect(checkIdFormat('umid', 'CRN-1234')).toBeNull();
  });

  it('accepts a DL with 4+ chars', () => {
    expect(checkIdFormat('drivers_license', 'D01-23-456789')).toBeNull();
  });

  // none — always returns null (not a real ID type to validate)
  it('returns null for anchorIdType none', () => {
    expect(checkIdFormat('none', '')).toBeNull();
    expect(checkIdFormat('none', 'anything')).toBeNull();
  });

  // CRITICAL: must never throw regardless of input
  it('never throws on empty string', () => {
    expect(() => checkIdFormat('sss', '')).not.toThrow();
    const result = checkIdFormat('sss', '');
    expect(result).not.toBeNull();      // empty is "unusual" — warn, not throw
  });

  it('never throws on junk input', () => {
    expect(() => checkIdFormat('tin', '!@#$%^&*()')).not.toThrow();
  });

  it('strips spaces and hyphens before checking (format-friendly)', () => {
    // SSS cards are printed as "XX-XXXXXXX-X" (12 chars with dashes = 10 digits)
    expect(checkIdFormat('sss', '12-3456789-0')).toBeNull();
    // PhilSys is printed with spaces: "XXXX XXXX XXXX" = 12 digits
    expect(checkIdFormat('philsys', '1234 5678 9012')).toBeNull();
  });
});

// ─── normalizeNameKey ─────────────────────────────────────────────────────────

describe('normalizeNameKey', () => {
  it('returns last|first|dob key (lowercase)', () => {
    expect(normalizeNameKey('Juan', 'Cruz', '1990-04-02')).toBe('cruz|juan|1990-04-02');
  });

  it('collapses "Dela" and "De La" to the same key', () => {
    const a = normalizeNameKey('Juan', 'Dela Cruz', '1990-04-02');
    const b = normalizeNameKey('Juan', 'De La Cruz', '1990-04-02');
    expect(a).toBe(b);
  });

  it('collapses "De La" (with extra spacing) and "dela" to the same key', () => {
    const a = normalizeNameKey('Juan', 'De  La  Cruz', '1990-04-02');
    const b = normalizeNameKey('Juan', 'delacruz', '1990-04-02');
    expect(a).toBe(b);
  });

  it('collapses whitespace in names', () => {
    const a = normalizeNameKey('Juan  ', '  Cruz  ', '1990-04-02');
    const b = normalizeNameKey('Juan', 'Cruz', '1990-04-02');
    expect(a).toBe(b);
  });

  it('handles null DOB (falls back to empty string)', () => {
    const key = normalizeNameKey('Ana', 'Reyes', null);
    expect(key).toBe('reyes|ana|');
  });

  it('handles undefined DOB', () => {
    const key = normalizeNameKey('Ana', 'Reyes', undefined);
    expect(key).toBe('reyes|ana|');
  });

  it('is case-insensitive', () => {
    const a = normalizeNameKey('JUAN', 'DELA CRUZ', '1990-04-02');
    const b = normalizeNameKey('juan', 'dela cruz', '1990-04-02');
    expect(a).toBe(b);
  });

  it('collapses "De Los" particle', () => {
    const a = normalizeNameKey('Pedro', 'De Los Reyes', '1985-01-15');
    const b = normalizeNameKey('Pedro', 'Delos Reyes', '1985-01-15');
    expect(a).toBe(b);
  });
});
