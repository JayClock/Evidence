import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '..', '..');
const serverSource = join(
  repositoryRoot,
  'apps',
  'server-nest',
  'dist-desktop',
);
const serverDestination = join(desktopRoot, 'dist', 'server');

await rm(serverDestination, { recursive: true, force: true });
await mkdir(serverDestination, { recursive: true });
await copyFile(
  join(serverSource, 'main.js'),
  join(serverDestination, 'main.js'),
);
await copyFile(
  join(serverSource, 'main.js.map'),
  join(serverDestination, 'main.js.map'),
);
