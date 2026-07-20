import { join } from 'node:path';
import {
  DomainError,
  type DomainArchitect,
  type ModelingEvent,
  type ModelingRequest,
} from '@evidence/server-domain';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';

const DEFAULT_TIMEOUT_MS = 120_000;
const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const PI_TOOLS = ['read', 'edit', 'write', 'ls', 'find', 'grep'] as const;

type PiSdkSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export type PiSdkSessionFactory = (
  modelDirectory: string,
) => Promise<PiSdkSession>;

export interface PiSdkDomainArchitectOptions {
  timeoutMs?: number;
  createSession?: PiSdkSessionFactory;
}

interface SdkState {
  accepted: boolean;
  assistantText: string;
  pendingAssistantError: DomainError | null;
  sawMessageEnd: boolean;
  sawAgentEnd: boolean;
  settled: boolean;
}

export class PiSdkDomainArchitect implements DomainArchitect {
  private readonly timeoutMs: number;
  private readonly createSession: PiSdkSessionFactory;

  constructor(options: PiSdkDomainArchitectOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.createSession = options.createSession ?? createPiSdkSession;
  }

  async *proposeModelStream(
    request: ModelingRequest,
  ): AsyncIterable<ModelingEvent> {
    const failure = requestFailure(this.timeoutMs, request.signal);
    const queue = new AsyncEventQueue<ModelingEvent>();
    const state: SdkState = {
      accepted: false,
      assistantText: '',
      pendingAssistantError: null,
      sawMessageEnd: false,
      sawAgentEnd: false,
      settled: false,
    };
    let session: PiSdkSession | undefined;
    let sessionPromise: Promise<PiSdkSession> | undefined;
    let unsubscribe: (() => void) | undefined;
    let promptDone: Promise<void> | undefined;

    try {
      sessionPromise = Promise.resolve().then(() =>
        this.createSession(request.modelDirectory),
      );
      session = await Promise.race([sessionPromise, failure.promise]);
      unsubscribe = session.subscribe((event) => {
        try {
          for (const mapped of mapSdkEvent(event, state)) {
            queue.push(mapped);
          }
          if (event.type === 'agent_settled') {
            queue.close();
          }
        } catch (error) {
          queue.fail(domainError(error));
        }
      });

      promptDone = Promise.resolve()
        .then(() =>
          session?.prompt(request.requirement, {
            expandPromptTemplates: false,
            preflightResult: (accepted) => {
              state.accepted = accepted;
            },
          }),
        )
        .then(
          () => {
            if (!state.settled) {
              queue.fail(
                DomainError.internal('Pi SDK ended before the agent settled'),
              );
            }
          },
          (error: unknown) => queue.fail(domainError(error)),
        );

      while (true) {
        const next = await Promise.race([queue.next(), failure.promise]);
        if (next.done) {
          break;
        }
        yield next.value;
      }
      await Promise.race([promptDone, failure.promise]);
    } catch (error) {
      throw domainError(error);
    } finally {
      failure.dispose();
      unsubscribe?.();
      if (session) {
        await stopSession(session);
      } else if (sessionPromise) {
        void sessionPromise.then(stopSession, () => undefined);
      }
    }
  }
}

async function createPiSdkSession(
  modelDirectory: string,
): Promise<PiSdkSession> {
  const {
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = await import(/* @vite-ignore */ PI_SDK_MODULE_NAME);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(modelDirectory, agentDir, {
    projectTrusted: false,
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: modelDirectory,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
  });
  const { session } = await createAgentSession({
    cwd: modelDirectory,
    agentDir,
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(modelDirectory),
    settingsManager,
    tools: [...PI_TOOLS],
  });
  return session;
}

function mapSdkEvent(
  event: AgentSessionEvent,
  state: SdkState,
): ModelingEvent[] {
  switch (event.type) {
    case 'message_update':
      return mapMessageUpdate(event.assistantMessageEvent, state);
    case 'message_end':
      return mapMessageEnd(event.message, state);
    case 'agent_end':
      return mapAgentEnd(event, state);
    case 'agent_settled':
      return mapAgentSettled(state);
    case 'auto_retry_start':
      state.pendingAssistantError = null;
      return [];
    case 'tool_execution_start':
      return [
        {
          type: 'tool-execution-started',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        },
      ];
    case 'tool_execution_update':
      return [
        {
          type: 'tool-execution-updated',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          partialResult: event.partialResult,
        },
      ];
    case 'tool_execution_end':
      return [
        {
          type: 'tool-execution-ended',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result,
          isError: event.isError,
        },
      ];
    default:
      return [];
  }
}

function mapMessageUpdate(
  event: Extract<
    AgentSessionEvent,
    { type: 'message_update' }
  >['assistantMessageEvent'],
  state: SdkState,
): ModelingEvent[] {
  switch (event.type) {
    case 'text_delta':
      state.assistantText += event.delta;
      return [{ type: 'text-chunk', chunk: event.delta }];
    case 'thinking_start':
      return [{ type: 'reasoning-started' }];
    case 'thinking_delta':
      return [{ type: 'reasoning-chunk', chunk: event.delta }];
    case 'thinking_end':
      return [{ type: 'reasoning-ended' }];
    case 'toolcall_start': {
      const toolCall = partialToolCall(
        event.partial.content,
        event.contentIndex,
      );
      return [
        {
          type: 'tool-call-started',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        },
      ];
    }
    case 'toolcall_delta': {
      const toolCall = partialToolCall(
        event.partial.content,
        event.contentIndex,
      );
      return [
        {
          type: 'tool-call-delta',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          chunk: event.delta,
        },
      ];
    }
    case 'toolcall_end':
      return [
        {
          type: 'tool-call-ready',
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.name,
          input: event.toolCall.arguments,
        },
      ];
    default:
      return [];
  }
}

function partialToolCall(
  content: readonly unknown[],
  contentIndex: number,
): { id: string; name: string } {
  const item = asRecord(content[contentIndex]);
  if (
    item?.['type'] !== 'toolCall' ||
    typeof item['id'] !== 'string' ||
    typeof item['name'] !== 'string'
  ) {
    throw DomainError.internal('Pi SDK tool call missing');
  }
  return { id: item['id'], name: item['name'] };
}

function mapMessageEnd(
  message: Extract<AgentSessionEvent, { type: 'message_end' }>['message'],
  state: SdkState,
): ModelingEvent[] {
  if (message.role !== 'assistant') {
    return [];
  }
  state.sawMessageEnd = true;
  state.pendingAssistantError = assistantError(message);
  if (state.pendingAssistantError) {
    return [];
  }
  return fallbackText(extractMessageText(message), state);
}

function mapAgentEnd(
  event: Extract<AgentSessionEvent, { type: 'agent_end' }>,
  state: SdkState,
): ModelingEvent[] {
  if (event.willRetry) {
    state.pendingAssistantError = null;
    return [];
  }
  state.sawAgentEnd = true;
  const assistant = [...event.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  return fallbackText(extractMessageText(assistant), state);
}

function mapAgentSettled(state: SdkState): ModelingEvent[] {
  state.settled = true;
  if (!state.accepted) {
    throw DomainError.internal(
      'Pi SDK settled before accepting the modeling request',
    );
  }
  if (state.pendingAssistantError) {
    throw state.pendingAssistantError;
  }
  const events: ModelingEvent[] = [];
  if (state.sawMessageEnd) {
    events.push({ type: 'message-ended' });
  }
  if (state.sawAgentEnd) {
    events.push({ type: 'agent-ended' });
  }
  events.push({ type: 'completed' });
  return events;
}

function assistantError(message: {
  stopReason?: string;
  errorMessage?: string;
}): DomainError | null {
  if (message.stopReason === 'error') {
    return DomainError.internal(
      message.errorMessage?.trim() || 'Pi SDK request failed',
    );
  }
  if (message.stopReason === 'aborted') {
    return DomainError.internal(
      message.errorMessage?.trim() || 'Pi SDK request was aborted',
    );
  }
  return null;
}

function fallbackText(text: string, state: SdkState): ModelingEvent[] {
  if (state.assistantText.trim().length > 0 || text.length === 0) {
    return [];
  }
  state.assistantText += text;
  return [{ type: 'text-chunk', chunk: text }];
}

function extractMessageText(message: unknown): string {
  const record = asRecord(message);
  const content = record?.['content'];
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map(asRecord)
    .filter((part) => part?.['type'] === 'text')
    .map((part) => (typeof part?.['text'] === 'string' ? part['text'] : ''))
    .join('');
}

function requestFailure(
  timeoutMs: number,
  signal?: AbortSignal,
): { promise: Promise<never>; dispose: () => void } {
  let rejectFailure: (error: DomainError) => void = () => undefined;
  let failed = false;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
  });
  const fail = (error: DomainError) => {
    if (!failed) {
      failed = true;
      rejectFailure(error);
    }
  };
  const onAbort = () =>
    fail(DomainError.internal('Pi SDK request was aborted'));
  const timer = setTimeout(
    () =>
      fail(
        DomainError.internal(`Pi SDK request timed out after ${timeoutMs}ms`),
      ),
    timeoutMs,
  );

  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) {
    onAbort();
  }

  return {
    promise,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function stopSession(session: PiSdkSession): Promise<void> {
  try {
    await session.abort();
  } catch {
    // The request result has already been reported; cleanup must not mask it.
  } finally {
    try {
      session.dispose();
    } catch {
      // Disposal is best-effort after the request has finished.
    }
  }
}

class AsyncEventQueue<T> {
  private readonly values: T[] = [];
  private waiter:
    | {
        resolve: (result: IteratorResult<T>) => void;
        reject: (error: unknown) => void;
      }
    | undefined;
  private closed = false;
  private failure: unknown;

  push(value: T): void {
    if (this.closed || this.failure) {
      return;
    }
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = undefined;
      waiter.resolve({ done: false, value });
    } else {
      this.values.push(value);
    }
  }

  close(): void {
    if (this.closed || this.failure) {
      return;
    }
    this.closed = true;
    this.settleWaiter();
  }

  fail(error: unknown): void {
    if (this.closed || this.failure) {
      return;
    }
    this.failure = error;
    this.settleWaiter();
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  private settleWaiter(): void {
    if (!this.waiter || this.values.length > 0) {
      return;
    }
    const waiter = this.waiter;
    this.waiter = undefined;
    if (this.failure) {
      waiter.reject(this.failure);
    } else {
      waiter.resolve({ done: true, value: undefined });
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function domainError(error: unknown): DomainError {
  return error instanceof DomainError
    ? error
    : DomainError.internal(errorMessage(error));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
