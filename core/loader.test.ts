import { describe, it, expect } from 'vitest';
import { validateBoot, assertBoot } from './loader';

describe('core/loader', () => {
  it('reports all modules as ok when env vars are present', () => {
    const reports = validateBoot();
    for (const r of reports) {
      expect(r.ok, `module ${r.module} missing: ${r.missing.join(', ')}`).toBe(true);
    }
  });

  it('assertBoot does not throw when env is valid', () => {
    expect(() => assertBoot()).not.toThrow();
  });
});
