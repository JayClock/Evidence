import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { format, resolveConfig } from 'prettier';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const source = resolve('libs/contracts/evidence.openapi');
const client = resolve('libs/web/api-client/src/lib/openapi-schema.ts');
const openapiPackage = require.resolve('openapi-typescript/package.json');
const openapiManifest = await readJsonFile(openapiPackage);
const openapiCli = resolve(
  dirname(openapiPackage),
  openapiManifest.bin['openapi-typescript'],
);
const mode = process.argv[2];

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse JSON from ${path}`, { cause: error });
  }
}

async function generateClient() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [openapiCli, source],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const prettierConfig = (await resolveConfig(client)) ?? {};
  return format(stdout, { ...prettierConfig, filepath: client });
}

if (mode === '--write') {
  await writeFile(client, await generateClient(), 'utf8');
} else if (mode === '--check') {
  const [expected, actual] = await Promise.all([
    generateClient(),
    readFile(client, 'utf8'),
  ]);
  if (actual !== expected) {
    throw new Error(
      'The generated Web API schema is stale; run pnpm api:generate.',
    );
  }
} else if (!mode) {
  process.stdout.write(await readFile(source, 'utf8'));
} else {
  throw new Error(`Unknown OpenAPI export mode: ${mode}`);
}
