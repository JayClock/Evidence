import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const task = process.argv[2] ?? ':apps:server-java:bootRun';
if (task === ':apps:server-java:bootRun') {
  const environmentFile = resolve(repositoryRoot, 'apps/server-java/.env');
  if (existsSync(environmentFile)) {
    process.loadEnvFile(environmentFile);
  }
}

const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const child = spawn(gradle, [task], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  process.stderr.write(
    `Could not start Gradle task ${task}: ${error.message}\n`,
  );
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
