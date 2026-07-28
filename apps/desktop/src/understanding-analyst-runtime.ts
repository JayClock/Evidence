import { createInterface } from 'node:readline';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import {
  parseAnalystEvent,
  parseUnderstandingAnalystRuntimeRequest,
  type AnalystEvent,
  type UnderstandingAnalystRuntimeRequest,
} from './capabilities/analyst-process/protocol';
import { FlowApiClient } from './adapters/server-api/flow-client';
import { createUnderstandingAnalystTools } from './understanding-analyst-tools';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const DEFAULT_TIMEOUT_MS = 120_000;
const SYSTEM_PROMPT = `You are the local Evidence Requirements Analyst for one active Story in Understand/TQA.

Rules:
- Treat the supplied Server Story Revision, Frozen Intake references, clarification history, and human decisions as authority. Session history is only a cache.
- Identify the single business uncertainty that most changes the Story boundary or observable outcome.
- If uncertainty remains, call evidence_ask_tqa_question exactly once with one business-facing question and stop. Never ask for frameworks, databases, runtimes, internal components, or tests.
- Route concepts, rules, authority, journey, or product-wide facts to business_context; an incorrect role, negotiable goal, value, problem, or Card boundary to story; local details to history.
- Never answer a question yourself or infer a domain expert answer.
- If knowledge is sufficient, call evidence_propose_story_scenarios exactly once with the complete, non-duplicate 1–5 Scenario set and stop.
- Every Scenario has concrete Given facts, exactly one When, observable Then outcomes, and exact businessData. Include normal, alternative, boundary, and business-rejection examples where applicable.
- Never include internal implementation or test steps and never make a human decision.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runUnderstandingAnalystRequest(
  request: UnderstandingAnalystRuntimeRequest,
  emit: (event: AnalystEvent) => void,
): Promise<void> {
  const client = new FlowApiClient({
    apiBaseUrl: request.apiBaseUrl,
    authorization: process.env.EVIDENCE_API_AUTHORIZATION,
  });
  const iteration = await client.getIteration(
    request.workspaceId,
    request.iterationId,
  );
  const understanding = await client.getUnderstanding(iteration);
  if (
    understanding.iteration.lifecycle !== 'active' ||
    understanding.iteration.loop !== 'understand' ||
    understanding.iteration.stage !== 'tqa' ||
    understanding.pendingClarification
  ) {
    throw new Error(
      `Iteration ${iteration.reference} is not ready for a TQA Analyst turn.`,
    );
  }
  const toolState = { attempted: false, completed: false };
  const session = await createSession(
    request.sessionDirectory,
    createUnderstandingAnalystTools(client, understanding, toolState),
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
    emit(agentEvent(request.id, 'progress', 'Clarifying the active Story'));
    await session.prompt(
      `Continue one-Story TQA from this exact Server authority snapshot. Call exactly one workflow tool, then stop.\n\n${JSON.stringify(
        understanding.raw,
        null,
        2,
      )}`,
      { expandPromptTemplates: false },
    );
    if (timedOut) throw new Error('Understanding Analyst timed out.');
    if (!toolState.completed) {
      throw new Error(
        'Understanding Analyst finished without asking one question or proposing Scenarios.',
      );
    }
    emit(agentEvent(request.id, 'complete', ''));
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    await session.abort().catch(() => undefined);
    session.dispose();
  }
}

async function createSession(
  sessionDirectory: string,
  tools: ReturnType<typeof createUnderstandingAnalystTools>,
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
  const existing = await SessionManager.list(cwd, sessionDirectory);
  if (existing.length > 1) {
    throw new Error('The TQA session directory contains multiple sessions.');
  }
  const sessionManager = existing[0]
    ? SessionManager.open(existing[0].path, sessionDirectory)
    : SessionManager.create(cwd, sessionDirectory);
  const settingsManager = SettingsManager.inMemory({
    retry: { enabled: true, maxRetries: 2 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
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
    agentDir: getAgentDir(),
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager,
    noTools: 'builtin',
    customTools: tools,
  });
  return session;
}

function mapSessionEvent(id: string, event: AgentSessionEvent): AnalystEvent[] {
  if (event.type === 'tool_execution_start') {
    return [agentEvent(id, 'tool-start', event.toolName)];
  }
  if (event.type === 'tool_execution_end') {
    return [
      agentEvent(
        id,
        'tool-end',
        JSON.stringify({ toolName: event.toolName, isError: event.isError }),
      ),
    ];
  }
  if (event.type === 'auto_retry_start') {
    return [
      agentEvent(
        id,
        'progress',
        `Retrying model request ${String(event.attempt)}`,
      ),
    ];
  }
  return [];
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
      reject(new Error('TQA request was not provided.')),
    );
  });
  input.close();
  let requestId = 'unknown';
  try {
    const request = parseUnderstandingAnalystRuntimeRequest(
      JSON.parse(line) as unknown,
    );
    requestId = request.id;
    await runUnderstandingAnalystRequest(request, writeEvent);
  } catch (error) {
    writeEvent(
      agentEvent(
        requestId,
        'error',
        error instanceof Error ? error.message : String(error),
      ),
    );
    process.exitCode = 1;
  }
}

function writeEvent(event: AnalystEvent): void {
  const validated = parseAnalystEvent(event);
  if (!validated) throw new Error('TQA Analyst emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

void main();
