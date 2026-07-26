import { createInterface } from 'node:readline';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import {
  parsePairDriverEvent,
  parsePairDriverRuntimeRequest,
  type PairDriverEvent,
  type PairDriverRuntimeRequest,
} from './pair-agent-protocol';
import {
  createPairDriverTools,
  pairDriverWritePolicy,
} from './pair-driver-tools';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runPairDriverRequest(
  request: PairDriverRuntimeRequest,
  emit: (event: PairDriverEvent) => void,
): Promise<void> {
  const state = { completed: false, summary: null as string | null };
  const tools = await createPairDriverTools(
    request.worktreeRoot,
    pairDriverWritePolicy(request),
    state,
  );
  const session = await createSession(
    request.worktreeRoot,
    systemPrompt(request),
    tools,
  );
  const unsubscribe = session.subscribe((event) => {
    for (const mapped of mapSessionEvent(request.id, event)) emit(mapped);
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void session.abort().catch(() => undefined);
  }, request.timeoutMs);
  try {
    emit(event(request.id, 'progress', `${label(request)} started`));
    await session.prompt(driverPrompt(request), {
      expandPromptTemplates: false,
    });
    if (timedOut) throw new Error(`${label(request)} timed out.`);
    if (!state.completed || !state.summary) {
      throw new Error(
        `${label(request)} finished without one bounded completion.`,
      );
    }
    emit({
      id: request.id,
      event: 'complete',
      data: '',
      details: { summary: state.summary, agentCallCount: 1 },
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
  systemPrompt: string,
  tools: Awaited<ReturnType<typeof createPairDriverTools>>,
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
    noContextFiles: true,
    systemPrompt,
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

function systemPrompt(request: PairDriverRuntimeRequest): string {
  const common = `You are one short-lived Evidence ${label(request)} for exactly one approved TEST checkpoint.

Hard rules:
- Treat the supplied Story Revision, Approved Tasking Plan hash, TASK, TEST, process step, path policy, and current worktree as authority.
- Use only the provided read/edit/write/search/list/completion tools. There is no shell or command tool. Never attempt to run tests, gates, package managers, Git commands, commits, merge, or push.
- Stay inside the allowed write roots. Never modify .git, .pi, .evidence, engineering/evidence-orchestrator, artifacts/iterations, node_modules, package manifests, lockfiles, Nx/project config, or tsconfig.
- Do not weaken, delete, skip, focus, or rewrite already frozen tests.
- Make the smallest change for this one checkpoint. Do not perform future TASKs or unrelated cleanup.
- Call evidence_complete_pair_driver exactly once with a factual bounded summary, then stop. The local Controller independently validates paths, diff, Git HEAD, and commands; your completion grants no authority.`;
  if (request.role === 'test') {
    return `${common}

TEST DRIVER:
- Add or repair exactly the current TEST in an allowed nearest test root.
- Do not modify production code.
- Express the approved TEST intent and business data through an observable assertion.
- The test must be capable of reaching the expected behavior assertion; do not manufacture compile, dependency, configuration, fixture, or network failures.
- Do not inspect or predict command output.`;
  }
  if (request.role === 'production') {
    return `${common}

PRODUCTION DRIVER:
- Treat every test path as frozen and read-only.
- Implement or repair only the minimum production behavior needed by the current TEST or supplied local diagnostic.
- Preserve existing architecture and public contracts unless the approved TASK explicitly requires their production behavior.
- Do not refactor beyond what is necessary for Green.`;
  }
  return `${common}

REFACTOR DRIVER:
- All TESTs in this process step are already Green and frozen.
- Improve only the production structure already involved in this process step without changing behavior or adding scope.
- If no safe, useful refactor exists, make no file change and explicitly report a no-op completion.
- Do not add features or modify tests.`;
}

function driverPrompt(request: PairDriverRuntimeRequest): string {
  return `Perform only this bounded ${label(request)} turn. Do not run commands. Call the completion tool exactly once when finished.

${JSON.stringify(
  {
    authority: request.authority,
    story: request.story,
    task: request.workUnit.task,
    test: request.workUnit.test,
    process: request.workUnit.process,
    step: request.workUnit.step,
    writePolicy: {
      allowedTestRoots: request.allowedTestRoots,
      allowedProductionRoots: request.allowedProductionRoots,
      frozenTestPaths: request.frozenTestPaths,
    },
    diagnostic: request.diagnostic,
  },
  null,
  2,
)}`;
}

function label(request: PairDriverRuntimeRequest): string {
  if (request.role === 'test') return 'Test Driver';
  if (request.role === 'refactor') return 'Refactor Driver';
  return request.mode.startsWith('repair')
    ? 'Production Repair Driver'
    : 'Production Driver';
}

function mapSessionEvent(
  id: string,
  sessionEvent: AgentSessionEvent,
): PairDriverEvent[] {
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
): PairDriverEvent {
  return { id, event: kind, data };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolveLine, reject) => {
    input.once('line', resolveLine);
    input.once('close', () =>
      reject(new Error('Pair Driver request was not provided.')),
    );
  });
  input.close();
  let requestId = 'unknown';
  try {
    const request = parsePairDriverRuntimeRequest(JSON.parse(line) as unknown);
    requestId = request.id;
    await runPairDriverRequest(request, writeEvent);
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

function writeEvent(value: PairDriverEvent): void {
  const validated = parsePairDriverEvent(value);
  if (!validated) throw new Error('Pair Driver emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

void main();
