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

  it('converts backend default SSE data into assistant text chunks', async () => {
    const fetch = vi.fn(async () =>
      sseResponse(
        'data: {"summary":"Draft"}\n\nevent: structured\ndata: {"kind":"diagram-model","format":"json","chunk":"ignored duplicate"}\n\nevent: complete\ndata: \n\n',
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
      { type: 'text-start', id: 'diagram-model-proposal' },
      {
        type: 'text-delta',
        id: 'diagram-model-proposal',
        delta: '{"summary":"Draft"}',
      },
      { type: 'text-end', id: 'diagram-model-proposal' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('converts proposal-ready into a data part without appending it to assistant text', async () => {
    const finalProposal = {
      summary: 'Final proposal',
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
        `data: {"summary":"Streaming"}\n\nevent: proposal-ready\ndata: ${JSON.stringify(finalProposal)}\n\nevent: complete\ndata: \n\n`,
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
      { type: 'text-start', id: 'diagram-model-proposal' },
      {
        type: 'text-delta',
        id: 'diagram-model-proposal',
        delta: '{"summary":"Streaming"}',
      },
      { type: 'data-proposal', data: finalProposal },
      { type: 'text-end', id: 'diagram-model-proposal' },
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
    const fetch = vi.fn(async () => new Response('bad gateway', { status: 502 }));
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
