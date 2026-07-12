import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function finalOutput(messages: Message[]): string {
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

export async function runPhaseSubagent(options: {
  cwd: string;
  phase: Exclude<Phase, 'complete'>;
  task: string;
  signal?: AbortSignal;
  onUpdate?: (output: string) => void;
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

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn('pi', args, {
        cwd: options.cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: { type?: string; message?: Message };
        try {
          event = JSON.parse(line) as { type?: string; message?: Message };
        } catch {
          return;
        }
        if (
          (event.type === 'message_end' || event.type === 'tool_result_end') &&
          event.message
        ) {
          messages.push(event.message);
          options.onUpdate?.(finalOutput(messages));
        }
      };

      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(processLine);
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        processLine(buffer);
        resolve(code ?? 1);
      });

      const abort = () => {
        aborted = true;
        child.kill('SIGTERM');
      };
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener('abort', abort, { once: true });
    });

    const output = finalOutput(messages);
    if (aborted) throw new Error(`Phase subagent ${agent.name} was aborted.`);
    if (exitCode !== 0) {
      throw new Error(
        `Phase subagent ${agent.name} failed with exit ${exitCode}: ${stderr || output || 'no output'}`,
      );
    }
    return {
      agent: agent.name,
      model: agent.model,
      thinking: agent.thinking,
      output: output || '(no output)',
      messages,
      exitCode,
      stderr,
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
