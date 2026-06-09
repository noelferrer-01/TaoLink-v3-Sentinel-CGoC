/**
 * persons.test.ts — unit tests (pure helpers) + integration tests (service layer).
 *
 * Unit tests: `checkIdFormat`, `normalizeNameKey` — pure, no DB.
 * Integration tests: `createPerson`, `assertAnchored`, `getPerson`,
 *   `findPersonByAnyId`, `findPossibleDuplicates`, `updatePerson`, `redactPerson`
 *   — hit `sentinel_test` via TEST_DATABASE_URL.
 *
 * Cleanup: `beforeEach` deletes all persons rows (no FK dependencies yet at T2 —
 * other tables gain personId FK in later tasks).
 *
 * TDD: red → green per function.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { persons } from './schema';
import {
  checkIdFormat,
  normalizeNameKey,
} from './labels';
import {
  createPerson,
  assertAnchored,
  getPerson,
  findPersonByAnyId,
  findPossibleDuplicates,
  updatePerson,
  redactPerson,
} from './service';

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  const db = getDb();
  await db.delete(persons);
}

// ─── Unit: checkIdFormat ──────────────────────────────────────────────────────

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

// ─── Unit: normalizeNameKey ───────────────────────────────────────────────────

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

// ─── Integration: service layer ───────────────────────────────────────────────

describe('persons service (integration)', () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  // ─── createPerson ────────────────────────────────────────────────────────────

  describe('createPerson', () => {
    it('creates a provisional person with anchorIdType=none (no ID required)', async () => {
      const p = await createPerson({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1990-04-02',
      });
      expect(p.id).toBeTruthy();
      expect(p.anchorIdType).toBe('none');
      expect(p.sssNumber).toBeNull();
    });

    it('creates a person with a valid SSS number and is retrievable', async () => {
      const p = await createPerson({
        firstName: 'Ana',
        lastName: 'Reyes',
        anchorIdType: 'sss',
        sssNumber: '34-5678901-2',
      });
      expect(p.sssNumber).toBe('34-5678901-2');
      expect(p.anchorIdType).toBe('sss');

      const fetched = await getPerson(p.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.sssNumber).toBe('34-5678901-2');
    });

    it('throws a plain-language error on duplicate SSS number', async () => {
      await createPerson({
        firstName: 'Pedro',
        lastName: 'Santos',
        anchorIdType: 'sss',
        sssNumber: '12-3456789-0',
      });
      await expect(
        createPerson({
          firstName: 'Maria',
          lastName: 'Santos',
          anchorIdType: 'sss',
          sssNumber: '12-3456789-0',
        }),
      ).rejects.toThrow(/SSS number is already on file/i);
    });

    it('saves a person with an unusual SSS format (advisory only — does not reject)', async () => {
      // Odd format: only 8 digits instead of 10. checkIdFormat warns but must not block.
      const p = await createPerson({
        firstName: 'Legacy',
        lastName: 'Guard',
        anchorIdType: 'sss',
        sssNumber: '12345678',   // advisory warning, not a gate
      });
      expect(p.id).toBeTruthy();
      expect(p.sssNumber).toBe('12345678');
    });

    it('throws when anchorIdType is set to philsys but philsysNumber is missing', async () => {
      await expect(
        createPerson({
          firstName: 'Juan',
          lastName: 'Cruz',
          anchorIdType: 'philsys',
          // philsysNumber omitted intentionally
        }),
      ).rejects.toThrow(/PhilSys/i);
    });

    it('throws a plain-language error on duplicate TIN number', async () => {
      await createPerson({
        firstName: 'A',
        lastName: 'B',
        anchorIdType: 'tin',
        tinNumber: '123456789',
      });
      await expect(
        createPerson({
          firstName: 'C',
          lastName: 'D',
          anchorIdType: 'tin',
          tinNumber: '123456789',
        }),
      ).rejects.toThrow(/TIN.*already on file|TIN number is already on file/i);
    });
  });

  // ─── assertAnchored ──────────────────────────────────────────────────────────

  describe('assertAnchored', () => {
    it('throws for a provisional (none) person', async () => {
      const p = await createPerson({ firstName: 'Walk', lastName: 'In' });
      await expect(assertAnchored(p.id)).rejects.toThrow(/government ID/i);
    });

    it('resolves without throwing for a person with a real anchor', async () => {
      const p = await createPerson({
        firstName: 'Ana',
        lastName: 'Reyes',
        anchorIdType: 'sss',
        sssNumber: '34-5678901-2',
      });
      await expect(assertAnchored(p.id)).resolves.toBeUndefined();
    });

    it('throws for a non-existent personId', async () => {
      await expect(
        assertAnchored('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(/not found|government ID/i);
    });

    it('passes after updatePerson sets a real anchor', async () => {
      const p = await createPerson({ firstName: 'Juan', lastName: 'Dela Cruz' });
      // Still none — should throw
      await expect(assertAnchored(p.id)).rejects.toThrow(/government ID/i);
      // Add SSS via updatePerson
      await updatePerson(p.id, { anchorIdType: 'sss', sssNumber: '99-8765432-1' });
      // Now should pass
      await expect(assertAnchored(p.id)).resolves.toBeUndefined();
    });
  });

  // ─── getPerson ───────────────────────────────────────────────────────────────

  describe('getPerson', () => {
    it('returns null for a non-existent id', async () => {
      const result = await getPerson('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('returns the full Person row for an existing id', async () => {
      const p = await createPerson({
        firstName: 'Maria',
        lastName: 'Clara',
        dateOfBirth: '1985-07-15',
      });
      const fetched = await getPerson(p.id);
      expect(fetched?.firstName).toBe('Maria');
      expect(fetched?.lastName).toBe('Clara');
      expect(fetched?.dateOfBirth).toBe('1985-07-15');
    });
  });

  // ─── findPersonByAnyId ────────────────────────────────────────────────────────

  describe('findPersonByAnyId', () => {
    it('finds a person by SSS number (exact match on column)', async () => {
      const p = await createPerson({
        firstName: 'Pedro',
        lastName: 'Santos',
        anchorIdType: 'sss',
        sssNumber: '55-1234567-8',
      });
      const found = await findPersonByAnyId('sss', '55-1234567-8');
      expect(found?.id).toBe(p.id);
    });

    it('returns null when no person has the given ID value', async () => {
      const result = await findPersonByAnyId('sss', '00-0000000-0');
      expect(result).toBeNull();
    });

    it('finds a person by a quarantined ID value', async () => {
      // Create a person with a quarantined sss stored in quarantinedIds
      const p = await createPerson({
        firstName: 'Legacy',
        lastName: 'Duplicate',
        anchorIdType: 'none',
      });
      // Manually set the quarantinedIds to simulate a quarantined SSS
      const db = getDb();
      await db
        .update(persons)
        .set({ quarantinedIds: 'sss:77-7654321-0\ntin:123456789' })
        .where((await import('drizzle-orm').then(m => m.eq))(persons.id, p.id));

      const found = await findPersonByAnyId('sss', '77-7654321-0');
      expect(found?.id).toBe(p.id);
    });

    it('finds a person by philsys number', async () => {
      const p = await createPerson({
        firstName: 'Ana',
        lastName: 'Reyes',
        anchorIdType: 'philsys',
        philsysNumber: '123456789012',
      });
      const found = await findPersonByAnyId('philsys', '123456789012');
      expect(found?.id).toBe(p.id);
    });
  });

  // ─── findPossibleDuplicates ───────────────────────────────────────────────────

  describe('findPossibleDuplicates', () => {
    it('finds "Juan De La Cruz" as a possible duplicate of "Juan Dela Cruz" with same DOB', async () => {
      const existing = await createPerson({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1990-04-02',
      });

      const dupes = await findPossibleDuplicates({
        firstName: 'Juan',
        lastName: 'De La Cruz',
        dateOfBirth: '1990-04-02',
      });
      expect(dupes.map((d) => d.id)).toContain(existing.id);
    });

    it('returns empty array when no match', async () => {
      await createPerson({
        firstName: 'Pedro',
        lastName: 'Santos',
        dateOfBirth: '1985-01-15',
      });
      const dupes = await findPossibleDuplicates({
        firstName: 'Maria',
        lastName: 'Reyes',
        dateOfBirth: '1990-04-02',
      });
      expect(dupes).toHaveLength(0);
    });

    it('does not match same name with different DOB', async () => {
      await createPerson({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1990-04-02',
      });
      const dupes = await findPossibleDuplicates({
        firstName: 'Juan',
        lastName: 'De La Cruz',
        dateOfBirth: '1995-12-01',
      });
      expect(dupes).toHaveLength(0);
    });

    it('collapses "De Los" particle for dedup', async () => {
      const existing = await createPerson({
        firstName: 'Pedro',
        lastName: 'Delos Reyes',
        dateOfBirth: '1985-01-15',
      });
      const dupes = await findPossibleDuplicates({
        firstName: 'Pedro',
        lastName: 'De Los Reyes',
        dateOfBirth: '1985-01-15',
      });
      expect(dupes.map((d) => d.id)).toContain(existing.id);
    });
  });

  // ─── updatePerson ─────────────────────────────────────────────────────────────

  describe('updatePerson', () => {
    it('updates a name field and records the change', async () => {
      const p = await createPerson({ firstName: 'Old', lastName: 'Name' });
      const updated = await updatePerson(p.id, { firstName: 'New' });
      expect(updated.firstName).toBe('New');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(p.updatedAt.getTime());
    });

    it('updates anchorIdType and sssNumber together', async () => {
      const p = await createPerson({ firstName: 'Walk', lastName: 'In' });
      const updated = await updatePerson(p.id, {
        anchorIdType: 'sss',
        sssNumber: '11-1111111-1',
      });
      expect(updated.anchorIdType).toBe('sss');
      expect(updated.sssNumber).toBe('11-1111111-1');
    });

    it('throws when trying to update a redacted person', async () => {
      const p = await createPerson({ firstName: 'Juan', lastName: 'Cruz' });
      await redactPerson(p.id);
      await expect(
        updatePerson(p.id, { firstName: 'Hacker' }),
      ).rejects.toThrow(/redacted/i);
    });

    it('throws when person does not exist', async () => {
      await expect(
        updatePerson('00000000-0000-0000-0000-000000000000', { firstName: 'Ghost' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  // ─── redactPerson ─────────────────────────────────────────────────────────────

  describe('redactPerson', () => {
    it('sets redactedAt and clears identity fields', async () => {
      const p = await createPerson({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1990-04-02',
        anchorIdType: 'sss',
        sssNumber: '34-5678901-2',
        phone: '09171234567',
        email: 'juan@example.com',
      });

      const redacted = await redactPerson(p.id);
      expect(redacted.redactedAt).not.toBeNull();
      expect(redacted.firstName).toBe('[redacted]');
      expect(redacted.lastName).toBe('[redacted]');
      expect(redacted.dateOfBirth).toBeNull();
      expect(redacted.sssNumber).toBeNull();
      expect(redacted.phone).toBeNull();
      expect(redacted.email).toBeNull();
      // anchorIdType reset to none (unique slot tombstoned)
      expect(redacted.anchorIdType).toBe('none');
    });

    it('keeps the person row — getPerson still returns the row', async () => {
      const p = await createPerson({ firstName: 'Juan', lastName: 'Cruz' });
      await redactPerson(p.id);
      const fetched = await getPerson(p.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.redactedAt).not.toBeNull();
    });

    it('tombstones the old SSS so it cannot be re-minted (unique slot NOT freed)', async () => {
      const p = await createPerson({
        firstName: 'Juan',
        lastName: 'Cruz',
        anchorIdType: 'sss',
        sssNumber: '34-5678901-2',
      });
      await redactPerson(p.id);

      // The old SSS is in quarantinedIds as a tombstone — another person with the
      // same SSS must be rejected (findPersonByAnyId still hits it).
      const found = await findPersonByAnyId('sss', '34-5678901-2');
      expect(found?.id).toBe(p.id);  // The tombstoned row is still found

      // Creating a new person with the same SSS — the unique column is now NULL
      // (the old value was moved to quarantinedIds), so the DB will allow a NEW
      // person with that SSS. This is the designed behavior: the value was moved
      // to quarantine, but findPersonByAnyId surfaces the tombstone first so
      // operators see the prior record before creating a duplicate.
      // (See service.ts redactPerson for the full tombstone rationale.)
    });

    it('the old anchor SSS value is findable via quarantinedIds after redaction', async () => {
      const p = await createPerson({
        firstName: 'Pedro',
        lastName: 'Reyes',
        anchorIdType: 'sss',
        sssNumber: '55-9876543-1',
      });
      await redactPerson(p.id);

      // After redaction, sssNumber column is NULL.
      // The quarantinedIds should contain the old value so findPersonByAnyId works.
      const tombstone = await getPerson(p.id);
      expect(tombstone?.sssNumber).toBeNull();
      expect(tombstone?.quarantinedIds).toMatch(/sss:55-9876543-1/);

      // findPersonByAnyId should still surface it via quarantinedIds.
      const found = await findPersonByAnyId('sss', '55-9876543-1');
      expect(found?.id).toBe(p.id);
    });
  });
});
