import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktopRoot = resolve(import.meta.dirname, '..');
const packagesRoot = join(desktopRoot, 'dist', 'packages');
const executable = packagedExecutable(packagesRoot);
const testRoot = await mkdtemp(join(tmpdir(), 'evidence-package-smoke-'));
let output = '';

try {
  await access(executable);
  const result = await run(executable, testRoot);
  output = result.output;
  if (result.exitCode !== 0) {
    throw new Error(`Packaged app exited with code ${result.exitCode}.`);
  }
  if (!output.includes('EVIDENCE_DESKTOP_SMOKE_READY')) {
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

function packagedExecutable(root) {
  if (process.platform === 'darwin') {
    return join(
      root,
      `mac-${process.arch}`,
      'Evidence.app',
      'Contents',
      'MacOS',
      'Evidence',
    );
  }
  if (process.platform === 'win32') {
    return join(root, 'win-unpacked', 'Evidence.exe');
  }
  return join(root, 'linux-unpacked', 'evidence');
}

function run(command, userDataPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [], {
      env: {
        ...process.env,
        EVIDENCE_DESKTOP_SMOKE_TEST: '1',
        EVIDENCE_USER_DATA_PATH: userDataPath,
      },
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
      reject(new Error('Packaged app smoke test timed out.'));
    }, 30_000);
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
