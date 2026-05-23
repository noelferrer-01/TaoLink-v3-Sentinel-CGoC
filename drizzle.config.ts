import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required (drizzle.config.ts). Copy .env.example to .env.');
}

export default defineConfig({
  schema: './modules/*/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
