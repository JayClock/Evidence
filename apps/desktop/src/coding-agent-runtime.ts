import { createInterface } from 'node:readline';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import { resolveCodingAgentTimeoutMs } from './coding-agent-timeout';
import {
  parseCodingAgentEvent,
  parseCodingAgentRuntimeRequest,
  type CodingAgentEvent,
  type CodingAgentRuntimeRequest,
} from './coding-agent-protocol';
import {
  assertCodingAgentSucceeded,
  createCodingAgentOutcome,
  markCodingAgentTimedOut,
  observeCodingAgentEvent,
} from './coding-agent-outcome';
import { createCodingAgentTools } from './coding-agent-tools';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';

const SYSTEM_PROMPT = `You are the local Evidence coding agent.

You implement exactly one human-confirmed Story Revision in an isolated Git worktree.

Rules:
- Treat the supplied Story Revision and ordered Given/When/Then Scenarios as the complete acceptance boundary.
- Read AGENTS.md and relevant code before changing files.
- Make the smallest coherent production and test changes that satisfy every Scenario.
- Use only the provided worktree-scoped tools.
- Never commit, merge, push, install dependencies, access credentials, or modify Git metadata.
- Run focused quality gates with run_quality_gate while iterating.
- Inspect the final diff and report a concise factual summary.
- Never claim a gate passed unless its tool result succeeded.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runCodingAgentRequest(
  request: CodingAgentRuntimeRequest,
  emit: (event: CodingAgentEvent) => void,
): Promise<void> {
  const session = await createSession(
    request.worktreeRoot,
    request.qualityGateScripts,
  );
  const outcome = createCodingAgentOutcome();
  const unsubscribe = session.subscribe((event) => {
    observeCodingAgentEvent(outcome, event);
    for (const mapped of mapSessionEvent(request.id, event)) emit(mapped);
  });
  const timeout = setTimeout(() => {
    markCodingAgentTimedOut(outcome);
    void session.abort().catch(() => undefined);
  }, resolveCodingAgentTimeoutMs());

  try {
    await session.prompt(storyPrompt(request), {
      expandPromptTemplates: false,
    });
    assertCodingAgentSucceeded(outcome);
    emit(codingEvent(request.id, 'complete', ''));
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    try {
      await session.abort();
    } catch {
      // A settled one-shot session may already be idle.
    }
    session.dispose();
  }
}

async function createSession(
  worktreeRoot: string,
  qualityGateScripts: CodingAgentRuntimeRequest['qualityGateScripts'],
): Promise<RuntimeSession> {
  const {
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = await import(/* @vite-ignore */ PI_SDK_MODULE_NAME);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: worktreeRoot,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: false,
    systemPrompt: SYSTEM_PROMPT,
  });
  await resourceLoader.reload();
  const modelRuntime = await ModelRuntime.create();
  const { session } = await createAgentSession({
    cwd: worktreeRoot,
    agentDir,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(worktreeRoot),
    noTools: 'builtin',
    customTools: await createCodingAgentTools(worktreeRoot, qualityGateScripts),
  });
  return session;
}

function storyPrompt(request: CodingAgentRuntimeRequest): string {
  const revision = request.storyRevision;
  const scenarios = revision.scenarios
    .map(
      (scenario, index) => `Scenario ${String(index + 1)}: ${scenario.title}
Given:
${scenario.given.map((step) => `- ${step}`).join('\n')}
When:
- ${scenario.when}
Then:
${scenario.then.map((step) => `- ${step}`).join('\n')}`,
    )
    .join('\n\n');
  return `Implement Story Revision ${revision.id} (v${String(revision.revisionNumber)}, ${revision.contentSha256}).

Title: ${revision.title}
Role: ${revision.role}
Problem: ${revision.problem}
Goal: ${revision.goal}
Value: ${revision.value}
Cognitive mode: ${revision.cognitiveMode}

Acceptance Scenarios:

${scenarios}`;
}

function mapSessionEvent(
  id: string,
  event: AgentSessionEvent,
): CodingAgentEvent[] {
  switch (event.type) {
    case 'message_update':
      return event.assistantMessageEvent.type === 'text_delta'
        ? [codingEvent(id, 'message', event.assistantMessageEvent.delta)]
        : [];
    case 'tool_execution_start':
      return [
        codingEvent(id, 'tool-start', {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        }),
      ];
    case 'tool_execution_end':
      return [
        codingEvent(id, 'tool-end', {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
        }),
      ];
    case 'auto_retry_start':
      return [codingEvent(id, 'retry', { attempt: event.attempt })];
    default:
      return [];
  }
}

function codingEvent(
  id: string,
  event: string,
  data: unknown,
): CodingAgentEvent {
  return {
    id,
    event,
    data: typeof data === 'string' ? data : JSON.stringify(data),
  };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolve, reject) => {
    input.once('line', resolve);
    input.once('close', () =>
      reject(new Error('Coding Agent request was not provided.')),
    );
  });
  input.close();

  let requestId = 'unknown';
  try {
    const parsed: unknown = JSON.parse(line);
    const request = parseCodingAgentRuntimeRequest(parsed);
    requestId = request.id;
    await runCodingAgentRequest(request, writeEvent);
  } catch (error) {
    writeEvent(codingEvent(requestId, 'error', errorMessage(error)));
    process.exitCode = 1;
  }
}

function writeEvent(event: CodingAgentEvent): void {
  const validated = parseCodingAgentEvent(event);
  if (!validated) throw new Error('Coding Agent emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main();
