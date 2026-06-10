import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getActiveDatabaseUrl } from './env';

import * as authSchema from '@/modules/auth/schema';
import * as auditSchema from '@/modules/audit/schema';
import * as approvalsSchema from '@/modules/approvals/schema';
import * as eventsSchema from '@/modules/events/schema';
import * as complianceSchema from '@/modules/compliance/schema';
import * as hrSchema from '@/modules/hr/schema';
import * as clientsSchema from '@/modules/clients/schema';
import * as assignmentsSchema from '@/modules/assignments/schema';
import * as dtrSchema from '@/modules/dtr/schema';
import * as payrollCalendarsSchema from '@/modules/payroll-calendars/schema';

const schema = {
  ...authSchema,
  ...auditSchema,
  ...approvalsSchema,
  ...eventsSchema,
  ...complianceSchema,
  ...hrSchema,
  ...clientsSchema,
  ...assignmentsSchema,
  ...dtrSchema,
  ...payrollCalendarsSchema,
};

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSql() {
  if (sqlClient) return sqlClient;
  sqlClient = postgres(getActiveDatabaseUrl(), {
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

/**
 * Union of the full DB client and a Drizzle transaction object.
 * Both expose `.insert()`, `.update()`, `.delete()`, and `.select()`.
 * Pass this type to service functions that need to participate in a caller's
 * transaction (e.g. `createPerson(input, { tx })`) so the INSERT is atomic
 * with the caller's surrounding writes.
 */
export type DbOrTx =
  | ReturnType<typeof getDb>
  | PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;
