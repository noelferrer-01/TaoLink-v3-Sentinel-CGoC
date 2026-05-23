import { seedComplianceRates } from '@/modules/compliance/seed';
import { closeDb } from '@/core/db';

async function main() {
  await seedComplianceRates();
  console.log('Compliance rates seeded.');
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
