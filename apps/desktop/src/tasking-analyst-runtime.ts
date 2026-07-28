import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import {
  parseIntakeAgentEvent,
  parseTaskingAnalystRuntimeRequest,
  type IntakeAgentEvent,
  type TaskingAnalystRuntimeRequest,
} from './intake-agent-protocol';
import { IntakeApiClient } from './intake-api-client';
import {
  canonicalGitRepository,
  gitHead,
  runGit,
} from './adapters/git/repository';
import { readNxProjectCatalog } from './adapters/nx/project-catalog';
import { createTaskingAnalystTools } from './tasking-analyst-tools';

const PI_SDK_MODULE_NAME = '@earendil-works/pi-coding-agent';
const DEFAULT_TIMEOUT_MS = 180_000;
const SYSTEM_PROMPT = `You are the local Evidence Tasking Analyst for one confirmed no-model-impact Story.

Rules:
- Treat the supplied Server Story Revision, complete confirmed SC-xxx set, No Model Impact Decision, Iteration Git baseline, process catalog, and bounded Nx project catalog as authority.
- Call evidence_propose_tasking_candidate exactly once with one complete Candidate, then stop. Never make a Desk Check decision and never start coding.
- Create one independent Q2 TEST for every exact Scenario Then outcome. Each Q2 cites exactly one SC-xxx, copies that Then verbatim as scenarioOutcome, and lists only businessData from that Scenario.
- Add the smallest deduplicated Q1 support set. Every Q1 supports at least one Q2 and every Q2 names valid Q1 supportedBy ids.
- Use TEST-001... and TASK-001... without gaps. Every TEST belongs to exactly one TASK. TASK order must satisfy dependsOn and preserve each runtime process step order.
- Select one runtime plan for each affected product boundary. Its functionalContexts and technicalBoundaries must uniquely match one supplied v3 process. Include one TEST for every selected process step.
- TypeScript TESTs use only supplied Nx project ids, the nearest owning project, safe testFilter tokens, and no shell text. The Server materializes all commands and locked gates.
- Because No Model Impact is authoritative, every TEST modelRefs and every resulting TASK modelRefs are empty. Do not invent model facts.
- Do not include absolute paths, source, diffs, output, prompts, session messages, credentials, or implementation code.`;

type RuntimeSession = Pick<
  AgentSession,
  'abort' | 'dispose' | 'prompt' | 'subscribe'
>;

export async function runTaskingAnalystRequest(
  request: TaskingAnalystRuntimeRequest,
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
  const tasking = await client.getTasking(iteration);
  if (
    tasking.iteration.lifecycle !== 'active' ||
    tasking.iteration.loop !== 'tasking' ||
    !['drafting', 'knowledge_gap'].includes(tasking.iteration.stage) ||
    !tasking.noModelImpactDecision ||
    tasking.currentCandidate
  ) {
    throw new Error(
      `Iteration ${iteration.reference} is not ready for a Tasking Analyst turn.`,
    );
  }
  await verifyIterationWorktree(request, tasking.iteration);
  emit(
    agentEvent(request.id, 'progress', 'Reading bounded Nx project metadata'),
  );
  const projectCatalog = await readNxProjectCatalog(request.worktreeRoot);
  const toolState = { attempted: false, completed: false };
  const session = await createSession(
    request.worktreeRoot,
    request.sessionDirectory,
    createTaskingAnalystTools(client, tasking, projectCatalog, toolState),
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
      agentEvent(request.id, 'progress', 'Drafting the complete Tasking plan'),
    );
    await session.prompt(
      `Propose one complete Candidate from this exact bounded authority snapshot. Call exactly one workflow tool, then stop.\n\n${JSON.stringify(
        { tasking: tasking.raw, projectCatalog },
        null,
        2,
      )}`,
      { expandPromptTemplates: false },
    );
    if (timedOut) throw new Error('Tasking Analyst timed out.');
    if (!toolState.completed) {
      throw new Error(
        'Tasking Analyst finished without proposing one complete Candidate.',
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

async function verifyIterationWorktree(
  request: TaskingAnalystRuntimeRequest,
  iteration: { baseCommitSha: string; branchName: string | null },
): Promise<void> {
  const repositoryRoot = await canonicalGitRepository(request.repositoryRoot);
  const worktreeRoot = await canonicalGitRepository(request.worktreeRoot);
  const [repositoryCommon, worktreeCommon, head, branch, status] =
    await Promise.all([
      gitCommonDirectory(repositoryRoot),
      gitCommonDirectory(worktreeRoot),
      gitHead(worktreeRoot),
      runGit(worktreeRoot, ['branch', '--show-current']),
      runGit(worktreeRoot, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--',
        '.',
      ]),
    ]);
  if (repositoryCommon !== worktreeCommon) {
    throw new Error('Iteration worktree belongs to a different repository.');
  }
  if (head !== iteration.baseCommitSha) {
    throw new Error(
      'Iteration worktree no longer matches its locked baseline.',
    );
  }
  if (!iteration.branchName || branch.trim() !== iteration.branchName) {
    throw new Error('Iteration worktree branch no longer matches the Server.');
  }
  if (status.trim()) {
    throw new Error('Tasking requires a clean Iteration worktree.');
  }
}

async function gitCommonDirectory(root: string): Promise<string> {
  const value = (await runGit(root, ['rev-parse', '--git-common-dir'])).trim();
  return realpath(resolve(root, value));
}

async function createSession(
  cwd: string,
  sessionDirectory: string,
  tools: ReturnType<typeof createTaskingAnalystTools>,
): Promise<RuntimeSession> {
  const {
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = await import(/* @vite-ignore */ PI_SDK_MODULE_NAME);
  const existing = await SessionManager.list(cwd, sessionDirectory);
  if (existing.length > 1) {
    throw new Error(
      'The Tasking session directory contains multiple sessions.',
    );
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

function mapSessionEvent(
  id: string,
  event: AgentSessionEvent,
): IntakeAgentEvent[] {
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
  event: IntakeAgentEvent['event'],
  data: string,
): IntakeAgentEvent {
  return { id, event, data };
}

async function main(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolveLine, reject) => {
    input.once('line', resolveLine);
    input.once('close', () =>
      reject(new Error('Tasking request was not provided.')),
    );
  });
  input.close();
  let requestId = 'unknown';
  try {
    const request = parseTaskingAnalystRuntimeRequest(
      JSON.parse(line) as unknown,
    );
    requestId = request.id;
    await runTaskingAnalystRequest(request, writeEvent);
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

function writeEvent(event: IntakeAgentEvent): void {
  const validated = parseIntakeAgentEvent(event);
  if (!validated) throw new Error('Tasking Analyst emitted an invalid event.');
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

void main();
