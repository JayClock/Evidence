import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Message } from '@earendil-works/pi-ai';
import {
  type ActivityUsage,
  zeroActivityUsage,
} from '../../capabilities/activity-observability/activity-usage';
import {
  ACTIVITY_CHILD_ENV,
  ACTIVITY_POLICY_ENV,
  type ActivityToolPolicy,
} from '../../capabilities/worktree-protection/activity-tool-policy';

export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface ActivityAgent {
  name: string;
  description: string;
  model: string;
  thinking: ThinkingLevel;
  tools?: string[];
  systemPrompt: string;
  filePath: string;
}

export type ActivitySessionMode = 'ephemeral' | 'persistent' | 'deterministic';

export interface ActivityAgentResult {
  agent: string;
  /** Actual model reported by the final assistant turn, or the requested model. */
  model: string;
  requestedModel: string;
  actualModel: string;
  thinking: ThinkingLevel;
  sessionMode: ActivitySessionMode;
  toolNames: string[];
  output: string;
  messages: Message[];
  exitCode: number;
  stderr: string;
  usage: ActivityUsage;
  stopReason?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  toolCallCounts: Record<string, number>;
}

/** A live child-process snapshot. An exit code of -1 means it is still running. */
export interface ActivityAgentProgress extends ActivityAgentResult {
  exitCode: -1;
}

export class ActivityAgentAbortedError extends Error {
  constructor(readonly result: ActivityAgentResult) {
    super(result.errorMessage ?? `Activity agent ${result.agent} was aborted.`);
    this.name = 'ActivityAgentAbortedError';
  }
}

export function isActivityAgentFailure(
  result: Pick<ActivityAgentResult, 'exitCode' | 'stopReason'>,
): boolean {
  return (
    result.exitCode !== 0 ||
    result.stopReason === 'error' ||
    result.stopReason === 'aborted' ||
    result.stopReason === 'timeout'
  );
}

interface ActivityAgentArgumentsOptions {
  agent: Pick<ActivityAgent, 'model' | 'thinking' | 'tools'>;
  promptPath: string;
  task: string;
  sessionId?: string;
}

const THINKING_LEVELS = new Set<ThinkingLevel>([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

function parseAgentFile(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: '' };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    frontmatter[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim();
  }
  return { frontmatter, body: match[2] };
}

export function finalActivityAgentOutput(messages: readonly Message[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    if (text) return text;
  }
  return '';
}

/**
 * Retain the same finalized child events as Pi's official child-agent example.
 * Assistant messages carry child tool calls; tool-result messages make progress
 * updates visible before the child reaches its final response.
 */
export function appendActivityAgentEvent(
  messages: Message[],
  event: { type?: string; message?: Message },
): boolean {
  if (
    (event.type === 'message_end' || event.type === 'tool_result_end') &&
    event.message
  ) {
    messages.push(event.message);
    return true;
  }
  return false;
}

interface ActivityAgentTelemetry {
  actualModel?: string;
  usage: ActivityUsage;
  stopReason?: string;
  errorMessage?: string;
  toolCallCounts: Record<string, number>;
}

interface ActivityAgentTiming {
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/** Aggregate only finalized assistant turns, following Pi's child-agent semantics. */
export function activityAgentTelemetry(
  messages: readonly Message[],
): ActivityAgentTelemetry {
  const usage = zeroActivityUsage(null);
  const toolCallCounts: Record<string, number> = {};
  let actualModel: string | undefined;
  let stopReason: string | undefined;
  let errorMessage: string | undefined;
  let costReported = true;

  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    usage.turns += 1;
    const reportedUsage = message.usage as
      | {
          input?: unknown;
          output?: unknown;
          cacheRead?: unknown;
          cacheWrite?: unknown;
          totalTokens?: unknown;
          cost?: { total?: unknown };
        }
      | undefined;
    usage.input_tokens += finiteNumber(reportedUsage?.input) ?? 0;
    usage.output_tokens += finiteNumber(reportedUsage?.output) ?? 0;
    usage.cache_read_tokens += finiteNumber(reportedUsage?.cacheRead) ?? 0;
    usage.cache_write_tokens += finiteNumber(reportedUsage?.cacheWrite) ?? 0;
    usage.context_tokens_at_end =
      finiteNumber(reportedUsage?.totalTokens) ?? null;
    const reportedCost = finiteNumber(reportedUsage?.cost?.total);
    if (reportedCost === undefined) costReported = false;
    else usage.cost_usd = (usage.cost_usd ?? 0) + reportedCost;

    const responseModel = (message as { responseModel?: unknown })
      .responseModel;
    const reportedModel =
      typeof responseModel === 'string' && responseModel
        ? responseModel
        : typeof message.model === 'string' && message.model
          ? message.model
          : undefined;
    const provider = (message as { provider?: unknown }).provider;
    if (reportedModel) {
      actualModel =
        typeof provider === 'string' && provider && !reportedModel.includes('/')
          ? `${provider}/${reportedModel}`
          : reportedModel;
    }
    if (typeof message.stopReason === 'string' && message.stopReason) {
      stopReason = message.stopReason;
    }
    if (typeof message.errorMessage === 'string' && message.errorMessage) {
      errorMessage = message.errorMessage;
    }
    for (const part of message.content) {
      if (part.type !== 'toolCall') continue;
      toolCallCounts[part.name] = (toolCallCounts[part.name] ?? 0) + 1;
    }
  }
  if (usage.turns === 0 || !costReported) usage.cost_usd = null;
  return {
    ...(actualModel ? { actualModel } : {}),
    usage,
    ...(stopReason ? { stopReason } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    toolCallCounts,
  };
}

function activityTiming(timing?: ActivityAgentTiming): ActivityAgentTiming {
  if (timing) return timing;
  const timestamp = new Date().toISOString();
  return { startedAt: timestamp, completedAt: timestamp, durationMs: 0 };
}

export function activityAgentProgress(
  agent: Pick<ActivityAgent, 'name' | 'model' | 'thinking' | 'tools'>,
  messages: readonly Message[],
  stderr = '',
  timing?: ActivityAgentTiming,
  sessionMode: ActivitySessionMode = 'ephemeral',
): ActivityAgentProgress {
  const telemetry = activityAgentTelemetry(messages);
  const measured = activityTiming(timing);
  const actualModel = telemetry.actualModel ?? agent.model;
  return {
    agent: agent.name,
    model: actualModel,
    requestedModel: agent.model,
    actualModel,
    thinking: agent.thinking,
    sessionMode,
    toolNames: [...(agent.tools ?? [])],
    output: finalActivityAgentOutput(messages) || '(running...)',
    messages: [...messages],
    exitCode: -1,
    stderr,
    usage: telemetry.usage,
    ...(telemetry.stopReason ? { stopReason: telemetry.stopReason } : {}),
    ...(telemetry.errorMessage ? { errorMessage: telemetry.errorMessage } : {}),
    startedAt: measured.startedAt,
    completedAt: measured.completedAt,
    durationMs: measured.durationMs,
    toolCallCounts: telemetry.toolCallCounts,
  };
}

export function activityAgentResult(
  agent: Pick<ActivityAgent, 'name' | 'model' | 'thinking' | 'tools'>,
  messages: Message[],
  exitCode: number,
  stderr = '',
  spawnError = '',
  timing?: ActivityAgentTiming,
  sessionMode: ActivitySessionMode = 'ephemeral',
): ActivityAgentResult {
  const output = finalActivityAgentOutput(messages);
  const diagnostics = [output, stderr.trim(), spawnError]
    .filter(Boolean)
    .join('\n\n');
  const telemetry = activityAgentTelemetry(messages);
  const failure = isActivityAgentFailure({
    exitCode,
    stopReason: telemetry.stopReason,
  });
  const resultOutput = failure
    ? `Activity agent ${agent.name} failed with exit ${exitCode}${telemetry.stopReason ? ` (${telemetry.stopReason})` : ''}:\n${diagnostics || telemetry.errorMessage || 'no output'}`
    : output || '(no output)';
  const measured = activityTiming(timing);
  const actualModel = telemetry.actualModel ?? agent.model;
  const errorMessage = telemetry.errorMessage ?? (spawnError || undefined);

  return {
    agent: agent.name,
    model: actualModel,
    requestedModel: agent.model,
    actualModel,
    thinking: agent.thinking,
    sessionMode,
    toolNames: [...(agent.tools ?? [])],
    output: resultOutput,
    messages,
    exitCode,
    stderr: stderr || spawnError,
    usage: telemetry.usage,
    ...(telemetry.stopReason ? { stopReason: telemetry.stopReason } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    startedAt: measured.startedAt,
    completedAt: measured.completedAt,
    durationMs: measured.durationMs,
    toolCallCounts: telemetry.toolCallCounts,
  };
}

export function activityAgentName(name: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`Invalid activity agent name: ${name}.`);
  }
  return name;
}

function activitySessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(normalized)) {
    throw new Error(`Invalid activity session id: ${sessionId}.`);
  }
  return normalized;
}

/** Build one child invocation; a supplied id resumes the same logical Pi session. */
export function activityAgentArguments(
  options: ActivityAgentArgumentsOptions,
): string[] {
  const args = ['--mode', 'json', '-p', '--no-prompt-templates'];
  if (options.sessionId) {
    args.push('--session-id', activitySessionId(options.sessionId));
  } else {
    args.push('--no-session');
  }
  args.push(
    '--model',
    options.agent.model,
    '--thinking',
    options.agent.thinking,
    '--append-system-prompt',
    options.promptPath,
  );
  if (options.agent.tools) args.push('--tools', options.agent.tools.join(','));
  args.push(`Task:\n${options.task}`);
  return args;
}

export function loadActivityAgent(
  cwd: string,
  agentName: string,
): ActivityAgent {
  const name = activityAgentName(agentName);
  const filePath = join(cwd, '.pi', 'agents', `${name}.md`);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Required activity agent does not exist: ${filePath}`);
  }
  const { frontmatter, body } = parseAgentFile(content);
  const thinking = frontmatter.thinking as ThinkingLevel;
  if (
    frontmatter.name !== name ||
    !frontmatter.description ||
    !frontmatter.model ||
    !THINKING_LEVELS.has(thinking) ||
    !body.trim()
  ) {
    throw new Error(`Invalid activity agent definition: ${filePath}`);
  }
  const tools = frontmatter.tools
    ?.split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);
  return {
    name,
    description: frontmatter.description,
    model: frontmatter.model,
    thinking,
    tools: tools?.length ? tools : undefined,
    systemPrompt: body.trim(),
    filePath,
  };
}

/**
 * Re-invoke the current Pi executable when possible, so an activity child uses the
 * same installed Pi version as its parent. This mirrors Pi's official
 * child-agent extension and falls back to the `pi` command for generic runtimes.
 */
function activityAgentInvocation(args: string[]): {
  command: string;
  args: string[];
} {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith('/$bunfs/root/');
  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const executable = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(executable);
  if (!isGenericRuntime) return { command: process.execPath, args };

  return { command: 'pi', args };
}

export async function runActivityAgent(options: {
  cwd: string;
  agentName: string;
  task: string;
  policy: ActivityToolPolicy;
  sessionId?: string;
  signal?: AbortSignal;
  onUpdate?: (progress: ActivityAgentProgress) => void;
}): Promise<ActivityAgentResult> {
  const agent = loadActivityAgent(options.cwd, options.agentName);
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'evidence-activity-agent-'),
  );
  const promptPath = join(tempDirectory, `${agent.name}.md`);
  const policyPath = join(tempDirectory, 'tool-policy.json');
  await Promise.all([
    writeFile(promptPath, agent.systemPrompt, {
      encoding: 'utf8',
      mode: 0o600,
    }),
    writeFile(policyPath, `${JSON.stringify(options.policy, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    }),
  ]);

  const args = activityAgentArguments({
    agent,
    promptPath,
    task: options.task,
    sessionId: options.sessionId,
  });

  const messages: Message[] = [];
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const sessionMode: ActivitySessionMode = options.sessionId
    ? 'persistent'
    : 'ephemeral';
  let stderr = '';
  let buffer = '';
  let aborted = false;
  let spawnError = '';

  const emitProgress = () => {
    const observedMs = Date.now();
    options.onUpdate?.(
      activityAgentProgress(
        agent,
        messages,
        stderr,
        {
          startedAt,
          completedAt: new Date(observedMs).toISOString(),
          durationMs: Math.max(0, observedMs - startedMs),
        },
        sessionMode,
      ),
    );
  };

  try {
    const exitCode = await new Promise<number>((resolve) => {
      const invocation = activityAgentInvocation(args);
      const child = spawn(invocation.command, invocation.args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          [ACTIVITY_CHILD_ENV]: '1',
          [ACTIVITY_POLICY_ENV]: policyPath,
        },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let settled = false;
      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (options.signal) {
          options.signal.removeEventListener('abort', abortChild);
        }
        resolve(code);
      };

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: { type?: string; message?: Message };
        try {
          event = JSON.parse(line) as { type?: string; message?: Message };
        } catch {
          return;
        }
        if (appendActivityAgentEvent(messages, event)) emitProgress();
      };

      const abortChild = () => {
        if (aborted) return;
        aborted = true;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL');
        }, 5000);
        forceKillTimer.unref();
      };

      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(processLine);
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        emitProgress();
      });
      child.on('error', (error) => {
        spawnError = error.message;
        finish(1);
      });
      child.on('close', (code) => {
        processLine(buffer);
        finish(code ?? 1);
      });

      if (options.signal?.aborted) abortChild();
      else
        options.signal?.addEventListener('abort', abortChild, { once: true });
    });

    const completedMs = Date.now();
    const result = activityAgentResult(
      agent,
      messages,
      exitCode,
      stderr,
      spawnError,
      {
        startedAt,
        completedAt: new Date(completedMs).toISOString(),
        durationMs: Math.max(0, completedMs - startedMs),
      },
      sessionMode,
    );
    if (aborted) {
      const errorMessage = `Activity agent ${agent.name} was aborted.`;
      throw new ActivityAgentAbortedError({
        ...result,
        stopReason: 'aborted',
        errorMessage,
        output: `${errorMessage}\n\n${result.output}`,
      });
    }
    return result;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
