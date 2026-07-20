import 'dotenv/config';
import { resolve } from 'node:path';
import { migrateSeaOrmPostgres } from './migration/seaorm-postgres-migration';

async function main(): Promise<void> {
  const sourceDatabaseUrl = requiredEnvironment('SOURCE_DATABASE_URL');
  const targetDatabaseUrl = requiredEnvironment('TARGET_DATABASE_URL');
  const sourceBackupId = requiredEnvironment('SOURCE_BACKUP_ID');
  const modelRoot = resolve(
    process.env.EVIDENCE_MIGRATION_MODEL_ROOT ?? 'migrated-workspaces',
  );
  const manifestPath = resolve(
    process.env.EVIDENCE_MIGRATION_MANIFEST ?? 'migration-manifest.json',
  );
  const manifest = await migrateSeaOrmPostgres({
    sourceDatabaseUrl,
    targetDatabaseUrl,
    sourceBackupId,
    modelRoot,
    manifestPath,
    dryRun: process.env.EVIDENCE_MIGRATION_DRY_RUN === '1',
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`PostgreSQL migration failed: ${message}\n`);
  process.exitCode = 1;
});
