import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('libs/server/api/openapi.yaml');
const target = resolve('contracts/api.yaml');
const document = await readFile(source, 'utf8');
const mode = process.argv[2];

if (mode === '--write') {
  await writeFile(target, document, 'utf8');
} else if (mode === '--check') {
  const generated = await readFile(target, 'utf8');
  if (generated !== document) {
    throw new Error(
      'contracts/api.yaml is stale; run pnpm api:generate to update it.',
    );
  }
} else {
  process.stdout.write(document);
}
