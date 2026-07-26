import { createInterface } from 'node:readline';
import {
  defineTool,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  parsePairRedReviewerEvent,
  parsePairRedReviewerRuntimeRequest,
  type PairRedClassification,
  type PairRedReviewerEvent,
  type PairRedReviewerRuntimeRequest,
} from './pair-red-reviewer-protocol';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const CLASSIFICATIONS = [
  'behavior',
  'compile',
  'dependency',
  'configuration',
  'network',
  'fixture',
  'other',
] as const;
const SYSTEM_PROMPT = `You are the independent Evidence Red Reviewer for exactly one TEST observation.

Rules:
- You receive only the approved TEST intent, expected behavior Red contract, and bounded local command diagnostics.
- Classify "behavior" only when the test reached its intended observable assertion and failed because the approved behavior is absent.
- Compile/type/syntax failures are "compile". Missing packages or module resolution are "dependency". Runner, target, environment, or setup failures are "configuration". External connectivity failures are "network". Invalid/missing test data or setup are "fixture". Anything else is "other".
- A non-zero exit alone never proves behavior Red. Never reinterpret a pseudo-Red as behavior.
- Do not propose code, tests, commands, architecture, or repairs. Do not quote source or command output verbatim in the reason.
- Call evidence_classify_pair_red exactly once with one classification and bounded factual reason, then stop. You grant no checkpoint authority.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

interface ReviewState {
  classification: PairRedClassification | null;
  reason: string | null;
}

export async function runPairRedReviewerRequest(
  request: PairRedReviewerRuntimeRequest,
  emit: (event: PairRedReviewerEvent) => void,
): Promise<void> {
  const state: ReviewState = { classification: null, reason: null };
  const session = await createSession(createReviewerTool(state));
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
    emit(event(request.id, 'progress', 'Independent Red Review started'));
    await session.prompt(reviewPrompt(request), {
      expandPromptTemplates: false,
    });
    if (timedOut) throw new Error('Independent Red Reviewer timed out.');
    if (!state.classification || !state.reason) {
      throw new Error(
        'Independent Red Reviewer finished without one classification.',
      );
    }
    emit({
      id: request.id,
      event: 'complete',
      data: '',
      details: {
        classification: state.classification,
        reason: state.reason,
        agentCallCount: 1,
      },
    });
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    await session.abort().catch(() => undefined);
    session.dispose();
  }
}

function createReviewerTool(state: ReviewState): ToolDefinition {
  return defineTool({
    name: 'evidence_classify_pair_red',
    label: 'Classify observed Red',
    description:
      'Submit exactly one independent Red classification without proposing a repair.',
    parameters: Type.Object({
      classification: Type.Union(
        CLASSIFICATIONS.map((value) => Type.Literal(value)),
      ),
      reason: Type.String({ minLength: 1, maxLength: 2_000 }),
    }),
    async execute(_toolCallId, params) {
      if (state.classification) {
        throw new Error('Red classification is one-shot.');
      }
      state.classification = params.classification;
      state.reason = params.reason.trim();
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Red classification was returned to the local Controller for Server validation.',
          },
        ],
        details: {
          classification: state.classification,
          reason: state.reason,
        },
      };
    },
  });
}

async function createSession(tool: ToolDefinition): Promise<RuntimeSession> {
  const {
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = await import(/* @vite-ignore */ PI_SDK_MODULE_NAME);
  const cwd = process.cwd();
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
    sessionManager: SessionManager.inMemory(cwd),
    noTools: 'builtin',
    customTools: [tool],
  });
  return session;
}

function reviewPrompt(request: PairRedReviewerRuntimeRequest): string {
  return `Classify this one observed Red against the exact expected behavior contract. Call the classification tool exactly once, then stop.

${JSON.stringify(
  {
    test: request.test,
    expectedRed: request.expectedRed,
    observation: request.observation,
  },
  null,
  2,
)}`;
}

function mapSessionEvent(
  id: string,
  sessionEvent: AgentSessionEvent,
): PairRedReviewerEvent[] {
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
): PairRedReviewerEvent {
  return { id, event: kind, data };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolveLine, reject) => {
    input.once('line', resolveLine);
    input.once('close', () =>
      reject(new Error('Red Reviewer request was not provided.')),
    );
  });
  input.close();
  let requestId = 'unknown';
  try {
    const request = parsePairRedReviewerRuntimeRequest(
      JSON.parse(line) as unknown,
    );
    requestId = request.id;
    await runPairRedReviewerRequest(request, writeEvent);
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

function writeEvent(value: PairRedReviewerEvent): void {
  const validated = parsePairRedReviewerEvent(value);
  if (!validated) throw new Error('Red Reviewer emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

void main();
