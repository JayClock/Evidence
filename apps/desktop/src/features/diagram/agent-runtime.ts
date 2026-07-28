import { createInterface } from 'node:readline';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import type { AgentRuntimeRequest, DiagramAgentEvent } from './protocol';
import { parseAgentRuntimeRequest, parseDiagramAgentEvent } from './protocol';
import { createModelingAgentTools } from './agent-tools';
import { RemoteEvidenceClient } from './api-client';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const DEFAULT_TIMEOUT_MS = 120_000;

const SYSTEM_PROMPT = `You are the local Evidence modeling agent.

You analyze the user's current modeling request and operate the active remote Evidence workspace only through the provided Evidence tools.

Rules:
- Read the current logical entities and relationships before deciding what to change.
- Treat every successful tool result as the source of truth; never claim a mutation succeeded without a successful tool result.
- Make the smallest coherent set of changes required by the current message.
- Never delete an entity or relationship unless the current user message explicitly requests that deletion.
- Preserve stable identifiers by updating existing resources instead of recreating them.
- Do not invent HTTP URLs, credentials, local files, or unavailable tools.
- Finish with a concise summary of the remote resources actually changed.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

interface StreamState {
  assistantText: string;
  completed: boolean;
}

export async function runAgentRequest(
  request: AgentRuntimeRequest,
  emit: (event: DiagramAgentEvent) => void,
): Promise<void> {
  const client = new RemoteEvidenceClient({
    apiBaseUrl: request.apiBaseUrl,
    logicalEntitiesHref: request.logicalEntitiesHref,
    logicalRelationshipsHref: request.logicalRelationshipsHref,
    authorization: process.env.EVIDENCE_API_AUTHORIZATION,
  });
  const session = await createSession(client);
  const state: StreamState = { assistantText: '', completed: false };
  const unsubscribe = session.subscribe((event) => {
    for (const mapped of mapSessionEvent(request.id, event, state)) {
      emit(mapped);
    }
  });
  const timeout = setTimeout(() => {
    void session.abort();
  }, DEFAULT_TIMEOUT_MS);

  try {
    await session.prompt(request.requirement, {
      expandPromptTemplates: false,
    });
    complete(request.id, state, emit);
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    try {
      await session.abort();
    } catch {
      // The completed request no longer needs an active model stream.
    }
    session.dispose();
  }
}

async function createSession(
  client: RemoteEvidenceClient,
): Promise<RuntimeSession> {
  const {
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = await import(/* @vite-ignore */ PI_SDK_MODULE_NAME);
  const cwd = process.cwd();
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.inMemory({
    retry: { enabled: true, maxRetries: 2 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
  });
  await resourceLoader.reload();
  const modelRuntime = await ModelRuntime.create();
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    noTools: 'builtin',
    customTools: createModelingAgentTools(client),
  });
  return session;
}

function mapSessionEvent(
  id: string,
  event: AgentSessionEvent,
  state: StreamState,
): DiagramAgentEvent[] {
  switch (event.type) {
    case 'message_update':
      return mapMessageUpdate(id, event.assistantMessageEvent, state);
    case 'message_end':
      return fallbackMessageText(id, event.message, state);
    case 'agent_end': {
      const assistant = [...event.messages]
        .reverse()
        .find((message) => message.role === 'assistant');
      return fallbackMessageText(id, assistant, state);
    }
    case 'tool_execution_start':
      return [
        agentEvent(id, 'tool-execution-start', {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        }),
      ];
    case 'tool_execution_update':
      return [
        agentEvent(id, 'tool-execution-update', {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          partialResult: event.partialResult,
        }),
      ];
    case 'tool_execution_end':
      return [
        agentEvent(id, 'tool-execution-end', {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result,
          isError: event.isError,
        }),
      ];
    case 'agent_settled':
      if (state.completed) {
        return [];
      }
      state.completed = true;
      return [agentEvent(id, 'complete', '')];
    default:
      return [];
  }
}

function mapMessageUpdate(
  id: string,
  event: Extract<
    AgentSessionEvent,
    { type: 'message_update' }
  >['assistantMessageEvent'],
  state: StreamState,
): DiagramAgentEvent[] {
  switch (event.type) {
    case 'text_delta':
      state.assistantText += event.delta;
      return [agentEvent(id, null, event.delta)];
    case 'thinking_start':
      return [agentEvent(id, 'thinking-start', '')];
    case 'thinking_delta':
      return [agentEvent(id, 'thinking', event.delta)];
    case 'thinking_end':
      return [agentEvent(id, 'thinking-end', '')];
    case 'toolcall_start': {
      const tool = partialToolCall(event.partial.content, event.contentIndex);
      return [
        agentEvent(id, 'tool-call-start', {
          toolCallId: tool.id,
          toolName: tool.name,
        }),
      ];
    }
    case 'toolcall_delta': {
      const tool = partialToolCall(event.partial.content, event.contentIndex);
      return [
        agentEvent(id, 'tool-call-delta', {
          toolCallId: tool.id,
          toolName: tool.name,
          chunk: event.delta,
        }),
      ];
    }
    case 'toolcall_end':
      return [
        agentEvent(id, 'tool-call', {
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.name,
          input: event.toolCall.arguments,
        }),
      ];
    default:
      return [];
  }
}

function fallbackMessageText(
  id: string,
  message: unknown,
  state: StreamState,
): DiagramAgentEvent[] {
  const text = extractMessageText(message);
  if (state.assistantText.trim().length > 0 || !text) {
    return [];
  }
  state.assistantText += text;
  return [agentEvent(id, null, text)];
}

function partialToolCall(
  content: readonly unknown[],
  contentIndex: number,
): { id: string; name: string } {
  const item = record(content[contentIndex]);
  if (
    item?.type !== 'toolCall' ||
    typeof item.id !== 'string' ||
    typeof item.name !== 'string'
  ) {
    throw new Error('Pi SDK tool call is incomplete.');
  }
  return { id: item.id, name: item.name };
}

function extractMessageText(message: unknown): string {
  const value = record(message);
  const content = value?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map(record)
    .filter((part) => part?.type === 'text')
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

function complete(
  id: string,
  state: StreamState,
  emit: (event: DiagramAgentEvent) => void,
): void {
  if (!state.completed) {
    state.completed = true;
    emit(agentEvent(id, 'complete', ''));
  }
}

function agentEvent(
  id: string,
  event: string | null,
  data: unknown,
): DiagramAgentEvent {
  return {
    id,
    event,
    data: typeof data === 'string' ? data : JSON.stringify(data),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolve, reject) => {
    input.once('line', resolve);
    input.once('close', () =>
      reject(new Error('Agent request was not provided.')),
    );
  });
  input.close();

  let requestId = 'unknown';
  try {
    const parsed: unknown = JSON.parse(line);
    const request = parseAgentRuntimeRequest(parsed);
    requestId = request.id;
    await runAgentRequest(request, writeEvent);
  } catch (error) {
    writeEvent(agentEvent(requestId, 'error', errorMessage(error)));
    writeEvent(agentEvent(requestId, 'complete', ''));
  }
}

function writeEvent(event: DiagramAgentEvent): void {
  const validated = parseDiagramAgentEvent(event);
  if (!validated) {
    throw new Error('Agent emitted an invalid event.');
  }
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main();
