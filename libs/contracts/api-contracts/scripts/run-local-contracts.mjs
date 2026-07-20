import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const testRoot = await mkdtemp(join(tmpdir(), 'evidence-contracts-'));
const port = await reservePort();
const origin = `http://127.0.0.1:${port}`;
const serverEntry = resolve('apps/server/dist-desktop/main.js');
const piEntry = resolve('libs/contracts/api-contracts/fixtures/fake-pi.mjs');
const server = spawn(process.execPath, [serverEntry], {
  cwd: testRoot,
  env: {
    ...process.env,
    EVIDENCE_DESKTOP_SESSION_TOKEN: '',
    EVIDENCE_REGISTRY_PATH: join(testRoot, 'registry.sqlite'),
    EVIDENCE_DEFAULT_WORKSPACE_PATH: join(testRoot, 'default-workspace'),
    EVIDENCE_LEGACY_REGISTRY_PATH: join(testRoot, 'missing-legacy.sqlite'),
    EVIDENCE_PI_ENTRY: piEntry,
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
    {
      API_BASE_URL: origin,
      CONTRACT_WORKSPACE_ROOT: join(testRoot, 'workspaces'),
    },
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
      if ((await fetch(url)).ok) return;
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
