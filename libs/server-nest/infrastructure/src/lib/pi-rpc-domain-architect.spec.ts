import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelingEvent } from '@evidence/server-nest-domain';
import { PiRpcDomainArchitect } from './pi-rpc-domain-architect.js';

const temporaryDirectories: string[] = [];

async function fixtureScript(source: string): Promise<{
  directory: string;
  script: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'evidence-pi-rpc-'));
  const script = join(directory, 'fixture.mjs');
  temporaryDirectories.push(directory);
  await writeFile(script, source);
  return { directory, script };
}

async function collect(
  events: AsyncIterable<ModelingEvent>,
): Promise<ModelingEvent[]> {
  const result: ModelingEvent[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('PiRpcDomainArchitect', () => {
  it('maps LF-delimited Pi RPC events into domain events', async () => {
    const { directory, script } = await fixtureScript(`
      const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        input += chunk;
        if (!input.includes('\\n')) return;
        const command = JSON.parse(input.trim());
        emit({ type: 'response', command: command.type, success: true });
        emit({ type: 'message_start', messageIndex: 7, message: { role: 'assistant' } });
        emit({ type: 'message_update', messageIndex: 7, assistantMessageEvent: { type: 'thinking_start' } });
        emit({ type: 'message_update', messageIndex: 7, assistantMessageEvent: { type: 'thinking_delta', delta: 'inspect\\u2028model' } });
        emit({ type: 'message_update', messageIndex: 7, assistantMessageEvent: { type: 'thinking_end' } });
        emit({ type: 'message_update', messageIndex: 7, assistantMessageEvent: { type: 'text_delta', delta: 'proposal' } });
        emit({ type: 'message_update', messageIndex: 7, assistantMessageEvent: { type: 'toolcall_start', contentIndex: 0, partial: { content: [{ id: 'call-2', name: 'read' }] } } });
        emit({ type: 'message_update', messageIndex: 7, assistantMessageEvent: { type: 'toolcall_delta', contentIndex: 0, delta: '{', partial: { content: [{ id: 'call-2', name: 'read' }] } } });
        emit({ type: 'message_update', messageIndex: 7, assistantMessageEvent: { type: 'toolcall_end', contentIndex: 0, toolCall: { id: 'call-2', name: 'read', arguments: { path: 'entities' } } } });
        emit({ type: 'tool_execution_start', toolCallId: 'call-2', toolName: 'read', args: { path: 'entities' } });
        emit({ type: 'tool_execution_update', toolCallId: 'call-2', toolName: 'read', args: { path: 'entities' }, partialResult: 'partial' });
        emit({ type: 'tool_execution_end', toolCallId: 'call-2', toolName: 'read', result: 'done', isError: false });
        emit({ type: 'message_end', message: { role: 'assistant', content: 'proposal' } });
        emit({ type: 'agent_end', messages: [{ role: 'assistant', content: 'proposal' }] });
        emit({ type: 'agent_settled' });
      });
    `);
    const architect = new PiRpcDomainArchitect({
      command: process.execPath,
      entry: script,
      timeoutMs: 2_000,
    });

    await expect(
      collect(
        architect.proposeModelStream({
          requirement: 'Add an order',
          modelDirectory: directory,
        }),
      ),
    ).resolves.toEqual([
      { type: 'reasoning-started' },
      { type: 'reasoning-chunk', chunk: 'inspect\u2028model' },
      { type: 'reasoning-ended' },
      { type: 'text-chunk', chunk: 'proposal' },
      {
        type: 'tool-call-started',
        toolCallId: 'call-2',
        toolName: 'read',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call-2',
        toolName: 'read',
        chunk: '{',
      },
      {
        type: 'tool-call-ready',
        toolCallId: 'call-2',
        toolName: 'read',
        input: { path: 'entities' },
      },
      {
        type: 'tool-execution-started',
        toolCallId: 'call-2',
        toolName: 'read',
        args: { path: 'entities' },
      },
      {
        type: 'tool-execution-updated',
        toolCallId: 'call-2',
        toolName: 'read',
        args: { path: 'entities' },
        partialResult: 'partial',
      },
      {
        type: 'tool-execution-ended',
        toolCallId: 'call-2',
        toolName: 'read',
        result: 'done',
        isError: false,
      },
      { type: 'message-ended' },
      { type: 'agent-ended' },
      { type: 'completed' },
    ]);
  });

  it('surfaces rejected Pi RPC commands as domain errors', async () => {
    const { directory, script } = await fixtureScript(`
      process.stdin.once('data', () => {
        process.stdout.write(JSON.stringify({
          type: 'response',
          command: 'prompt',
          success: false,
          error: { message: 'No model configured' }
        }) + '\\n');
      });
    `);
    const architect = new PiRpcDomainArchitect({
      command: process.execPath,
      args: [script],
      timeoutMs: 2_000,
    });

    await expect(
      collect(
        architect.proposeModelStream({
          requirement: 'Add an order',
          modelDirectory: directory,
        }),
      ),
    ).rejects.toMatchObject({
      kind: 'internal',
      message: 'No model configured',
    });
  });

  it('terminates an unresponsive Pi RPC process at the configured timeout', async () => {
    const { directory, script } = await fixtureScript(`
      process.stdin.resume();
      setInterval(() => undefined, 1_000);
    `);
    const architect = new PiRpcDomainArchitect({
      command: process.execPath,
      args: [script],
      timeoutMs: 50,
    });

    await expect(
      collect(
        architect.proposeModelStream({
          requirement: 'Add an order',
          modelDirectory: directory,
        }),
      ),
    ).rejects.toMatchObject({
      kind: 'internal',
      message: 'Pi RPC request timed out after 50ms',
    });
  });
});
