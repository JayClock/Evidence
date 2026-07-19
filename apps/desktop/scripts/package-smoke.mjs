import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktopRoot = resolve(import.meta.dirname, '..');
const packagesRoot = join(desktopRoot, 'dist', 'packages');
const packaged = packagedRuntime(packagesRoot);
const piEntry = join(
  packaged.resources,
  'app.asar.unpacked',
  'node_modules',
  '@earendil-works',
  'pi-coding-agent',
  'dist',
  'cli.js',
);
const testRoot = await mkdtemp(join(tmpdir(), 'evidence-package-smoke-'));
let output = '';

try {
  await Promise.all([access(packaged.executable), access(piEntry)]);
  const piResult = await run(
    packaged.executable,
    [piEntry, '--version'],
    { ELECTRON_RUN_AS_NODE: '1' },
    10_000,
  );
  output += piResult.output;
  if (piResult.exitCode !== 0 || !/\d+\.\d+\.\d+/.test(piResult.output)) {
    throw new Error('Embedded Pi CLI did not start successfully.');
  }

  const result = await run(
    packaged.executable,
    [],
    {
      EVIDENCE_DESKTOP_SMOKE_TEST: '1',
      EVIDENCE_USER_DATA_PATH: testRoot,
    },
    30_000,
  );
  output += result.output;
  if (result.exitCode !== 0) {
    throw new Error(`Packaged app exited with code ${result.exitCode}.`);
  }
  if (!result.output.includes('EVIDENCE_DESKTOP_SMOKE_READY')) {
    throw new Error('Packaged app did not report readiness.');
  }
  await access(join(testRoot, 'data', 'registry.sqlite'));
  process.stdout.write('Packaged Electron smoke test passed.\n');
} catch (error) {
  process.stderr.write(output);
  throw error;
} finally {
  await rm(testRoot, { recursive: true, force: true });
}

function packagedRuntime(root) {
  if (process.platform === 'darwin') {
    const app = join(root, `mac-${process.arch}`, 'Evidence.app', 'Contents');
    return {
      executable: join(app, 'MacOS', 'Evidence'),
      resources: join(app, 'Resources'),
    };
  }
  if (process.platform === 'win32') {
    const application = join(root, 'win-unpacked');
    return {
      executable: join(application, 'Evidence.exe'),
      resources: join(application, 'resources'),
    };
  }
  const application = join(root, 'linux-unpacked');
  return {
    executable: join(application, 'evidence'),
    resources: join(application, 'resources'),
  };
}

function run(command, args, environment, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let combinedOutput = '';
    const append = (chunk) => {
      combinedOutput += chunk.toString();
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Packaged runtime smoke test timed out.'));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode, output: combinedOutput });
    });
  });
}
