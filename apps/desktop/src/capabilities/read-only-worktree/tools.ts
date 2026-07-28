import { execFile } from 'node:child_process';
import { access, readFile, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  createReadToolDefinition,
  defineTool,
  type ReadOperations,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { localCommandEnvironment } from '../../adapters/node/command-environment';
import {
  protectedWorktreePath,
  WORKTREE_PROTECTED_ROOTS,
} from '../worktree-protection/policy';

const execFileAsync = promisify(execFile);
const MAX_CAPTURE = 2 * 1024 * 1024;
const MAX_TOOL_OUTPUT = 50 * 1024;
const MAX_TOOL_LINES = 2_000;

export async function createReadOnlyWorktreeTools(
  worktreeRoot: string,
): Promise<ToolDefinition[]> {
  const boundary = await ReadOnlyWorktreeBoundary.create(worktreeRoot);
  const operations: ReadOperations = {
    readFile: (path) => boundary.readFile(path),
    access: (path) => boundary.access(path),
  };
  return [
    defineTool(createReadToolDefinition(boundary.root, { operations })),
    searchTool(boundary.root),
    listFilesTool(boundary.root),
  ];
}

class ReadOnlyWorktreeBoundary {
  private constructor(readonly root: string) {}

  static async create(root: string): Promise<ReadOnlyWorktreeBoundary> {
    return new ReadOnlyWorktreeBoundary(await realpath(root));
  }

  async readFile(path: string): Promise<Buffer> {
    return readFile(await this.existing(path));
  }

  async access(path: string): Promise<void> {
    await access(await this.existing(path));
  }

  private async existing(path: string): Promise<string> {
    const lexical = resolve(this.root, path);
    this.assertInside(lexical);
    const within = relative(this.root, lexical).split(sep).join('/');
    if (protectedWorktreePath(within)) {
      throw new Error('Read-only Agent cannot read a protected path.');
    }
    let canonical: string;
    try {
      canonical = await realpath(lexical);
    } catch {
      throw new Error('Read-only Agent path is not accessible.');
    }
    this.assertInside(canonical);
    return canonical;
  }

  private assertInside(target: string): void {
    const within = relative(this.root, target);
    if (
      !within ||
      within === '..' ||
      within.startsWith(`..${sep}`) ||
      resolve(target) === resolve(this.root)
    ) {
      throw new Error('Read-only Agent path is outside the worktree.');
    }
  }
}

function searchTool(root: string): ToolDefinition {
  return defineTool({
    name: 'search',
    label: 'Search approved worktree',
    description:
      'Search the approved source without running project commands or changing files.',
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 1_000 }),
      glob: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
      maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
    }),
    async execute(_toolCallId, params, signal) {
      const output = await executeRg(
        [
          '--line-number',
          '--color=never',
          '--hidden',
          ...protectedGlobs(),
          ...(params.glob ? [`--glob=${params.glob}`] : []),
          '--',
          params.query,
          '.',
        ],
        root,
        signal,
      ).catch((error) => {
        if (exitCode(error) === 1) return '';
        throw error;
      });
      return textResult(
        output
          .split('\n')
          .slice(0, params.maxResults ?? 100)
          .join('\n'),
      );
    },
  });
}

function listFilesTool(root: string): ToolDefinition {
  return defineTool({
    name: 'list_files',
    label: 'List approved worktree files',
    description:
      'List unignored approved source files without exposing protected runtime data.',
    parameters: Type.Object({
      glob: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    }),
    async execute(_toolCallId, params, signal) {
      return textResult(
        await executeRg(
          [
            '--files',
            '--hidden',
            ...protectedGlobs(),
            ...(params.glob ? [`--glob=${params.glob}`] : []),
          ],
          root,
          signal,
        ),
      );
    },
  });
}

function protectedGlobs(): string[] {
  return WORKTREE_PROTECTED_ROOTS.map((root) => `--glob=!${root}/**`);
}

async function executeRg(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const result = await execFileAsync('rg', args, {
      cwd,
      encoding: 'utf8',
      env: localCommandEnvironment(),
      maxBuffer: MAX_CAPTURE,
      signal,
      timeout: 30_000,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    const detail = `${output(error, 'stdout')}${output(error, 'stderr')}`
      .slice(-MAX_TOOL_OUTPUT)
      .trim();
    const failure = new Error(
      `Bounded read-only search failed${detail ? `: ${detail}` : '.'}`,
    ) as Error & { code?: number };
    failure.code = exitCode(error);
    throw failure;
  }
}

function textResult(value: string) {
  const output = boundedOutput(value);
  return {
    content: [{ type: 'text' as const, text: output }],
    details: { output },
  };
}

function boundedOutput(value: string): string {
  const normalized = value.trim() || '(no results)';
  const lines = normalized.split('\n');
  const lineBounded = lines.slice(0, MAX_TOOL_LINES).join('\n');
  const bytes = Buffer.from(lineBounded);
  if (lines.length <= MAX_TOOL_LINES && bytes.byteLength <= MAX_TOOL_OUTPUT) {
    return lineBounded;
  }
  const notice = '\n...[output truncated]';
  return `${bytes
    .subarray(0, MAX_TOOL_OUTPUT - Buffer.byteLength(notice))
    .toString()}${notice}`;
}

function output(error: unknown, field: 'stdout' | 'stderr'): string {
  if (!error || typeof error !== 'object' || !(field in error)) return '';
  const value = (error as Record<string, unknown>)[field];
  if (typeof value === 'string') return value;
  return value instanceof Uint8Array ? Buffer.from(value).toString() : '';
}

function exitCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const value = (error as { code?: unknown }).code;
  return typeof value === 'number' ? value : undefined;
}
