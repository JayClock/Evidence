import { execFile } from 'node:child_process';
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  defineTool,
  type EditOperations,
  type ReadOperations,
  type ToolDefinition,
  type WriteOperations,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { localCommandEnvironment } from './local-command-environment';
import {
  PAIR_PROTECTED_NAMES as PROTECTED_NAMES,
  PAIR_PROTECTED_ROOTS as PROTECTED_ROOTS,
  pairProtectedPath as protectedPath,
  pairRootOwns as owns,
  pairTestPath as isTestPath,
  type PairDriverWritePolicy,
} from './pair-driver-policy';

const execFileAsync = promisify(execFile);
const MAX_CAPTURE = 2 * 1024 * 1024;
const MAX_TOOL_OUTPUT = 50 * 1024;
const MAX_TOOL_LINES = 2_000;
const MAX_SEARCH_RESULTS = 500;

export interface PairDriverToolState {
  completed: boolean;
  summary: string | null;
}

export async function createPairDriverTools(
  worktreeRoot: string,
  policy: PairDriverWritePolicy,
  state: PairDriverToolState,
): Promise<ToolDefinition[]> {
  const boundary = await PairFileBoundary.create(worktreeRoot, policy);
  const readOperations: ReadOperations = {
    readFile: (path) => boundary.readFile(path),
    access: (path) => boundary.access(path),
  };
  const writeOperations: WriteOperations = {
    writeFile: (path, content) => boundary.writeFile(path, content),
    mkdir: (path) => boundary.mkdir(path),
  };
  const editOperations: EditOperations = {
    readFile: (path) => boundary.readFile(path),
    writeFile: (path, content) => boundary.writeFile(path, content),
    access: (path) => boundary.access(path),
  };
  return [
    defineTool(
      createReadToolDefinition(boundary.root, { operations: readOperations }),
    ),
    defineTool(
      createEditToolDefinition(boundary.root, { operations: editOperations }),
    ),
    defineTool(
      createWriteToolDefinition(boundary.root, { operations: writeOperations }),
    ),
    searchTool(boundary.root),
    listFilesTool(boundary.root),
    completeTool(state),
  ];
}

class PairFileBoundary {
  private constructor(
    readonly root: string,
    private readonly policy: PairDriverWritePolicy,
  ) {}

  static async create(
    root: string,
    policy: PairDriverWritePolicy,
  ): Promise<PairFileBoundary> {
    return new PairFileBoundary(await realpath(root), policy);
  }

  async readFile(path: string): Promise<Buffer> {
    return readFile(await this.existing(path));
  }

  async access(path: string): Promise<void> {
    await access(await this.existing(path));
  }

  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(await this.writable(path, false), content, 'utf8');
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(await this.writable(path, true), { recursive: true });
  }

  private async existing(path: string): Promise<string> {
    const lexical = this.lexical(path, false);
    let canonical: string;
    try {
      canonical = await realpath(lexical);
    } catch {
      throw new Error('Pair Driver path is not accessible in the worktree.');
    }
    this.assertInside(canonical);
    return canonical;
  }

  private async writable(path: string, directory: boolean): Promise<string> {
    const lexical = this.lexical(path, true, directory);
    let cursor = lexical;
    while (true) {
      let metadata;
      try {
        metadata = await lstat(cursor);
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
        const parent = dirname(cursor);
        if (parent === cursor) {
          throw new Error(
            'Pair Driver path has no accessible worktree parent.',
          );
        }
        cursor = parent;
        continue;
      }
      const canonical = await realpath(cursor);
      this.assertInside(canonical);
      if (cursor === lexical && metadata.isSymbolicLink()) {
        throw new Error('Pair Driver cannot write through symbolic links.');
      }
      return lexical;
    }
  }

  private lexical(path: string, write: boolean, directory = false): string {
    const target = resolve(this.root, path);
    this.assertInside(target);
    const within = relative(this.root, target).split(sep).join('/');
    if (!within || protectedPath(within)) {
      throw new Error('Pair Driver cannot access a protected path.');
    }
    if (write) this.assertWritable(within, directory);
    return target;
  }

  private assertWritable(path: string, directory: boolean): void {
    const name = path.split('/').at(-1) ?? path;
    if (PROTECTED_NAMES.has(name)) {
      throw new Error(`Pair Driver cannot change protected config ${path}.`);
    }
    if (this.policy.role === 'test') {
      if (
        !this.policy.allowedTestRoots.some((root) => owns(root, path)) ||
        (!directory && !isTestPath(path))
      ) {
        throw new Error(`Test Driver cannot change non-test path ${path}.`);
      }
      return;
    }
    if (!this.policy.allowedProductionRoots.some((root) => owns(root, path))) {
      throw new Error(
        `Production Driver cannot change unplanned path ${path}.`,
      );
    }
    if (isTestPath(path) || this.policy.frozenTestPaths.includes(path)) {
      throw new Error(`Production Driver cannot change frozen test ${path}.`);
    }
  }

  private assertInside(target: string): void {
    const within = relative(this.root, target);
    if (
      within === '..' ||
      within.startsWith(`..${sep}`) ||
      resolve(target) === resolve(this.root)
    ) {
      throw new Error('Pair Driver path is outside the Iteration worktree.');
    }
  }
}

function searchTool(root: string): ToolDefinition {
  return defineTool({
    name: 'search',
    label: 'Search Iteration worktree',
    description:
      'Search source and tests without running repository commands or reading protected runtime data.',
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 1_000 }),
      glob: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
      maxResults: Type.Optional(
        Type.Integer({ minimum: 1, maximum: MAX_SEARCH_RESULTS }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const maxResults = params.maxResults ?? 100;
      const args = [
        '--line-number',
        '--color=never',
        '--hidden',
        ...protectedGlobs(),
        ...(params.glob ? [`--glob=${params.glob}`] : []),
        '--',
        params.query,
        '.',
      ];
      const output = await executeRg(args, root, signal).catch((error) => {
        if (exitCode(error) === 1) return '';
        throw error;
      });
      return textResult(output.split('\n').slice(0, maxResults).join('\n'));
    },
  });
}

function listFilesTool(root: string): ToolDefinition {
  return defineTool({
    name: 'list_files',
    label: 'List Iteration files',
    description:
      'List unignored source and test files without exposing protected runtime data.',
    parameters: Type.Object({
      glob: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    }),
    async execute(_toolCallId, params, signal) {
      const args = [
        '--files',
        '--hidden',
        ...protectedGlobs(),
        ...(params.glob ? [`--glob=${params.glob}`] : []),
      ];
      return textResult(await executeRg(args, root, signal));
    },
  });
}

function completeTool(state: PairDriverToolState): ToolDefinition {
  return defineTool({
    name: 'evidence_complete_pair_driver',
    label: 'Complete bounded Pair Driver turn',
    description:
      'Record one bounded summary after the requested TEST, implementation, or Refactor work is complete. This grants no checkpoint authority.',
    parameters: Type.Object({
      summary: Type.String({ minLength: 1, maxLength: 2_000 }),
    }),
    async execute(_toolCallId, params) {
      if (state.completed) {
        throw new Error('Pair Driver completion is one-shot.');
      }
      state.completed = true;
      state.summary = params.summary.trim();
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Pair Driver completion was returned to the local Controller for independent validation.',
          },
        ],
        details: { summary: state.summary },
      };
    },
  });
}

function protectedGlobs(): string[] {
  return PROTECTED_ROOTS.map((root) => `--glob=!${root}/**`);
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
      `Bounded search failed${detail ? `: ${detail}` : '.'}`,
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
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'number' ? value : undefined;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : undefined;
}
