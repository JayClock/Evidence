import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import type { DiagramResource, State } from '@evidence/api-client';

import { createDiagramProposalTransport } from '../../lib/ai/diagram-proposal-transport';

function sseResponse(text: string): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

afterEach(() => {
  delete (globalThis as { evidenceDesktop?: unknown }).evidenceDesktop;
});

function diagramState(fetch: (init?: RequestInit) => Promise<Response>) {
  (globalThis as { evidenceDesktop?: unknown }).evidenceDesktop = {
    runDiagramAgent: vi.fn(
      async (
        request: {
          id: string;
          requirement: string;
        },
        onEvent: (event: {
          id: string;
          event: string | null;
          data: string;
        }) => void,
      ) => {
        const response = await fetch({
          method: 'POST',
          body: JSON.stringify({ requirement: request.requirement }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || 'Desktop agent failed.');
        }

        for (const event of parseAgentEvents(await response.text())) {
          onEvent({ id: request.id, ...event });
        }
      },
    ),
    cancelDiagramAgent: vi.fn(async () => undefined),
  };

  return {
    follow: vi.fn((relation: string) => ({
      uri: `https://api.example.test/api/workspaces/ws/${
        relation === 'logical-entities'
          ? 'logical-entities'
          : 'logical-relationships'
      }`,
    })),
    getLink: vi.fn(),
  } as unknown as State<DiagramResource>;
}

function parseAgentEvents(text: string): Array<{
  event: string | null;
  data: string;
}> {
  return text
    .replaceAll('\r\n', '\n')
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      let event: string | null = null;
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim() || null;
        } else if (line.startsWith('data:')) {
          const value = line.slice('data:'.length);
          data.push(value.startsWith(' ') ? value.slice(1) : value);
        }
      }
      return { event, data: data.join('\n') };
    });
}

async function readChunks(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  return chunks;
}

function userMessage(text: string): UIMessage {
  return {
    id: `user-${text}`,
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

describe('createDiagramProposalTransport', () => {
  it('does not fall back to a Server modeling endpoint outside Desktop', async () => {
    const state = {
      follow: vi.fn(),
      getLink: vi.fn(),
    } as unknown as State<DiagramResource>;
    const transport = createDiagramProposalTransport(state);

    await expect(
      transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages: [userMessage('model this requirement')],
        abortSignal: undefined,
      }),
    ).rejects.toThrow('available in Evidence Desktop only');
    expect(state.follow).not.toHaveBeenCalled();
  });

  it('sends only the latest user message as the diagram AI requirement', async () => {
    const fetch = vi.fn(async () => sseResponse('data: {}\n\n'));
    const state = diagramState(fetch);
    const transport = createDiagramProposalTransport(state);

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [
        userMessage('older requirement'),
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: '{}' }],
        },
        userMessage('latest requirement'),
      ],
      abortSignal: undefined,
    });

    expect(state.follow).toHaveBeenCalledWith('logical-entities');
    expect(state.follow).toHaveBeenCalledWith('logical-relationships');
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ requirement: 'latest requirement' }),
      }),
    );
  });

  it('runs the desktop agent locally with remote HAL model links', async () => {
    const runDiagramAgent = vi.fn(
      async (
        request: {
          id: string;
          requirement: string;
          logicalEntitiesHref: string;
          logicalRelationshipsHref: string;
        },
        onEvent: (event: {
          id: string;
          event: string | null;
          data: string;
        }) => void,
      ) => {
        onEvent({ id: request.id, event: null, data: 'Updated remotely.' });
        onEvent({ id: request.id, event: 'complete', data: '' });
      },
    );
    (globalThis as { evidenceDesktop?: unknown }).evidenceDesktop = {
      getApiBaseUrl: vi.fn(async () => 'https://api.example.test/api'),
      chooseDirectory: vi.fn(async () => null),
      runDiagramAgent,
      cancelDiagramAgent: vi.fn(async () => undefined),
    };
    const fetch = vi.fn(async () => sseResponse(''));
    const state = {
      follow: vi.fn((relation: string) => ({
        uri: `https://api.example.test/api/workspaces/ws/${
          relation === 'logical-entities'
            ? 'logical-entities'
            : 'logical-relationships'
        }`,
        fetch,
      })),
      getLink: vi.fn(),
    } as unknown as State<DiagramResource>;
    const transport = createDiagramProposalTransport(state);

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('create a contract')],
      abortSignal: undefined,
    });

    await expect(readChunks(stream)).resolves.toEqual([
      { type: 'text-start', id: 'diagram-model-response' },
      {
        type: 'text-delta',
        id: 'diagram-model-response',
        delta: 'Updated remotely.',
      },
      { type: 'text-end', id: 'diagram-model-response' },
      { type: 'finish', finishReason: 'stop' },
    ]);
    expect(runDiagramAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: 'create a contract',
        logicalEntitiesHref:
          'https://api.example.test/api/workspaces/ws/logical-entities',
        logicalRelationshipsHref:
          'https://api.example.test/api/workspaces/ws/logical-relationships',
      }),
      expect.any(Function),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('converts desktop text events into AI SDK text chunks', async () => {
    const fetch = vi.fn(async () =>
      sseResponse(
        [
          'data: Hello',
          '',
          'data: world',
          '',
          'event: complete',
          'data: ',
          '',
        ].join('\n'),
      ),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('hello')],
      abortSignal: undefined,
    });

    const chunks = await readChunks(stream);

    expect(chunks).toEqual([
      { type: 'text-start', id: 'diagram-model-response' },
      { type: 'text-delta', id: 'diagram-model-response', delta: 'Hello' },
      { type: 'text-delta', id: 'diagram-model-response', delta: 'world' },
      { type: 'text-end', id: 'diagram-model-response' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('converts desktop proposal tool events into AI SDK tool chunks', async () => {
    const proposal = {
      summary: 'Draft',
      changes: {
        addEntities: [],
        updateEntities: [],
        deleteEntities: [],
        addRelationships: [],
        updateRelationships: [],
        deleteRelationships: [],
      },
    };
    const fetch = vi.fn(async () =>
      sseResponse(
        [
          'event: tool-call-start',
          'data: {"toolCallId":"submit-modeling-proposal-1","toolName":"submit_modeling_proposal"}',
          '',
          'event: tool-call-delta',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', chunk: '{"summary":' })}`,
          '',
          'event: tool-call-delta',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', chunk: '"Draft"}' })}`,
          '',
          'event: tool-call',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', input: proposal })}`,
          '',
          'event: tool-execution-end',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', result: { details: { proposal } }, isError: false })}`,
          '',
          'event: complete',
          'data: ',
          '',
        ].join('\n'),
      ),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('model this requirement')],
      abortSignal: undefined,
    });

    const chunks = await readChunks(stream);

    expect(chunks).toEqual([
      {
        type: 'tool-input-start',
        toolCallId: 'submit-modeling-proposal-1',
        toolName: 'submit_modeling_proposal',
        dynamic: true,
      },
      {
        type: 'tool-input-available',
        toolCallId: 'submit-modeling-proposal-1',
        toolName: 'submit_modeling_proposal',
        input: proposal,
        dynamic: true,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'submit-modeling-proposal-1',
        output: { details: { proposal } },
        dynamic: true,
        preliminary: false,
      },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('converts desktop tool events into AI SDK tool chunks', async () => {
    const fetch = vi.fn(async () =>
      sseResponse(
        [
          'event: tool-call-start',
          'data: {"toolCallId":"call-1","toolName":"bash"}',
          '',
          'event: tool-call-delta',
          'data: {"toolCallId":"call-1","toolName":"bash","chunk":"{\\"command\\":"}',
          '',
          'event: tool-call-delta',
          'data: {"toolCallId":"call-1","toolName":"bash","chunk":"\\"ls\\"}"}',
          '',
          'event: tool-call',
          'data: {"toolCallId":"call-1","toolName":"bash","input":{"command":"ls"}}',
          '',
          'event: tool-execution-update',
          'data: {"toolCallId":"call-1","toolName":"bash","args":{"command":"ls"},"partialResult":{"content":[{"type":"text","text":"README.md"}]}}',
          '',
          'event: tool-execution-end',
          'data: {"toolCallId":"call-1","toolName":"bash","args":{"command":"ls"},"result":{"content":[{"type":"text","text":"README.md"}]},"isError":false}',
          '',
          'event: complete',
          'data: ',
          '',
        ].join('\n'),
      ),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('model this requirement')],
      abortSignal: undefined,
    });

    const chunks = await readChunks(stream);

    expect(chunks).toEqual([
      {
        type: 'tool-input-start',
        toolCallId: 'call-1',
        toolName: 'bash',
        dynamic: true,
      },
      {
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'bash',
        input: { command: 'ls' },
        dynamic: true,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call-1',
        output: { content: [{ type: 'text', text: 'README.md' }] },
        dynamic: true,
        preliminary: true,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call-1',
        output: { content: [{ type: 'text', text: 'README.md' }] },
        dynamic: true,
        preliminary: false,
      },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('finishes after proposal tool output', async () => {
    const proposal = {
      summary: 'Streaming',
      changes: {
        addEntities: [],
        updateEntities: [],
        deleteEntities: [],
        addRelationships: [],
        updateRelationships: [],
        deleteRelationships: [],
      },
    };
    const fetch = vi.fn(async () =>
      sseResponse(
        [
          'event: tool-call',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', input: proposal })}`,
          '',
          'event: tool-execution-end',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', result: { details: { proposal } }, isError: false })}`,
          '',
          'event: complete',
          'data: ',
          '',
        ].join('\n'),
      ),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('model this requirement')],
      abortSignal: undefined,
    });

    const chunks = await readChunks(stream);

    expect(chunks).toEqual([
      {
        type: 'tool-input-available',
        toolCallId: 'submit-modeling-proposal-1',
        toolName: 'submit_modeling_proposal',
        input: proposal,
        dynamic: true,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'submit-modeling-proposal-1',
        output: { details: { proposal } },
        dynamic: true,
        preliminary: false,
      },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('converts thinking SSE events into reasoning chunks', async () => {
    const proposal = {
      summary: 'Done',
      changes: {
        addEntities: [],
        updateEntities: [],
        deleteEntities: [],
        addRelationships: [],
        updateRelationships: [],
        deleteRelationships: [],
      },
    };
    const fetch = vi.fn(async () =>
      sseResponse(
        [
          'event: thinking-start',
          'data: ',
          '',
          'event: thinking',
          'data:  Identify the contract evidence.',
          '',
          'event: thinking',
          'data:  Then connect fulfillment confirmations.',
          '',
          'event: thinking-end',
          'data: ',
          '',
          'event: tool-call-start',
          'data: {"toolCallId":"submit-modeling-proposal-1","toolName":"submit_modeling_proposal"}',
          '',
          'event: tool-call-delta',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', chunk: '{"summary":"Done"}' })}`,
          '',
          'event: tool-call',
          `data: ${JSON.stringify({ toolCallId: 'submit-modeling-proposal-1', toolName: 'submit_modeling_proposal', input: proposal })}`,
          '',
          'event: complete',
          'data: ',
          '',
        ].join('\n'),
      ),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('model this requirement')],
      abortSignal: undefined,
    });

    const chunks = await readChunks(stream);

    expect(chunks).toEqual([
      { type: 'reasoning-start', id: 'diagram-model-thinking' },
      {
        type: 'reasoning-delta',
        id: 'diagram-model-thinking',
        delta: ' Identify the contract evidence.',
      },
      {
        type: 'reasoning-delta',
        id: 'diagram-model-thinking',
        delta: ' Then connect fulfillment confirmations.',
      },
      { type: 'reasoning-end', id: 'diagram-model-thinking' },
      {
        type: 'tool-input-start',
        toolCallId: 'submit-modeling-proposal-1',
        toolName: 'submit_modeling_proposal',
        dynamic: true,
      },
      {
        type: 'tool-input-available',
        toolCallId: 'submit-modeling-proposal-1',
        toolName: 'submit_modeling_proposal',
        input: proposal,
        dynamic: true,
      },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('starts a new reasoning part when thinking resumes after an end event', async () => {
    const fetch = vi.fn(async () =>
      sseResponse(
        [
          'event: thinking-start',
          'data: ',
          '',
          'event: thinking',
          'data: First block.',
          '',
          'event: thinking-end',
          'data: ',
          '',
          'event: thinking',
          'data: Second block.',
          '',
          'event: complete',
          'data: ',
          '',
        ].join('\n'),
      ),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('model this requirement')],
      abortSignal: undefined,
    });

    await expect(readChunks(stream)).resolves.toEqual([
      { type: 'reasoning-start', id: 'diagram-model-thinking' },
      {
        type: 'reasoning-delta',
        id: 'diagram-model-thinking',
        delta: 'First block.',
      },
      { type: 'reasoning-end', id: 'diagram-model-thinking' },
      { type: 'reasoning-start', id: 'diagram-model-thinking' },
      {
        type: 'reasoning-delta',
        id: 'diagram-model-thinking',
        delta: 'Second block.',
      },
      { type: 'reasoning-end', id: 'diagram-model-thinking' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('surfaces desktop agent errors as error chunks', async () => {
    const fetch = vi.fn(async () =>
      sseResponse('event: error\ndata: pi sdk request timed out\n\n'),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('model this requirement')],
      abortSignal: undefined,
    });

    const chunks = await readChunks(stream);

    expect(chunks).toContainEqual({
      type: 'error',
      errorText: 'pi sdk request timed out',
    });
  });

  it('surfaces desktop agent failures through the response stream', async () => {
    const fetch = vi.fn(
      async () => new Response('bad gateway', { status: 502 }),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [userMessage('model this requirement')],
      abortSignal: undefined,
    });

    await expect(readChunks(stream)).rejects.toThrow('bad gateway');
  });
});
