import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeRequest, DiagramAgentEvent } from './agent-protocol';
import { LocalAgent } from './local-agent';

const temporaryPaths: string[] = [];
const agents: LocalAgent[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(agents.splice(0).map((agent) => agent.stop()));
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('LocalAgent', () => {
  it('streams validated events from an isolated runtime process', async () => {
    const runtimeEntry = await fixtureRuntime(`
      let input = '';
      process.stdin.on('data', (chunk) => input += chunk);
      process.stdin.on('end', () => {
        const request = JSON.parse(input);
        process.stdout.write(JSON.stringify({ id: request.id, event: null, data: 'Applied remotely.' }) + '\\n');
        process.stdout.write(JSON.stringify({ id: request.id, event: 'complete', data: '' }) + '\\n');
      });
    `);
    const agent = createAgent(runtimeEntry);
    const events: DiagramAgentEvent[] = [];

    await agent.run(request('request-1'), (event) => events.push(event));

    expect(events).toEqual([
      { id: 'request-1', event: null, data: 'Applied remotely.' },
      { id: 'request-1', event: 'complete', data: '' },
    ]);
  });

  it('does not inherit unrelated Desktop secrets', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://database-secret');
    vi.stubEnv('EVIDENCE_API_AUTHORIZATION', 'Bearer desktop-secret');
    const runtimeEntry = await fixtureRuntime(`
      let input = '';
      process.stdin.on('data', (chunk) => input += chunk);
      process.stdin.on('end', () => {
        const request = JSON.parse(input);
        const data = JSON.stringify({
          databaseUrl: process.env.DATABASE_URL ?? null,
          desktopAuthorization: process.env.EVIDENCE_API_AUTHORIZATION ?? null,
          explicitProviderKey: process.env.EXPLICIT_PROVIDER_KEY ?? null,
        });
        process.stdout.write(JSON.stringify({ id: request.id, event: null, data }) + '\\n');
        process.stdout.write(JSON.stringify({ id: request.id, event: 'complete', data: '' }) + '\\n');
      });
    `);
    const agent = createAgent(runtimeEntry, {
      EXPLICIT_PROVIDER_KEY: 'provider-secret',
    });
    const events: DiagramAgentEvent[] = [];

    await agent.run(request('request-env'), (event) => events.push(event));

    expect(JSON.parse(events[0]?.data ?? '{}')).toEqual({
      databaseUrl: null,
      desktopAuthorization: null,
      explicitProviderKey: 'provider-secret',
    });
  });

  it('rejects malformed runtime output instead of forwarding it to the renderer', async () => {
    const runtimeEntry = await fixtureRuntime(`
      process.stdin.resume();
      process.stdin.on('end', () => process.stdout.write('not-json\\n'));
    `);
    const agent = createAgent(runtimeEntry);

    await expect(
      agent.run(request('request-2'), () => undefined),
    ).rejects.toThrow('invalid JSON');
  });

  it('drains the final runtime event before handling a non-zero exit', async () => {
    const runtimeEntry = await fixtureRuntime(`
      let input = '';
      process.stdin.on('data', (chunk) => input += chunk);
      process.stdin.on('end', () => {
        const request = JSON.parse(input);
        process.stdout.write(JSON.stringify({ id: request.id, event: 'error', data: 'Provider failed.' }) + '\\n');
        process.exitCode = 1;
      });
    `);
    const agent = createAgent(runtimeEntry);
    const events: DiagramAgentEvent[] = [];

    await expect(
      agent.run(request('request-error'), (event) => events.push(event)),
    ).rejects.toThrow('exited unexpectedly');
    expect(events).toEqual([
      {
        id: 'request-error',
        event: 'error',
        data: 'Provider failed.',
      },
    ]);
  });
});

function createAgent(
  runtimeEntry: string,
  environment?: NodeJS.ProcessEnv,
): LocalAgent {
  const agent = new LocalAgent({
    executablePath: process.execPath,
    runtimeEntry,
    packaged: false,
    environment,
  });
  agents.push(agent);
  return agent;
}

function request(id: string): AgentRuntimeRequest {
  return {
    id,
    apiBaseUrl: 'https://api.example.test/api',
    requirement: 'Create a contract.',
    logicalEntitiesHref: '/api/workspaces/workspace-1/logical-entities',
    logicalRelationshipsHref:
      '/api/workspaces/workspace-1/logical-relationships',
  };
}

async function fixtureRuntime(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-agent-runtime-'));
  temporaryPaths.push(root);
  const runtimeEntry = join(root, 'runtime.cjs');
  await writeFile(runtimeEntry, source, 'utf8');
  return runtimeEntry;
}
