import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import {
  migrationTargetLabel,
  selectMigrationDatabaseUrl,
} from '../src/migration/prisma-target.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const envFile = resolve(repositoryRoot, 'apps/server/.env');
const fileEnvironment = {};
config({ path: envFile, processEnv: fileEnvironment, quiet: true });

const selected = selectMigrationDatabaseUrl(process.env, fileEnvironment);
process.stdout.write(
  `Applying Prisma migrations to ${migrationTargetLabel(selected)}\n`,
);

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(
  packageManager,
  ['--filter', '@evidence/server', 'exec', 'prisma', 'migrate', 'deploy'],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: selected,
      DIRECT_URL: selected,
      EVIDENCE_MIGRATION_DATABASE_URL: selected,
    },
    stdio: 'inherit',
  },
);

child.once('error', (error) => {
  process.stderr.write(`Could not start Prisma migration: ${error.message}\n`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) {
    process.stderr.write(`Prisma migration stopped by ${signal}.\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
