import { getEnv } from './env';

type ModuleDependencyReport = {
  module: string;
  requires: string[];
  ok: boolean;
  missing: string[];
};

const MODULE_DEPS: Record<string, string[]> = {
  auth: ['DATABASE_URL', 'SESSION_SECRET'],
  audit: ['DATABASE_URL'],
  approvals: ['DATABASE_URL'],
  events: ['DATABASE_URL'],
  compliance: ['DATABASE_URL'],
  hr: ['DATABASE_URL'],
  clients: ['DATABASE_URL'],
};

export function validateBoot(): ModuleDependencyReport[] {
  getEnv();

  const env = process.env;
  return Object.entries(MODULE_DEPS).map(([module, requires]) => {
    const missing = requires.filter((key) => !env[key] || env[key] === '');
    return {
      module,
      requires,
      ok: missing.length === 0,
      missing,
    };
  });
}

export function assertBoot(): void {
  const reports = validateBoot();
  const failed = reports.filter((r) => !r.ok);
  if (failed.length === 0) return;
  const message = failed
    .map((r) => `  - module "${r.module}" missing: ${r.missing.join(', ')}`)
    .join('\n');
  throw new Error(`[core/loader] Boot validation failed:\n${message}`);
}
