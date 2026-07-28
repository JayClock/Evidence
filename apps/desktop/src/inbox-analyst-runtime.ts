import { createInterface } from 'node:readline';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import { createInboxAnalystTools } from './inbox-analyst-tools';
import {
  parseAnalystEvent,
  parseInboxAnalystRuntimeRequest,
  type AnalystEvent,
  type InboxAnalystRuntimeRequest,
} from './capabilities/analyst-process/protocol';
import { FlowApiClient } from './adapters/server-api/flow-client';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const DEFAULT_TIMEOUT_MS = 120_000;

const SYSTEM_PROMPT = `You are the local Evidence Inbox Analyst.

You propose a complete, bounded set of delivery Candidates from one human-selected Inbox Extraction.

Rules:
- Treat the supplied immutable source snapshots as the only source authority.
- Propose one to five Candidates. Each Candidate describes one user or business problem, role, negotiable goal, and value without implementation details.
- Cite exact Inbox Item ids, exact selected Revision SHA-256 values, and concrete locators.
- The complete Candidate set must cite every selected source; never cite an unselected or newer source.
- Candidates have no Story id and no human authority.
- Call evidence_propose_inbox_stories exactly once with the complete set, then stop.
- Do not claim completion without a successful tool result.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runInboxAnalystRequest(
  request: InboxAnalystRuntimeRequest,
  emit: (event: AnalystEvent) => void,
): Promise<void> {
  const client = new FlowApiClient({
    apiBaseUrl: request.apiBaseUrl,
    authorization: process.env.EVIDENCE_API_AUTHORIZATION,
  });
  const extraction = await client.getExtraction(
    request.workspaceId,
    request.extractionId,
  );
  if (extraction.status !== 'awaiting_agent') {
    throw new Error(
      `Inbox Extraction ${extraction.id} is ${extraction.status} and cannot be analyzed.`,
    );
  }
  const toolState = { attempted: false, completed: false };
  const session = await createSession(
    createInboxAnalystTools(client, extraction, toolState),
  );
  const unsubscribe = session.subscribe((event) => {
    for (const mapped of mapSessionEvent(request.id, event)) emit(mapped);
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void session.abort().catch(() => undefined);
  }, DEFAULT_TIMEOUT_MS);

  try {
    emit(agentEvent(request.id, 'progress', 'Analyzing frozen Inbox sources'));
    await session.prompt(extractionPrompt(extraction.raw), {
      expandPromptTemplates: false,
    });
    if (timedOut) throw new Error('Inbox Analyst timed out.');
    if (!toolState.completed) {
      throw new Error(
        'Inbox Analyst finished without submitting the Candidate set.',
      );
    }
    emit(agentEvent(request.id, 'complete', ''));
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    try {
      await session.abort();
    } catch {
      // A completed one-shot session may already be idle.
    }
    session.dispose();
  }
}

async function createSession(
  tools: ReturnType<typeof createInboxAnalystTools>,
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
    customTools: tools,
  });
  return session;
}

function extractionPrompt(extraction: Record<string, unknown>): string {
  return `Analyze this exact frozen Inbox Extraction and submit the complete Candidate set.\n\n${JSON.stringify(
    extraction,
    null,
    2,
  )}`;
}

function mapSessionEvent(id: string, event: AgentSessionEvent): AnalystEvent[] {
  switch (event.type) {
    case 'tool_execution_start':
      return [agentEvent(id, 'tool-start', event.toolName)];
    case 'tool_execution_end':
      return [
        agentEvent(
          id,
          'tool-end',
          JSON.stringify({ toolName: event.toolName, isError: event.isError }),
        ),
      ];
    case 'auto_retry_start':
      return [
        agentEvent(
          id,
          'progress',
          `Retrying model request ${String(event.attempt)}`,
        ),
      ];
    default:
      return [];
  }
}

function agentEvent(
  id: string,
  event: AnalystEvent['event'],
  data: string,
): AnalystEvent {
  return { id, event, data };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolve, reject) => {
    input.once('line', resolve);
    input.once('close', () =>
      reject(new Error('Inbox Analyst request was not provided.')),
    );
  });
  input.close();

  let requestId = 'unknown';
  try {
    const request = parseInboxAnalystRuntimeRequest(
      JSON.parse(line) as unknown,
    );
    requestId = request.id;
    await runInboxAnalystRequest(request, writeEvent);
  } catch (error) {
    writeEvent(agentEvent(requestId, 'error', errorMessage(error)));
    process.exitCode = 1;
  }
}

function writeEvent(event: AnalystEvent): void {
  const validated = parseAnalystEvent(event);
  if (!validated) throw new Error('Inbox Analyst emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main();
