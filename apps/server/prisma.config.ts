import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Shell DATABASE_URL must win over a DIRECT_URL loaded from apps/server/.env.
// Hosted migrations should use the guarded `pnpm prisma:migrate:deploy` wrapper,
// which resolves the direct target and sets all three values to the same URL.
const databaseUrl =
  process.env.EVIDENCE_MIGRATION_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  'postgresql://postgres:postgres@localhost:5432/evidence';

export default defineConfig({
  schema: '../../libs/server/persistent/prisma/schema.prisma',
  migrations: {
    path: '../../libs/server/persistent/prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
