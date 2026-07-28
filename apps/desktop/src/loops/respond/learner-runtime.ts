import { createInterface } from 'node:readline';
import {
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  parseRespondLearnerEvent,
  parseRespondLearnerRuntimeRequest,
  type RespondLearnerEvent,
  type RespondLearnerRuntimeRequest,
} from './learner-protocol';
import {
  createRespondLearnerTools,
  type RespondLearnerToolState,
} from './learner-tools';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const SYSTEM_PROMPT = `You are the Evidence Respond Learner for exactly one human-accepted Showcase.

Role boundary:
- Treat the supplied Story Revision, Pair Manifest, approved commit, Showcase evidence bundle, independent Review, human accept decision, and Respond authority hash as immutable.
- Inspect only relevant changed source through read-only tools. You have no write, edit, command, commit, merge, push, or decision tool.
- Propose only knowledge actually used by the confirmed Scenarios and validated by execution plus human Showcase observations. A file existing is not validation.
- promoted requires a repository-relative canonical target and validation evidence. deferred/rejected preserve a reason without claiming authority. Empty promotions are valid with a concrete no-promotion reason.
- Produce observed outcomes, residual risks, and exactly one concrete next Probe with a learning question, why now, evidence refs, and a first human-controlled action.
- You cannot approve or revise the Candidate, complete the Iteration, capture the Probe into Inbox, or start another Story.
- Call evidence_submit_respond_candidate exactly once, then stop.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runRespondLearnerRequest(
  request: RespondLearnerRuntimeRequest,
  emit: (event: RespondLearnerEvent) => void,
): Promise<void> {
  const state: RespondLearnerToolState = { response: null };
  const tools = await createRespondLearnerTools(request.worktreeRoot, state);
  const session = await createSession(request.worktreeRoot, tools);
  const unsubscribe = session.subscribe((sessionEvent) => {
    for (const mapped of mapSessionEvent(request.id, sessionEvent))
      emit(mapped);
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void session.abort().catch(() => undefined);
  }, request.timeoutMs);
  try {
    emit(event(request.id, 'progress', 'Read-only Respond Learner started'));
    await session.prompt(learnerPrompt(request), {
      expandPromptTemplates: false,
    });
    if (timedOut) throw new Error('Respond Learner timed out.');
    if (!state.response) {
      throw new Error('Respond Learner finished without one Candidate.');
    }
    emit({
      id: request.id,
      event: 'complete',
      data: '',
      details: { ...state.response, agentCallCount: 1 },
    });
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    await session.abort().catch(() => undefined);
    session.dispose();
  }
}

async function createSession(
  cwd: string,
  tools: ToolDefinition[],
): Promise<RuntimeSession> {
  const {
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = await import(/* @vite-ignore */ PI_SDK_MODULE_NAME);
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
    noContextFiles: false,
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
    sessionManager: SessionManager.inMemory(cwd),
    noTools: 'builtin',
    customTools: tools,
  });
  return session;
}

function learnerPrompt(request: RespondLearnerRuntimeRequest): string {
  return `Propose one bounded knowledge response for this accepted Story. Inspect only changed paths needed to verify a claimed promotion. Submit one Candidate, then stop.\n\n${JSON.stringify(
    {
      authoritySha256: request.authoritySha256,
      approvedCommitSha: request.approvedCommitSha,
      changedPaths: request.changedPaths,
      evidence: request.evidence,
    },
    null,
    2,
  )}`;
}

function mapSessionEvent(
  id: string,
  sessionEvent: AgentSessionEvent,
): RespondLearnerEvent[] {
  if (sessionEvent.type === 'tool_execution_start') {
    return [event(id, 'tool-start', sessionEvent.toolName)];
  }
  if (sessionEvent.type === 'tool_execution_end') {
    return [
      event(
        id,
        'tool-end',
        JSON.stringify({
          toolName: sessionEvent.toolName,
          isError: sessionEvent.isError,
        }),
      ),
    ];
  }
  if (sessionEvent.type === 'auto_retry_start') {
    return [
      event(
        id,
        'progress',
        `Retrying model request ${String(sessionEvent.attempt)}`,
      ),
    ];
  }
  return [];
}

function event(
  id: string,
  kind: 'progress' | 'tool-start' | 'tool-end' | 'error',
  data: string,
): RespondLearnerEvent {
  return { id, event: kind, data };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolveLine, reject) => {
    input.once('line', resolveLine);
    input.once('close', () =>
      reject(new Error('Respond Learner request was not provided.')),
    );
  });
  input.close();
  let requestId = 'unknown';
  try {
    const request = parseRespondLearnerRuntimeRequest(
      JSON.parse(line) as unknown,
    );
    requestId = request.id;
    await runRespondLearnerRequest(request, writeEvent);
  } catch (error) {
    writeEvent(
      event(
        requestId,
        'error',
        error instanceof Error ? error.message : String(error),
      ),
    );
    process.exitCode = 1;
  }
}

function writeEvent(value: RespondLearnerEvent): void {
  const validated = parseRespondLearnerEvent(value);
  if (!validated) throw new Error('Respond Learner emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

void main();
