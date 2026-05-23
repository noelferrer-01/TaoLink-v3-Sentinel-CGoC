import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from './env';

import * as authSchema from '@/modules/auth/schema';
import * as auditSchema from '@/modules/audit/schema';
import * as approvalsSchema from '@/modules/approvals/schema';
import * as eventsSchema from '@/modules/events/schema';
import * as complianceSchema from '@/modules/compliance/schema';
import * as hrSchema from '@/modules/hr/schema';
import * as clientsSchema from '@/modules/clients/schema';
import * as assignmentsSchema from '@/modules/assignments/schema';

const schema = {
  ...authSchema,
  ...auditSchema,
  ...approvalsSchema,
  ...eventsSchema,
  ...complianceSchema,
  ...hrSchema,
  ...clientsSchema,
  ...assignmentsSchema,
};

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSql() {
  if (sqlClient) return sqlClient;
  const { DATABASE_URL } = getEnv();
  sqlClient = postgres(DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    prepare: false,
  });
  return sqlClient;
}

export function getDb() {
  if (dbClient) return dbClient;
  dbClient = drizzle(getSql(), { schema });
  return dbClient;
}

export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
    dbClient = null;
  }
}

export { schema };
