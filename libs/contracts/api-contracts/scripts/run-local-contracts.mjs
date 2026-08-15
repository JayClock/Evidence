import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must point to a migrated disposable PostgreSQL database.',
  );
}
assertDisposableDatabase(databaseUrl);

const testRoot = await mkdtemp(join(tmpdir(), 'evidence-contracts-'));
const port = await reservePort();
const origin = `http://127.0.0.1:${port}`;
const authorization = 'Bearer evidence-contract-test';
const serverEntry = resolve('apps/server/dist/main.js');
const server = spawn(process.execPath, [serverEntry], {
  cwd: testRoot,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    EVIDENCE_API_AUTHORIZATION: authorization,
    EVIDENCE_AUTH_MODE: 'local',
    EVIDENCE_USER_ID: 'desktop-user',
    EVIDENCE_USER_NAME: 'Desktop User',
    EVIDENCE_USER_EMAIL: 'desktop@evidence.local',
    EVIDENCE_DEFAULT_WORKSPACE_PATH: join(testRoot, 'default-workspace'),
    EVIDENCE_WORKSPACE_STORAGE_ROOT: join(testRoot, 'workspace-models'),
    EVIDENCE_HOST: '127.0.0.1',
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => (serverOutput += chunk.toString()));
server.stderr.on('data', (chunk) => (serverOutput += chunk.toString()));

try {
  await waitForHealth(`${origin}/health`, server);
  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = await run(
    packageManager,
    [
      'exec',
      'vitest',
      'run',
      '--config',
      'libs/contracts/api-contracts/vitest.config.mts',
    ],
    { API_AUTHORIZATION: authorization, API_BASE_URL: origin },
  );
  if (result !== 0) {
    throw new Error(`API contracts exited with status ${String(result)}`);
  }
} catch (error) {
  process.stderr.write(serverOutput);
  throw error;
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
  await rm(testRoot, { recursive: true, force: true });
}

function assertDisposableDatabase(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  const loopback = new Set(['127.0.0.1', '::1', 'localhost']);
  if (
    !loopback.has(url.hostname) &&
    process.env.EVIDENCE_ALLOW_REMOTE_CONTRACT_DATABASE !== '1'
  ) {
    throw new Error(
      'Local API contracts refuse a remote database. Set EVIDENCE_ALLOW_REMOTE_CONTRACT_DATABASE=1 only for a disposable target.',
    );
  }
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const reservation = createServer();
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      const address = reservation.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not reserve a contract-test port.'));
        return;
      }
      reservation.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Nest contract server exited with ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is not listening yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error('Timed out waiting for the Nest contract server.');
}

function run(command, args, environment) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...environment },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => resolveRun(code));
  });
}
