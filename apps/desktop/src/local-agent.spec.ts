import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentRuntimeRequest, DiagramAgentEvent } from './agent-protocol';
import { LocalAgent } from './local-agent';

const temporaryPaths: string[] = [];
const agents: LocalAgent[] = [];

afterEach(async () => {
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
});

function createAgent(runtimeEntry: string): LocalAgent {
  const agent = new LocalAgent({
    executablePath: process.execPath,
    runtimeEntry,
    packaged: false,
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
