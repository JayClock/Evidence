import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Message } from '@earendil-works/pi-ai';
import type { Phase } from '../workflow/types';

export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface PhaseAgent {
  name: string;
  description: string;
  model: string;
  thinking: ThinkingLevel;
  tools?: string[];
  systemPrompt: string;
  filePath: string;
}

export interface PhaseAgentResult {
  agent: string;
  model: string;
  thinking: ThinkingLevel;
  output: string;
  messages: Message[];
  exitCode: number;
  stderr: string;
}

/** A live child-process snapshot. An exit code of -1 means it is still running. */
export interface PhaseAgentProgress extends PhaseAgentResult {
  exitCode: -1;
}

const PHASE_AGENTS: Record<Exclude<Phase, 'complete'>, string> = {
  frame: 'requirements-analyst',
  clarify: 'requirements-analyst',
  specify: 'requirements-analyst',
  validate: 'requirements-analyst',
  domain_model: 'domain-modeler',
  architecture: 'architect',
  planning: 'planner',
  coding: 'coder',
  review: 'reviewer',
  learn: 'learner',
};

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

export function finalPhaseAgentOutput(messages: readonly Message[]): string {
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
 * Retain the same finalized child events as Pi's official subagent example.
 * Assistant messages carry child tool calls; tool-result messages make progress
 * updates visible before the child reaches its final response.
 */
export function appendPhaseSubagentEvent(
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

export function phaseAgentProgress(
  agent: Pick<PhaseAgent, 'name' | 'model' | 'thinking'>,
  messages: readonly Message[],
  stderr = '',
): PhaseAgentProgress {
  return {
    agent: agent.name,
    model: agent.model,
    thinking: agent.thinking,
    output: finalPhaseAgentOutput(messages) || '(running...)',
    messages: [...messages],
    exitCode: -1,
    stderr,
  };
}

export function phaseAgentResult(
  agent: Pick<PhaseAgent, 'name' | 'model' | 'thinking'>,
  messages: Message[],
  exitCode: number,
  stderr = '',
  spawnError = '',
): PhaseAgentResult {
  const output = finalPhaseAgentOutput(messages);
  const diagnostics = [output, stderr.trim(), spawnError]
    .filter(Boolean)
    .join('\n\n');
  const resultOutput =
    exitCode === 0
      ? output || '(no output)'
      : `Phase subagent ${agent.name} failed with exit ${exitCode}:\n${diagnostics || 'no output'}`;

  return {
    agent: agent.name,
    model: agent.model,
    thinking: agent.thinking,
    output: resultOutput,
    messages,
    exitCode,
    stderr: stderr || spawnError,
  };
}

export function phaseAgentName(phase: Exclude<Phase, 'complete'>): string {
  return PHASE_AGENTS[phase];
}

export function loadPhaseAgent(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
): PhaseAgent {
  const name = phaseAgentName(phase);
  const filePath = join(cwd, '.pi', 'agents', `${name}.md`);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Required phase subagent does not exist: ${filePath}`);
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
    throw new Error(`Invalid phase subagent definition: ${filePath}`);
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
 * Re-invoke the current Pi executable when possible, so a phase child uses the
 * same installed Pi version as its parent. This mirrors Pi's official
 * subagent extension and falls back to the `pi` command for generic runtimes.
 */
function phaseSubagentInvocation(args: string[]): {
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

export async function runPhaseSubagent(options: {
  cwd: string;
  phase: Exclude<Phase, 'complete'>;
  task: string;
  signal?: AbortSignal;
  onUpdate?: (progress: PhaseAgentProgress) => void;
}): Promise<PhaseAgentResult> {
  const agent = loadPhaseAgent(options.cwd, options.phase);
  const tempDirectory = await mkdtemp(join(tmpdir(), 'evidence-subagent-'));
  const promptPath = join(tempDirectory, `${agent.name}.md`);
  await writeFile(promptPath, agent.systemPrompt, {
    encoding: 'utf8',
    mode: 0o600,
  });

  const args = [
    '--mode',
    'json',
    '-p',
    '--no-session',
    '--model',
    agent.model,
    '--thinking',
    agent.thinking,
    '--append-system-prompt',
    promptPath,
  ];
  if (agent.tools) args.push('--tools', agent.tools.join(','));
  args.push(`Task:\n${options.task}`);

  const messages: Message[] = [];
  let stderr = '';
  let buffer = '';
  let aborted = false;
  let spawnError = '';

  const emitProgress = () => {
    options.onUpdate?.(phaseAgentProgress(agent, messages, stderr));
  };

  try {
    const exitCode = await new Promise<number>((resolve) => {
      const invocation = phaseSubagentInvocation(args);
      const child = spawn(invocation.command, invocation.args, {
        cwd: options.cwd,
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
        if (appendPhaseSubagentEvent(messages, event)) emitProgress();
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

    if (aborted) throw new Error(`Phase subagent ${agent.name} was aborted.`);
    return phaseAgentResult(agent, messages, exitCode, stderr, spawnError);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
