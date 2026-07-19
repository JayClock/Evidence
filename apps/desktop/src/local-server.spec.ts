import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildServerEnvironment,
  LocalServer,
  type LocalServerConnection,
} from './local-server';

let testRoot: string | null = null;
let server: LocalServer | null = null;

afterEach(async () => {
  await server?.stop();
  if (testRoot) {
    await rm(testRoot, { recursive: true, force: true });
  }
  testRoot = null;
  server = null;
});

describe('managed local server', () => {
  it('builds a loopback SQLite environment', () => {
    const environment = buildServerEnvironment({
      port: 32123,
      sessionToken: 'session-secret',
      userDataPath: '/tmp/evidence-user',
      rendererOrigin: 'evidence://app',
      packaged: true,
      piEntry: '/tmp/evidence-pi/cli.js',
      legacyRegistryPath: '/tmp/tauri/evidence.sqlite',
    });

    expect(environment).toMatchObject({
      ELECTRON_RUN_AS_NODE: '1',
      EVIDENCE_STORAGE: 'sqlite',
      EVIDENCE_PI_ENTRY: '/tmp/evidence-pi/cli.js',
      EVIDENCE_LEGACY_REGISTRY_PATH: '/tmp/tauri/evidence.sqlite',
      EVIDENCE_REGISTRY_PATH: '/tmp/evidence-user/data/registry.sqlite',
      EVIDENCE_DEFAULT_WORKSPACE_PATH:
        '/tmp/evidence-user/data/default-workspace',
      EVIDENCE_DESKTOP_SESSION_TOKEN: 'session-secret',
      EVIDENCE_CORS_ORIGINS: 'evidence://app',
      EVIDENCE_HOST: '127.0.0.1',
      PORT: '32123',
    });
  });

  it('starts on a random port, authenticates health, and stops', async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'evidence-managed-server-'));
    const serverEntry = join(testRoot, 'fixture.cjs');
    await writeFile(serverEntry, fixtureServerSource(), 'utf8');
    server = new LocalServer({
      executablePath: process.execPath,
      serverEntry,
      piEntry: serverEntry,
      legacyRegistryPath: join(testRoot, 'missing-legacy.sqlite'),
      userDataPath: testRoot,
      rendererOrigin: 'http://127.0.0.1:4200',
      packaged: false,
    });

    const connection: LocalServerConnection = await server.start();
    expect(connection.apiBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api$/);
    expect(connection.sessionToken).toHaveLength(43);

    const origin = new URL(connection.apiBaseUrl).origin;
    expect((await fetch(`${origin}/health`)).status).toBe(401);
    expect(
      (
        await fetch(`${origin}/health`, {
          headers: {
            'x-evidence-desktop-token': connection.sessionToken,
          },
        })
      ).status,
    ).toBe(200);
  });
});

function fixtureServerSource(): string {
  return `
    const http = require('node:http');
    const server = http.createServer((request, response) => {
      if (request.headers['x-evidence-desktop-token'] !== process.env.EVIDENCE_DESKTOP_SESSION_TOKEN) {
        response.writeHead(401).end();
        return;
      }
      response.writeHead(request.url === '/health' ? 200 : 404).end();
    });
    server.listen(Number(process.env.PORT), process.env.EVIDENCE_HOST);
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `;
}
