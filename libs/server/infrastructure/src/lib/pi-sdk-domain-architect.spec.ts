import { describe, expect, it, vi } from 'vitest';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import type { ModelingEvent } from '@evidence/server-domain';
import { PiSdkDomainArchitect } from './pi-sdk-domain-architect.js';

type EventListener = (event: AgentSessionEvent) => void;
type PromptOptions = Parameters<AgentSession['prompt']>[1];

function fakeSession(
  run: (emit: EventListener, options?: PromptOptions) => Promise<void> | void,
) {
  let listener: EventListener = () => undefined;
  const session = {
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(),
    prompt: vi.fn(async (_text: string, options?: PromptOptions) => {
      options?.preflightResult?.(true);
      await run((event) => listener(event), options);
    }),
    subscribe: vi.fn((next: EventListener) => {
      listener = next;
      return () => {
        listener = () => undefined;
      };
    }),
  };
  return session;
}

function event(value: unknown): AgentSessionEvent {
  return value as AgentSessionEvent;
}

async function collect(
  events: AsyncIterable<ModelingEvent>,
): Promise<ModelingEvent[]> {
  const result: ModelingEvent[] = [];
  for await (const item of events) {
    result.push(item);
  }
  return result;
}

describe('PiSdkDomainArchitect', () => {
  it('maps Pi SDK session events into domain events', async () => {
    const session = fakeSession((emit) => {
      emit(
        event({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'thinking_start',
            contentIndex: 0,
            partial: { content: [] },
          },
        }),
      );
      emit(
        event({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'thinking_delta',
            contentIndex: 0,
            delta: 'inspect\u2028model',
            partial: { content: [] },
          },
        }),
      );
      emit(
        event({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'thinking_end',
            contentIndex: 0,
            content: 'inspect\u2028model',
            partial: { content: [] },
          },
        }),
      );
      emit(
        event({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'text_delta',
            contentIndex: 0,
            delta: 'proposal',
            partial: { content: [] },
          },
        }),
      );
      const partial = {
        content: [
          {
            type: 'toolCall',
            id: 'call-2',
            name: 'read',
            arguments: {},
          },
        ],
      };
      emit(
        event({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'toolcall_start',
            contentIndex: 0,
            partial,
          },
        }),
      );
      emit(
        event({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'toolcall_delta',
            contentIndex: 0,
            delta: '{',
            partial,
          },
        }),
      );
      emit(
        event({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'toolcall_end',
            contentIndex: 0,
            toolCall: {
              type: 'toolCall',
              id: 'call-2',
              name: 'read',
              arguments: { path: 'entities' },
            },
            partial,
          },
        }),
      );
      emit(
        event({
          type: 'tool_execution_start',
          toolCallId: 'call-2',
          toolName: 'read',
          args: { path: 'entities' },
        }),
      );
      emit(
        event({
          type: 'tool_execution_update',
          toolCallId: 'call-2',
          toolName: 'read',
          args: { path: 'entities' },
          partialResult: 'partial',
        }),
      );
      emit(
        event({
          type: 'tool_execution_end',
          toolCallId: 'call-2',
          toolName: 'read',
          result: 'done',
          isError: false,
        }),
      );
      const assistant = {
        role: 'assistant',
        content: [{ type: 'text', text: 'proposal' }],
        stopReason: 'stop',
      };
      emit(event({ type: 'message_end', message: assistant }));
      emit(
        event({
          type: 'agent_end',
          messages: [assistant],
          willRetry: false,
        }),
      );
      emit(event({ type: 'agent_settled' }));
    });
    const createSession = vi.fn(async () => session);
    const architect = new PiSdkDomainArchitect({
      createSession,
      timeoutMs: 2_000,
    });

    await expect(
      collect(
        architect.proposeModelStream({
          requirement: 'Add an order',
          modelDirectory: '/projects/orders/.evidence',
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
    expect(createSession).toHaveBeenCalledWith('/projects/orders/.evidence');
    expect(session.prompt).toHaveBeenCalledWith('Add an order', {
      expandPromptTemplates: false,
      preflightResult: expect.any(Function),
    });
    expect(session.abort).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it('surfaces Pi SDK prompt failures as domain errors', async () => {
    const session = fakeSession(() => {
      throw new Error('No model configured');
    });
    const architect = new PiSdkDomainArchitect({
      createSession: async () => session,
      timeoutMs: 2_000,
    });

    await expect(
      collect(
        architect.proposeModelStream({
          requirement: 'Add an order',
          modelDirectory: '/projects/orders/.evidence',
        }),
      ),
    ).rejects.toMatchObject({
      kind: 'internal',
      message: 'No model configured',
    });
  });

  it('aborts an unresponsive Pi SDK session at the configured timeout', async () => {
    const session = fakeSession(() => new Promise<void>(() => undefined));
    const architect = new PiSdkDomainArchitect({
      createSession: async () => session,
      timeoutMs: 50,
    });

    await expect(
      collect(
        architect.proposeModelStream({
          requirement: 'Add an order',
          modelDirectory: '/projects/orders/.evidence',
        }),
      ),
    ).rejects.toMatchObject({
      kind: 'internal',
      message: 'Pi SDK request timed out after 50ms',
    });
    expect(session.abort).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });
});
