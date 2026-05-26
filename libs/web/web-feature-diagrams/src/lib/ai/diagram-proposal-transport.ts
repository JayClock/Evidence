import type {
  ChatRequestOptions,
  ChatTransport,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import type { DiagramResource, State } from '@evidence/api-client';

const TEXT_PART_ID = 'diagram-model-proposal';

type SendMessagesOptions = Parameters<
  ChatTransport<UIMessage>['sendMessages']
>[0];

type FetchableResource = {
  uri?: string;
  fetch?: (init?: RequestInit) => Promise<Response>;
};

export function resolveProposeModelUrl(
  resourceState: State<DiagramResource>,
): string | null {
  try {
    const resource = resourceState.follow('propose-model') as FetchableResource;
    return resource.uri ?? safeProposeModelHref(resourceState);
  } catch {
    return safeProposeModelHref(resourceState);
  }
}

function safeProposeModelHref(
  resourceState: State<DiagramResource>,
): string | null {
  return typeof resourceState.getLink === 'function'
    ? (resourceState.getLink('propose-model')?.href ?? null)
    : null;
}

export function createDiagramProposalTransport(
  resourceState: State<DiagramResource>,
): ChatTransport<UIMessage> {
  return {
    async sendMessages(options) {
      return sendDiagramProposalRequest(resourceState, options);
    },
    async reconnectToStream() {
      return null;
    },
  };
}

async function sendDiagramProposalRequest(
  resourceState: State<DiagramResource>,
  options: SendMessagesOptions,
): Promise<ReadableStream<UIMessageChunk>> {
  const requirement = latestUserMessageText(options.messages);

  if (!requirement) {
    throw new Error('Requirement is required.');
  }

  const resource = resourceState.follow('propose-model') as FetchableResource;
  const response = await fetchProposal(resource, requirement, options);

  if (!response.ok) {
    throw new Error(
      (await response.text()) || 'Failed to propose diagram model.',
    );
  }

  if (!response.body) {
    throw new Error('Diagram AI response body is empty.');
  }

  return sseToUiMessageStream(response.body);
}

async function fetchProposal(
  resource: FetchableResource,
  requirement: string,
  options: SendMessagesOptions,
): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify({ requirement }),
    signal: options.abortSignal,
  };

  if (typeof resource.fetch === 'function') {
    return resource.fetch(init);
  }

  if (!resource.uri) {
    throw new Error('Diagram AI propose-model link is unavailable.');
  }

  return fetch(resource.uri, init);
}

export function messageText(
  message: Pick<UIMessage, 'parts'> | undefined,
): string {
  if (!message) {
    return '';
  }

  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

function latestUserMessageText(messages: UIMessage[]): string {
  return messageText(
    [...messages].reverse().find((message) => message.role === 'user'),
  );
}

function sseToUiMessageStream(
  stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
): ReadableStream<UIMessageChunk> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let buffer = '';
      let textStarted = false;
      let textEnded = false;

      const startText = () => {
        if (textStarted) {
          return;
        }

        controller.enqueue({ type: 'text-start', id: TEXT_PART_ID });
        textStarted = true;
      };

      const endText = () => {
        if (textEnded) {
          return;
        }

        if (textStarted) {
          controller.enqueue({ type: 'text-end', id: TEXT_PART_ID });
        }
        controller.enqueue({ type: 'finish', finishReason: 'stop' });
        textEnded = true;
      };

      const consumeEvent = (rawEvent: string) => {
        const event = parseSseEvent(rawEvent);

        if (event.event === 'complete') {
          endText();
          return;
        }

        if (!event.data) {
          return;
        }

        if (event.event === 'error') {
          controller.enqueue({ type: 'error', errorText: event.data });
          return;
        }

        if (event.event === 'proposal-ready') {
          controller.enqueue({
            type: 'data-proposal',
            data: JSON.parse(event.data) as unknown,
          });
          return;
        }

        if (event.event === '' || event.event === undefined) {
          startText();
          controller.enqueue({
            type: 'text-delta',
            id: TEXT_PART_ID,
            delta: event.data,
          });
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += value;

          while (true) {
            const separatorIndex = buffer.indexOf('\n\n');
            if (separatorIndex === -1) {
              break;
            }

            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            consumeEvent(rawEvent);
          }
        }

        if (buffer.trim()) {
          consumeEvent(buffer);
        }

        endText();
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

function parseSseEvent(rawEvent: string): { data: string; event?: string } {
  const dataLines: string[] = [];
  let event: string | undefined;

  for (const line of rawEvent.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
}

export type { ChatRequestOptions };
