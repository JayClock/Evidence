import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import {
  DomainError,
  type DomainArchitect,
  type ModelingEvent,
  type ModelingRequest,
} from '@evidence/server-nest-domain';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ARGS = [
  '--mode',
  'rpc',
  '--no-session',
  '--no-approve',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
  '--no-themes',
  '--no-context-files',
  '--tools',
  'read,edit,write,ls,find,grep',
] as const;
const MAX_STDERR_LENGTH = 8_192;

export interface PiRpcDomainArchitectOptions {
  command?: string;
  args?: readonly string[];
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

interface RpcState {
  accepted: boolean;
  assistantMessageIndex: number | null;
  assistantText: string;
  sawMessageEnd: boolean;
  sawAgentEnd: boolean;
}

interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export class PiRpcDomainArchitect implements DomainArchitect {
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly timeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: PiRpcDomainArchitectOptions = {}) {
    this.command =
      options.command ?? process.env['EVIDENCE_PI_COMMAND'] ?? 'pi';
    this.args = options.args ?? DEFAULT_ARGS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.env = {
      ...process.env,
      PI_SKIP_VERSION_CHECK: '1',
      ...options.env,
    };
  }

  async *proposeModelStream(
    request: ModelingRequest,
  ): AsyncIterable<ModelingEvent> {
    const child = this.startProcess(request.modelDirectory);
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_STDERR_LENGTH);
    });

    const exit = processExit(child);
    const failure = processFailure(child, this.timeoutMs, request.signal);
    const state: RpcState = {
      accepted: false,
      assistantMessageIndex: null,
      assistantText: '',
      sawMessageEnd: false,
      sawAgentEnd: false,
    };

    try {
      await Promise.race([
        writeCommand(child, {
          id: 'evidence-chat',
          type: 'prompt',
          message: request.requirement,
        }),
        failure.promise,
      ]);

      for await (const message of jsonLines(child, failure.promise)) {
        for (const event of mapRpcMessage(message, state)) {
          yield event;
        }
        if (isSettled(message)) {
          return;
        }
      }

      const result = await Promise.race([exit, failure.promise]);
      if (result.code !== 0) {
        throw processExitError(result, stderr);
      }
      if (!state.accepted) {
        throw processEndedError(
          'Pi RPC ended before accepting the modeling request',
          stderr,
        );
      }
      throw processEndedError('Pi RPC ended before the agent settled', stderr);
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      throw DomainError.internal(errorMessage(error));
    } finally {
      failure.dispose();
      await stopProcess(child, exit);
    }
  }

  private startProcess(modelDirectory: string): ChildProcessWithoutNullStreams {
    return spawn(this.command, [...this.args], {
      cwd: modelDirectory,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }
}

function processFailure(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  signal?: AbortSignal,
): { promise: Promise<never>; dispose: () => void } {
  let rejectFailure: (error: Error) => void = () => undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
  });
  const onError = (error: Error) => {
    rejectFailure(
      DomainError.internal(`failed to start Pi RPC: ${error.message}`),
    );
  };
  const onAbort = () => {
    rejectFailure(DomainError.internal('Pi RPC request was aborted'));
    child.kill('SIGTERM');
  };
  const timer = setTimeout(() => {
    rejectFailure(
      DomainError.internal(`Pi RPC request timed out after ${timeoutMs}ms`),
    );
    child.kill('SIGTERM');
  }, timeoutMs);

  child.once('error', onError);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) {
    onAbort();
  }

  return {
    promise,
    dispose: () => {
      clearTimeout(timer);
      child.off('error', onError);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

function processExit(
  child: ChildProcessWithoutNullStreams,
): Promise<ProcessExit> {
  return new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

async function writeCommand(
  child: ChildProcessWithoutNullStreams,
  command: unknown,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.stdin.write(
      `${JSON.stringify(command)}\n`,
      (error?: Error | null) => {
        if (error) {
          reject(
            DomainError.internal(
              `failed to write Pi RPC command: ${error.message}`,
            ),
          );
        } else {
          resolve();
        }
      },
    );
  });
}

async function* jsonLines(
  child: ChildProcessWithoutNullStreams,
  failure: Promise<never>,
): AsyncIterable<unknown> {
  const decoder = new StringDecoder('utf8');
  const iterator = child.stdout[Symbol.asyncIterator]();
  let buffer = '';

  while (true) {
    const next = await Promise.race([iterator.next(), failure]);
    if (next.done) {
      break;
    }
    buffer += decoder.write(
      Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value),
    );

    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) {
        yield parseRpcLine(line);
      }
      newline = buffer.indexOf('\n');
    }
  }

  buffer += decoder.end();
  const finalLine = buffer.trim();
  if (finalLine.length > 0) {
    yield parseRpcLine(finalLine);
  }
}

function parseRpcLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw DomainError.internal(
      `Pi RPC emitted invalid JSON: ${errorMessage(error)}`,
    );
  }
}

function mapRpcMessage(message: unknown, state: RpcState): ModelingEvent[] {
  const record = asRecord(message);
  if (!record) {
    return [];
  }

  switch (stringField(record, 'type')) {
    case 'message_start':
      return mapMessageStart(record, state);
    case 'message_update':
      return mapMessageUpdate(record, state);
    case 'message_end':
      return mapMessageEnd(record, state);
    case 'agent_end':
      return mapAgentEnd(record, state);
    case 'tool_execution_start':
      return [mapToolExecutionStarted(record)];
    case 'tool_execution_update':
      return [mapToolExecutionUpdated(record)];
    case 'tool_execution_end':
      return [mapToolExecutionEnded(record)];
    case 'response':
      return mapResponse(record, state);
    case 'error':
    case 'extension_error':
      throw DomainError.internal(rpcError(record));
    case 'agent_settled':
    case 'settled':
      return mapAgentSettled(state);
    default:
      return [];
  }
}

function mapMessageStart(
  record: Record<string, unknown>,
  state: RpcState,
): ModelingEvent[] {
  const message = asRecord(record['message']);
  if (stringField(message, 'role') !== 'assistant') {
    return [];
  }
  state.assistantMessageIndex = numberField(record, 'messageIndex');
  return [];
}

function mapMessageUpdate(
  record: Record<string, unknown>,
  state: RpcState,
): ModelingEvent[] {
  const messageIndex = numberField(record, 'messageIndex');
  if (
    state.assistantMessageIndex !== null &&
    messageIndex !== null &&
    state.assistantMessageIndex !== messageIndex
  ) {
    return [];
  }

  const event = asRecord(record['assistantMessageEvent']);
  if (!event) {
    return [];
  }
  const eventType = stringField(event, 'type');
  const chunk =
    stringField(event, 'delta') ?? stringField(event, 'content') ?? '';

  switch (eventType) {
    case 'text_delta':
      state.assistantText += chunk;
      return [{ type: 'text-chunk', chunk }];
    case 'thinking_start':
      return [{ type: 'reasoning-started' }];
    case 'thinking_delta':
      return [{ type: 'reasoning-chunk', chunk }];
    case 'thinking_end':
      return [{ type: 'reasoning-ended' }];
    case 'toolcall_start':
      return [mapToolCallStarted(event)];
    case 'toolcall_delta':
      return [mapToolCallDelta(event)];
    case 'toolcall_end':
      return [mapToolCallReady(event)];
    default:
      return [];
  }
}

function mapMessageEnd(
  record: Record<string, unknown>,
  state: RpcState,
): ModelingEvent[] {
  const message = asRecord(record['message']);
  if (stringField(message, 'role') !== 'assistant') {
    return [];
  }
  state.sawMessageEnd = true;
  return fallbackText(extractMessageText(message), state);
}

function mapAgentEnd(
  record: Record<string, unknown>,
  state: RpcState,
): ModelingEvent[] {
  state.sawAgentEnd = true;
  const messages = Array.isArray(record['messages']) ? record['messages'] : [];
  const assistant = [...messages]
    .reverse()
    .map(asRecord)
    .find((message) => stringField(message, 'role') === 'assistant');
  return fallbackText(extractMessageText(assistant ?? null), state);
}

function fallbackText(text: string, state: RpcState): ModelingEvent[] {
  if (state.assistantText.trim().length > 0 || text.length === 0) {
    return [];
  }
  state.assistantText += text;
  return [{ type: 'text-chunk', chunk: text }];
}

function extractMessageText(message: Record<string, unknown> | null): string {
  const content = message?.['content'];
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map(asRecord)
    .filter((part) => stringField(part, 'type') === 'text')
    .map((part) => stringField(part, 'text') ?? '')
    .join('');
}

function mapToolCallStarted(event: Record<string, unknown>): ModelingEvent {
  const toolCall = assistantToolCall(event);
  return {
    type: 'tool-call-started',
    toolCallId: requiredString(toolCall, 'id', 'Pi RPC tool call'),
    toolName: stringField(toolCall, 'name'),
  };
}

function mapToolCallDelta(event: Record<string, unknown>): ModelingEvent {
  const toolCall = assistantToolCall(event);
  return {
    type: 'tool-call-delta',
    toolCallId: requiredString(toolCall, 'id', 'Pi RPC tool call'),
    toolName: stringField(toolCall, 'name'),
    chunk: requiredString(event, 'delta', 'Pi RPC tool call delta'),
  };
}

function mapToolCallReady(event: Record<string, unknown>): ModelingEvent {
  const toolCall = assistantToolCall(event);
  return {
    type: 'tool-call-ready',
    toolCallId: requiredString(toolCall, 'id', 'Pi RPC tool call'),
    toolName: requiredString(toolCall, 'name', 'Pi RPC tool call'),
    input: requiredValue(toolCall, 'arguments', 'Pi RPC tool call'),
  };
}

function assistantToolCall(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const direct = asRecord(event['toolCall']) ?? asRecord(event['partialCall']);
  if (direct) {
    return direct;
  }

  const contentIndex = numberField(event, 'contentIndex');
  const partial = asRecord(event['partial']);
  const content = partial?.['content'];
  const indexed =
    contentIndex !== null && Array.isArray(content)
      ? asRecord(content[contentIndex])
      : null;
  if (!indexed) {
    throw DomainError.internal('Pi RPC tool call missing');
  }
  return indexed;
}

function mapToolExecutionStarted(
  record: Record<string, unknown>,
): ModelingEvent {
  return {
    type: 'tool-execution-started',
    toolCallId: requiredString(record, 'toolCallId', 'Pi RPC event'),
    toolName: requiredString(record, 'toolName', 'Pi RPC event'),
    args: requiredValue(record, 'args', 'Pi RPC event'),
  };
}

function mapToolExecutionUpdated(
  record: Record<string, unknown>,
): ModelingEvent {
  return {
    type: 'tool-execution-updated',
    toolCallId: requiredString(record, 'toolCallId', 'Pi RPC event'),
    toolName: requiredString(record, 'toolName', 'Pi RPC event'),
    args: requiredValue(record, 'args', 'Pi RPC event'),
    partialResult: requiredValue(record, 'partialResult', 'Pi RPC event'),
  };
}

function mapToolExecutionEnded(record: Record<string, unknown>): ModelingEvent {
  if (typeof record['isError'] !== 'boolean') {
    throw DomainError.internal('Pi RPC event isError missing');
  }
  return {
    type: 'tool-execution-ended',
    toolCallId: requiredString(record, 'toolCallId', 'Pi RPC event'),
    toolName: requiredString(record, 'toolName', 'Pi RPC event'),
    result: requiredValue(record, 'result', 'Pi RPC event'),
    isError: record['isError'],
  };
}

function mapResponse(
  record: Record<string, unknown>,
  state: RpcState,
): ModelingEvent[] {
  if (stringField(record, 'command') !== 'prompt') {
    return [];
  }
  if (record['success'] === false) {
    throw DomainError.internal(rpcError(record));
  }
  state.accepted = true;
  return [];
}

function mapAgentSettled(state: RpcState): ModelingEvent[] {
  if (!state.accepted) {
    throw DomainError.internal(
      'Pi RPC settled before accepting the modeling request',
    );
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

function rpcError(record: Record<string, unknown>): string {
  const error = asRecord(record['error']);
  return (
    stringField(error, 'message') ??
    (typeof record['error'] === 'string' ? record['error'] : null) ??
    stringField(record, 'message') ??
    'Pi RPC request failed'
  );
}

function requiredString(
  record: Record<string, unknown>,
  name: string,
  subject: string,
): string {
  const value = stringField(record, name);
  if (value === null) {
    throw DomainError.internal(`${subject} ${name} missing`);
  }
  return value;
}

function requiredValue(
  record: Record<string, unknown>,
  name: string,
  subject: string,
): unknown {
  if (!(name in record)) {
    throw DomainError.internal(`${subject} ${name} missing`);
  }
  return record[name];
}

function isSettled(message: unknown): boolean {
  const type = stringField(asRecord(message), 'type');
  return type === 'agent_settled' || type === 'settled';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  record: Record<string, unknown> | null,
  name: string,
): string | null {
  const value = record?.[name];
  return typeof value === 'string' ? value : null;
}

function numberField(
  record: Record<string, unknown> | null,
  name: string,
): number | null {
  const value = record?.[name];
  return typeof value === 'number' ? value : null;
}

function processEndedError(message: string, stderr: string): DomainError {
  const detail = stderr.trim();
  return DomainError.internal(
    detail.length > 0 ? `${message}: ${detail}` : message,
  );
}

function processExitError(result: ProcessExit, stderr: string): DomainError {
  const detail = stderr.trim();
  const status = result.signal
    ? `signal ${result.signal}`
    : `status ${String(result.code)}`;
  return DomainError.internal(
    detail.length > 0
      ? `Pi RPC exited with ${status}: ${detail}`
      : `Pi RPC exited with ${status}`,
  );
}

async function stopProcess(
  child: ChildProcessWithoutNullStreams,
  exit: Promise<ProcessExit>,
): Promise<void> {
  child.stdin.destroy();
  if (child.exitCode !== null || child.signalCode !== null) {
    await exit;
    return;
  }

  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exit.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 250)),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exit;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
