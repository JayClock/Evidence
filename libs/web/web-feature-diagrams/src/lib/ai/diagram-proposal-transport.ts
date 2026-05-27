import type {
  ChatRequestOptions,
  ChatTransport,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import type { DiagramResource, State } from '@evidence/api-client';

const TEXT_PART_ID = 'diagram-model-proposal';
const REASONING_PART_ID = 'diagram-model-thinking';
const PROPOSAL_CHANGE_KEYS = [
  'addNodes',
  'updateNodes',
  'deleteNodes',
  'addEdges',
  'updateEdges',
  'deleteEdges',
] as const;

type ProposalChangeKey = (typeof PROPOSAL_CHANGE_KEYS)[number];
type ProposalDeltaPayload =
  | { kind: 'summary'; summary: string }
  | { kind: 'change'; changeKey: ProposalChangeKey; item: unknown };

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
  const proposalDeltas = new ProposalDeltaExtractor();

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let buffer = '';
      let textStarted = false;
      let textEnded = false;
      let reasoningStarted = false;
      let reasoningEnded = false;

      const startText = () => {
        if (textStarted) {
          return;
        }

        controller.enqueue({ type: 'text-start', id: TEXT_PART_ID });
        textStarted = true;
      };

      const startReasoning = () => {
        if (reasoningStarted) {
          return;
        }

        controller.enqueue({ type: 'reasoning-start', id: REASONING_PART_ID });
        reasoningStarted = true;
      };

      const endReasoning = () => {
        if (reasoningEnded) {
          return;
        }

        if (reasoningStarted) {
          controller.enqueue({ type: 'reasoning-end', id: REASONING_PART_ID });
        }
        reasoningEnded = true;
      };

      const finishStream = () => {
        if (textEnded) {
          return;
        }

        endReasoning();
        if (textStarted) {
          controller.enqueue({ type: 'text-end', id: TEXT_PART_ID });
        }
        controller.enqueue({ type: 'finish', finishReason: 'stop' });
        textEnded = true;
      };

      const consumeEvent = (rawEvent: string) => {
        const event = parseSseEvent(rawEvent);

        if (event.event === 'complete') {
          finishStream();
          return;
        }

        if (event.event === 'reasoning-end' || event.event === 'thinking-end') {
          endReasoning();
          return;
        }

        if (
          event.event === 'reasoning-start' ||
          event.event === 'thinking-start'
        ) {
          startReasoning();
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

        if (isReasoningEvent(event.event)) {
          startReasoning();
          controller.enqueue({
            type: 'reasoning-delta',
            id: REASONING_PART_ID,
            delta: event.data,
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

          for (const delta of proposalDeltas.append(event.data)) {
            controller.enqueue({
              type: 'data-proposal-delta',
              data: delta,
            });
          }
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

        finishStream();
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

class ProposalDeltaExtractor {
  private text = '';
  private emittedSummary: string | null = null;
  private readonly emittedCounts = new Map<ProposalChangeKey, number>();

  append(chunk: string): ProposalDeltaPayload[] {
    this.text += chunk;

    const deltas: ProposalDeltaPayload[] = [];
    const summary = extractCompleteStringProperty(this.text, 'summary');
    if (summary && summary !== this.emittedSummary) {
      this.emittedSummary = summary;
      deltas.push({ kind: 'summary', summary });
    }

    for (const changeKey of PROPOSAL_CHANGE_KEYS) {
      const items = extractCompleteArrayItems(this.text, changeKey);
      const emittedCount = this.emittedCounts.get(changeKey) ?? 0;

      for (const item of items.slice(emittedCount)) {
        deltas.push({ kind: 'change', changeKey, item });
      }

      this.emittedCounts.set(changeKey, items.length);
    }

    return deltas;
  }
}

function extractCompleteStringProperty(
  text: string,
  key: string,
): string | null {
  const start = propertyValueStart(text, key);
  if (start === -1 || text[start] !== '"') {
    return null;
  }

  const end = scanJsonStringEnd(text, start);
  if (end === -1) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as string;
  } catch {
    return null;
  }
}

function extractCompleteArrayItems(
  text: string,
  key: ProposalChangeKey,
): unknown[] {
  const start = propertyValueStart(text, key);
  if (start === -1 || text[start] !== '[') {
    return [];
  }

  return scanCompleteArrayItemJson(text, start + 1).flatMap((itemJson) => {
    try {
      return [JSON.parse(itemJson) as unknown];
    } catch {
      return [];
    }
  });
}

function propertyValueStart(text: string, key: string): number {
  const match = new RegExp(`"${key}"\\s*:`).exec(text);
  if (!match) {
    return -1;
  }

  let index = match.index + match[0].length;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }
  return index;
}

function scanJsonStringEnd(text: string, start: number): number {
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      return index;
    }
  }

  return -1;
}

function scanCompleteArrayItemJson(text: string, start: number): string[] {
  const items: string[] = [];
  let itemStart: number | null = null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let topLevelString = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (itemStart === null) {
      if (/\s|,/.test(char)) {
        continue;
      }
      if (char === ']') {
        break;
      }

      itemStart = index;
      topLevelString = char === '"';
      inString = topLevelString;
      depth = char === '{' || char === '[' ? 1 : 0;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
        if (topLevelString) {
          items.push(text.slice(itemStart, index + 1));
          itemStart = null;
          topLevelString = false;
        }
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }
    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        items.push(text.slice(itemStart, index + 1));
        itemStart = null;
      }
    }
  }

  return items;
}

function isReasoningEvent(event: string | undefined): boolean {
  return event === 'reasoning' || event === 'thinking' || event === 'thought';
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
