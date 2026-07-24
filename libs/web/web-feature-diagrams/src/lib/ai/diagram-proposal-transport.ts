import type {
  ChatRequestOptions,
  ChatTransport,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import type { DiagramResource, State } from '@evidence/api-client';

const REASONING_PART_ID = 'diagram-model-thinking';
const TEXT_PART_ID = 'diagram-model-response';

type SendMessagesOptions = Parameters<
  ChatTransport<UIMessage>['sendMessages']
>[0];

type LinkedResource = {
  uri?: string;
};

type DesktopAgentEvent = {
  id: string;
  event: string | null;
  data: string;
};

type DesktopAgentBridge = {
  runDiagramAgent(
    request: {
      id: string;
      requirement: string;
      logicalEntitiesHref: string;
      logicalRelationshipsHref: string;
    },
    onEvent: (event: DesktopAgentEvent) => void,
  ): Promise<void>;
  cancelDiagramAgent(id: string): Promise<void>;
};

export function isDesktopDiagramAgentAvailable(
  resourceState: State<DiagramResource>,
): boolean {
  if (!desktopAgentBridge()) {
    return false;
  }

  try {
    requiredResourceHref(resourceState, 'logical-entities');
    requiredResourceHref(resourceState, 'logical-relationships');
    return true;
  } catch {
    return false;
  }
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

  const desktopAgent = desktopAgentBridge();
  if (!desktopAgent) {
    throw new Error(
      'The diagram modeling agent is available in Evidence Desktop only.',
    );
  }

  return sendLocalDiagramAgentRequest(
    desktopAgent,
    resourceState,
    requirement,
    options,
  );
}

function sendLocalDiagramAgentRequest(
  bridge: DesktopAgentBridge,
  resourceState: State<DiagramResource>,
  requirement: string,
  options: SendMessagesOptions,
): ReadableStream<UIMessageChunk> {
  const id = agentRequestId();
  const logicalEntitiesHref = requiredResourceHref(
    resourceState,
    'logical-entities',
  );
  const logicalRelationshipsHref = requiredResourceHref(
    resourceState,
    'logical-relationships',
  );
  const encoder = new TextEncoder();
  let cancelled = false;

  const eventStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        cancelled = true;
        void bridge.cancelDiagramAgent(id);
        controller.close();
      };
      options.abortSignal?.addEventListener('abort', onAbort, { once: true });

      void bridge
        .runDiagramAgent(
          {
            id,
            requirement,
            logicalEntitiesHref,
            logicalRelationshipsHref,
          },
          (event) => {
            if (cancelled) {
              return;
            }
            controller.enqueue(encoder.encode(serializeAgentEvent(event)));
            if (event.event === 'complete') {
              cancelled = true;
              options.abortSignal?.removeEventListener('abort', onAbort);
              controller.close();
            }
          },
        )
        .then(() => {
          if (!cancelled) {
            cancelled = true;
            options.abortSignal?.removeEventListener('abort', onAbort);
            controller.close();
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            cancelled = true;
            options.abortSignal?.removeEventListener('abort', onAbort);
            controller.error(error);
          }
        });
    },
    cancel() {
      cancelled = true;
      return bridge.cancelDiagramAgent(id);
    },
  });

  return sseToUiMessageStream(eventStream);
}

function requiredResourceHref(
  resourceState: State<DiagramResource>,
  relation: 'logical-entities' | 'logical-relationships',
): string {
  const resource = resourceState.follow(relation) as LinkedResource;
  const href = resource.uri ?? resourceState.getLink(relation)?.href;
  if (!href) {
    throw new Error(`Diagram ${relation} link is unavailable.`);
  }
  return href;
}

function agentRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `diagram-agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function serializeAgentEvent(event: DesktopAgentEvent): string {
  const eventLine = event.event ? `event: ${event.event}\n` : '';
  const dataLines = event.data
    .split(/\r\n|\r|\n/)
    .map((line) => `data: ${line}`)
    .join('\n');
  return `${eventLine}${dataLines}\n\n`;
}

function desktopAgentBridge(): DesktopAgentBridge | undefined {
  return (
    globalThis as typeof globalThis & {
      evidenceDesktop?: DesktopAgentBridge;
    }
  ).evidenceDesktop;
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
      let finished = false;
      let reasoningActive = false;
      let textStarted = false;
      let textEnded = false;
      const availableToolInputs = new Set<string>();

      const startReasoning = () => {
        if (reasoningActive) {
          return;
        }

        controller.enqueue({ type: 'reasoning-start', id: REASONING_PART_ID });
        reasoningActive = true;
      };

      const endReasoning = () => {
        if (!reasoningActive) {
          return;
        }

        controller.enqueue({ type: 'reasoning-end', id: REASONING_PART_ID });
        reasoningActive = false;
      };

      const startText = () => {
        if (textStarted) {
          return;
        }

        controller.enqueue({ type: 'text-start', id: TEXT_PART_ID });
        textStarted = true;
      };

      const enqueueTextDelta = (delta: string) => {
        if (!delta) {
          return;
        }

        startText();
        controller.enqueue({
          type: 'text-delta',
          id: TEXT_PART_ID,
          delta,
        });
      };

      const endText = () => {
        if (!textStarted || textEnded) {
          return;
        }

        controller.enqueue({ type: 'text-end', id: TEXT_PART_ID });
        textEnded = true;
      };

      const enqueueToolInput = (payload: unknown) => {
        const tool = toolPayload(payload);
        if (!tool || availableToolInputs.has(tool.toolCallId)) {
          return;
        }

        controller.enqueue({
          type: 'tool-input-available',
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          input: tool.input,
          dynamic: true,
        });
        availableToolInputs.add(tool.toolCallId);
      };

      const enqueueToolOutput = (payload: unknown, preliminary: boolean) => {
        const tool = toolPayload(payload);
        if (!tool) {
          return;
        }

        const output = tool.output;
        if (tool.isError) {
          controller.enqueue({
            type: 'tool-output-error',
            toolCallId: tool.toolCallId,
            errorText: stringifyToolOutput(output),
            dynamic: true,
          });
          return;
        }

        controller.enqueue({
          type: 'tool-output-available',
          toolCallId: tool.toolCallId,
          output,
          dynamic: true,
          preliminary,
        });
      };

      const finishStream = () => {
        if (finished) {
          return;
        }

        endReasoning();
        endText();
        controller.enqueue({ type: 'finish', finishReason: 'stop' });
        finished = true;
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

        if (!event.event || event.event === 'text') {
          enqueueTextDelta(event.data);
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

        if (event.event === 'tool-call-start') {
          const tool = toolPayload(parseJsonValue(event.data));
          if (tool && !availableToolInputs.has(tool.toolCallId)) {
            controller.enqueue({
              type: 'tool-input-start',
              toolCallId: tool.toolCallId,
              toolName: tool.toolName,
              dynamic: true,
            });
          }
          return;
        }

        if (event.event === 'tool-call-delta') {
          return;
        }

        if (event.event === 'tool-call') {
          enqueueToolInput(parseJsonValue(event.data));
          return;
        }

        if (event.event === 'tool-execution-start') {
          enqueueToolInput(parseJsonValue(event.data));
          return;
        }

        if (event.event === 'tool-execution-update') {
          const payload = parseJsonValue(event.data);
          enqueueToolInput(payload);
          enqueueToolOutput(payload, true);
          return;
        }

        if (event.event === 'tool-execution-end') {
          const payload = parseJsonValue(event.data);
          enqueueToolInput(payload);
          enqueueToolOutput(payload, false);
          return;
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

type ToolPayload = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  isError: boolean;
};

function toolPayload(payload: unknown): ToolPayload | null {
  const value = record(payload);
  if (!value) {
    return null;
  }

  const toolCallId = stringValue(value.toolCallId);
  const toolName = stringValue(value.toolName) ?? 'tool';
  if (!toolCallId) {
    return null;
  }

  return {
    toolCallId,
    toolName,
    input: 'input' in value ? value.input : value.args,
    output:
      'result' in value
        ? value.result
        : 'partialResult' in value
          ? value.partialResult
          : undefined,
    isError: booleanValue(value.isError),
  };
}

function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function booleanValue(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return 'Tool execution failed.';
  }
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
      const value = line.slice('data:'.length);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
}

export type { ChatRequestOptions };
