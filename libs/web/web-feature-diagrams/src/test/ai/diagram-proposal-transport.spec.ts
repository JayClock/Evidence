import { describe, expect, it, vi } from 'vitest';
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

function diagramState(fetch: (init?: RequestInit) => Promise<Response>) {
  return {
    follow: vi.fn(() => ({
      uri: 'https://api.example.test/api/workspaces/ws/diagrams/d1/propose-model',
      fetch,
    })),
    getLink: vi.fn(() => ({
      href: '/api/workspaces/ws/diagrams/d1/propose-model',
    })),
  } as unknown as State<DiagramResource>;
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

    expect(state.follow).toHaveBeenCalledWith('propose-model');
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ requirement: 'latest requirement' }),
      }),
    );
  });

  it('converts backend proposal tool SSE events into AI SDK tool chunks', async () => {
    const proposal = {
      summary: 'Draft',
      changes: {
        addNodes: [],
        updateNodes: [],
        deleteNodes: [],
        addEdges: [],
        updateEdges: [],
        deleteEdges: [],
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

  it('converts backend tool SSE events into AI SDK tool chunks', async () => {
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
        addNodes: [],
        updateNodes: [],
        deleteNodes: [],
        addEdges: [],
        updateEdges: [],
        deleteEdges: [],
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
        addNodes: [],
        updateNodes: [],
        deleteNodes: [],
        addEdges: [],
        updateEdges: [],
        deleteEdges: [],
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

  it('surfaces backend SSE errors as error chunks', async () => {
    const fetch = vi.fn(async () =>
      sseResponse('event: error\ndata: pi rpc request timed out\n\n'),
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
      errorText: 'pi rpc request timed out',
    });
  });

  it('surfaces request failures before streaming starts', async () => {
    const fetch = vi.fn(
      async () => new Response('bad gateway', { status: 502 }),
    );
    const transport = createDiagramProposalTransport(diagramState(fetch));

    await expect(
      transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages: [userMessage('model this requirement')],
        abortSignal: undefined,
      }),
    ).rejects.toThrow('bad gateway');
  });
});
