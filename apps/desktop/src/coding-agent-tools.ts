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
import { runGit } from './git-repository';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 100_000;
const MAX_SEARCH_RESULTS = 500;
const QUALITY_GATES = [
  'test',
  'lint',
  'typecheck',
  'build',
  'api-check',
] as const;

type QualityGate = (typeof QUALITY_GATES)[number];

export async function createCodingAgentTools(
  worktreeRoot: string,
): Promise<ToolDefinition[]> {
  const boundary = await FileBoundary.create(worktreeRoot);
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
    qualityGateTool(boundary.root),
    diffTool(boundary.root),
  ];
}

class FileBoundary {
  private constructor(readonly root: string) {}

  static async create(root: string): Promise<FileBoundary> {
    return new FileBoundary(await realpath(root));
  }

  async readFile(path: string): Promise<Buffer> {
    return readFile(await this.existing(path));
  }

  async access(path: string): Promise<void> {
    await access(await this.existing(path));
  }

  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(await this.writable(path), content, 'utf8');
  }

  async mkdir(path: string): Promise<void> {
    const target = await this.writable(path);
    await mkdir(target, { recursive: true });
  }

  private async existing(path: string): Promise<string> {
    const lexical = this.lexical(path);
    let canonical: string;
    try {
      canonical = await realpath(lexical);
    } catch {
      throw new Error(
        'Coding tool path is not accessible inside the worktree.',
      );
    }
    this.assertInside(canonical);
    return canonical;
  }

  private async writable(path: string): Promise<string> {
    const lexical = this.lexical(path);
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
            'Coding tool path has no accessible worktree parent.',
          );
        }
        cursor = parent;
        continue;
      }

      const canonical = await realpath(cursor);
      this.assertInside(canonical);
      if (cursor === lexical && metadata.isSymbolicLink()) {
        throw new Error('Coding tools do not write through symbolic links.');
      }
      return lexical;
    }
  }

  private lexical(path: string): string {
    const target = resolve(this.root, path);
    this.assertInside(target);
    const within = relative(this.root, target);
    if (within === '.git' || within.startsWith(`.git${sep}`)) {
      throw new Error('Coding tools cannot modify Git metadata.');
    }
    return target;
  }

  private assertInside(target: string): void {
    const within = relative(this.root, target);
    if (within === '..' || within.startsWith(`..${sep}`)) {
      throw new Error('Coding tool path is outside the isolated worktree.');
    }
  }
}

function searchTool(root: string): ToolDefinition {
  return defineTool({
    name: 'search',
    label: 'Search worktree',
    description:
      'Search text in tracked and unignored files inside the isolated worktree.',
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
        '--glob=!.git/**',
        ...(params.glob ? [`--glob=${params.glob}`] : []),
        '--',
        params.query,
        '.',
      ];
      const output = await execute('rg', args, root, signal).catch((error) => {
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
    label: 'List worktree files',
    description: 'List unignored files inside the isolated worktree.',
    parameters: Type.Object({
      glob: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    }),
    async execute(_toolCallId, params, signal) {
      const args = [
        '--files',
        '--hidden',
        '--glob=!.git/**',
        ...(params.glob ? [`--glob=${params.glob}`] : []),
      ];
      return textResult(await execute('rg', args, root, signal));
    },
  });
}

function qualityGateTool(root: string): ToolDefinition {
  return defineTool({
    name: 'run_quality_gate',
    label: 'Run quality gate',
    description:
      'Run one repository quality gate. This tool cannot commit, merge, push, install dependencies, or execute arbitrary shell commands.',
    parameters: Type.Object({
      gate: Type.Union(QUALITY_GATES.map((gate) => Type.Literal(gate))),
      project: Type.Optional(
        Type.String({
          pattern: '^[a-zA-Z0-9@][a-zA-Z0-9@/_.-]{0,199}$',
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const output = params.project
        ? await execute(
            packageManager(),
            [
              'nx',
              'run',
              `${params.project}:${gateTarget(params.gate)}`,
              ...(params.gate === 'test' ? ['--run'] : []),
            ],
            root,
            signal,
            600_000,
          )
        : await execute(
            packageManager(),
            [params.gate === 'api-check' ? 'api:check' : params.gate],
            root,
            signal,
            600_000,
          );
      return textResult(output);
    },
  });
}

function diffTool(root: string): ToolDefinition {
  return defineTool({
    name: 'inspect_diff',
    label: 'Inspect local diff',
    description:
      'Read the current local diff without committing, merging, or pushing it.',
    parameters: Type.Object({}),
    async execute() {
      await runGit(root, ['add', '--intent-to-add', '--', '.']);
      return textResult(
        await runGit(root, ['diff', '--no-ext-diff', '--binary', '--', '.']),
      );
    },
  });
}

function gateTarget(gate: QualityGate): string {
  return gate === 'api-check' ? 'api:check' : gate;
}

function packageManager(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function execute(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  timeout = 30_000,
): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: MAX_OUTPUT,
      signal,
      timeout,
      windowsHide: true,
    });
    return `${result.stdout}${result.stderr}`.slice(-MAX_OUTPUT);
  } catch (error) {
    const stdout = outputField(error, 'stdout');
    const stderr = outputField(error, 'stderr');
    const detail = `${stdout}${stderr}`.slice(-MAX_OUTPUT).trim();
    throw new Error(
      `Allowed command failed${exitCode(error) === undefined ? '' : ` with exit code ${String(exitCode(error))}`}.${detail ? `\n${detail}` : ''}`,
    );
  }
}

function textResult(text: string) {
  const output = text.trim() || '(no output)';
  return {
    content: [{ type: 'text' as const, text: output }],
    details: { output },
  };
}

function outputField(error: unknown, field: 'stdout' | 'stderr'): string {
  if (!error || typeof error !== 'object' || !(field in error)) return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string'
    ? value
    : Buffer.from(value as Uint8Array).toString();
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  return String((error as { code?: unknown }).code);
}

function exitCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'number' ? value : undefined;
}
