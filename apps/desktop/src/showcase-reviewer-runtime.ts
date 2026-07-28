import { createInterface } from 'node:readline';
import {
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  parseShowcaseReviewerEvent,
  parseShowcaseReviewerRuntimeRequest,
  type ShowcaseReviewerEvent,
  type ShowcaseReviewerRuntimeRequest,
} from './showcase-reviewer-protocol';
import {
  createShowcaseReviewerTools,
  type ShowcaseReviewerToolState,
} from './showcase-reviewer-tools';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const SYSTEM_PROMPT = `You are the independent Evidence Showcase Reviewer for exactly one approved Story increment.

Review boundary:
- Pair already answered whether the implementation matched its Approved Tasking Plan. Showcase asks whether the observed product behavior delivers the intended user/business value.
- Treat the supplied Story Revision, Q2 observations, human product observations, risk decisions, evaluations, Pair Manifest, approved commit, and evidence bundle hash as locked authority.
- Inspect only relevant changed source through the read-only tools. You have no write or command tool.
- Separate observed facts, product/domain feedback, technical quality feedback, and unresolved assumptions. Do not invent observations or claim evidence you cannot see.
- Automated Q2 evidence cannot replace human product observation. You cannot accept, revise, reject, merge, push, or make the human value decision.
- Recommend "accept" only when supplied observations support every Scenario value boundary and there is no unresolved material concern. Otherwise recommend "revise" and state the missing knowledge.
- Call evidence_submit_showcase_review exactly once, then stop.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runShowcaseReviewerRequest(
  request: ShowcaseReviewerRuntimeRequest,
  emit: (event: ShowcaseReviewerEvent) => void,
): Promise<void> {
  const state: ShowcaseReviewerToolState = { review: null };
  const tools = await createShowcaseReviewerTools(request.worktreeRoot, state);
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
    emit(event(request.id, 'progress', 'Independent Showcase Review started'));
    await session.prompt(reviewPrompt(request), {
      expandPromptTemplates: false,
    });
    if (timedOut) throw new Error('Independent Showcase Reviewer timed out.');
    if (!state.review) {
      throw new Error(
        'Independent Showcase Reviewer finished without one report.',
      );
    }
    emit({
      id: request.id,
      event: 'complete',
      data: '',
      details: { ...state.review, agentCallCount: 1 },
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

function reviewPrompt(request: ShowcaseReviewerRuntimeRequest): string {
  return `Review this exact Showcase evidence bundle. Inspect only changed files needed to validate the findings. Submit one structured Review, then stop.\n\n${JSON.stringify(
    {
      evidenceBundleSha256: request.evidenceBundleSha256,
      story: request.story,
      pair: request.pair,
      q2Observations: request.q2Observations,
      productObservations: request.productObservations,
      riskDecisions: request.riskDecisions,
      evaluations: request.evaluations,
    },
    null,
    2,
  )}`;
}

function mapSessionEvent(
  id: string,
  sessionEvent: AgentSessionEvent,
): ShowcaseReviewerEvent[] {
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
): ShowcaseReviewerEvent {
  return { id, event: kind, data };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolveLine, reject) => {
    input.once('line', resolveLine);
    input.once('close', () =>
      reject(new Error('Showcase Reviewer request was not provided.')),
    );
  });
  input.close();
  let requestId = 'unknown';
  try {
    const request = parseShowcaseReviewerRuntimeRequest(
      JSON.parse(line) as unknown,
    );
    requestId = request.id;
    await runShowcaseReviewerRequest(request, writeEvent);
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

function writeEvent(value: ShowcaseReviewerEvent): void {
  const validated = parseShowcaseReviewerEvent(value);
  if (!validated)
    throw new Error('Showcase Reviewer emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

void main();
