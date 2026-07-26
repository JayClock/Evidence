import { createInterface } from 'node:readline';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import {
  parseIntakeAgentEvent,
  parseKickoffAnalystRuntimeRequest,
  type IntakeAgentEvent,
  type KickoffAnalystRuntimeRequest,
} from './intake-agent-protocol';
import { IntakeApiClient } from './intake-api-client';
import { createKickoffAnalystTools } from './kickoff-analyst-tools';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const DEFAULT_TIMEOUT_MS = 120_000;

const SYSTEM_PROMPT = `You are the local Evidence Requirements Analyst for Kickoff revision.

Rules:
- Work on exactly one Iteration in candidate_drafting.
- Treat Frozen Intake and append-only human Decision history as the only source authority.
- Address the human revise reasons while preserving one user/business problem, role, negotiable goal, and value.
- Cite only exact Frozen Intake Item ids and Revision SHA-256 values.
- Never read or substitute live Inbox content.
- Never assign a Story id, confirm a Proposal, or make a human decision.
- Call evidence_propose_kickoff_candidate exactly once, then stop.
- Do not claim completion without a successful tool result.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runKickoffAnalystRequest(
  request: KickoffAnalystRuntimeRequest,
  emit: (event: IntakeAgentEvent) => void,
): Promise<void> {
  const client = new IntakeApiClient({
    apiBaseUrl: request.apiBaseUrl,
    authorization: process.env.EVIDENCE_API_AUTHORIZATION,
  });
  const iteration = await client.getIteration(
    request.workspaceId,
    request.iterationId,
  );
  const kickoff = await client.getKickoff(iteration);
  if (
    kickoff.iteration.lifecycle !== 'active' ||
    kickoff.iteration.loop !== 'kickoff' ||
    kickoff.iteration.stage !== 'candidate_drafting'
  ) {
    throw new Error(
      `Iteration ${iteration.reference} is not drafting a Kickoff replacement.`,
    );
  }
  const toolState = { attempted: false, completed: false };
  const session = await createSession(
    createKickoffAnalystTools(client, kickoff, toolState),
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
    emit(
      agentEvent(request.id, 'progress', 'Revising the frozen Kickoff intake'),
    );
    await session.prompt(
      `Propose one replacement from this Frozen Intake and human Decision history.\n\n${JSON.stringify(
        {
          iteration: {
            id: kickoff.iteration.id,
            reference: kickoff.iteration.reference,
            version: kickoff.iteration.version,
          },
          intake: kickoff.intake,
          decisions: kickoff.decisions,
        },
        null,
        2,
      )}`,
      { expandPromptTemplates: false },
    );
    if (timedOut) throw new Error('Kickoff Analyst timed out.');
    if (!toolState.completed) {
      throw new Error(
        'Kickoff Analyst finished without submitting a replacement Proposal.',
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
  tools: ReturnType<typeof createKickoffAnalystTools>,
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

function mapSessionEvent(
  id: string,
  event: AgentSessionEvent,
): IntakeAgentEvent[] {
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
  event: IntakeAgentEvent['event'],
  data: string,
): IntakeAgentEvent {
  return { id, event, data };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolve, reject) => {
    input.once('line', resolve);
    input.once('close', () =>
      reject(new Error('Kickoff Analyst request was not provided.')),
    );
  });
  input.close();

  let requestId = 'unknown';
  try {
    const request = parseKickoffAnalystRuntimeRequest(
      JSON.parse(line) as unknown,
    );
    requestId = request.id;
    await runKickoffAnalystRequest(request, writeEvent);
  } catch (error) {
    writeEvent(agentEvent(requestId, 'error', errorMessage(error)));
    process.exitCode = 1;
  }
}

function writeEvent(event: IntakeAgentEvent): void {
  const validated = parseIntakeAgentEvent(event);
  if (!validated) throw new Error('Kickoff Analyst emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main();
