import { execFile } from 'node:child_process';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { TaskingProjectCatalogInput } from '../../intake-api-client';
import { localCommandEnvironment } from '../node/command-environment';

const execFileAsync = promisify(execFile);
const MAX_PROJECTS = 250;
const MAX_TARGETS_PER_PROJECT = 100;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;

type NxGraphReader = (cwd: string, signal?: AbortSignal) => Promise<string>;

export async function readNxProjectCatalog(
  worktreeRoot: string,
  signal?: AbortSignal,
  readGraph: NxGraphReader = runNxGraph,
): Promise<TaskingProjectCatalogInput> {
  const cwd = resolve(worktreeRoot);
  const graph = parseJson(await readGraph(cwd, signal));
  const graphBody = record(graph.graph, 'Nx graph');
  const nodes = record(graphBody.nodes, 'Nx project nodes');
  const entries = Object.entries(nodes);
  if (entries.length === 0 || entries.length > MAX_PROJECTS) {
    throw new Error(
      `Nx project catalog must contain 1–${String(MAX_PROJECTS)} projects.`,
    );
  }
  const projects = entries.map(([id, value]) => {
    const node = record(value, `Nx project ${id}`);
    const data = record(node.data, `Nx project ${id} data`);
    const root = relativeRoot(cwd, data.root, id);
    const targetRecord = record(data.targets ?? {}, `Nx project ${id} targets`);
    const targets = Object.keys(targetRecord).sort();
    if (targets.length > MAX_TARGETS_PER_PROJECT) {
      throw new Error(`Nx project ${id} exposes too many targets.`);
    }
    return { id: projectId(id), root, targets };
  });
  return {
    projects: projects.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

async function runNxGraph(cwd: string, signal?: AbortSignal): Promise<string> {
  const { stdout } = await execFileAsync(
    pnpmExecutable(),
    ['nx', 'graph', '--print'],
    {
      cwd,
      encoding: 'utf8',
      env: localCommandEnvironment(),
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: COMMAND_TIMEOUT_MS,
      signal,
    },
  );
  return stdout;
}

function parseJson(value: string): Record<string, unknown> {
  try {
    return record(JSON.parse(value) as unknown, 'Nx graph output');
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Nx graph output was not valid JSON.');
    }
    throw error;
  }
}

function relativeRoot(cwd: string, value: unknown, id: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Nx project ${id} root is missing.`);
  }
  const supplied = normalize(value.trim());
  if (isAbsolute(supplied)) {
    throw new Error(`Nx project ${id} root must be relative.`);
  }
  const absolute = resolve(cwd, supplied);
  const within = relative(cwd, absolute);
  if (within === '..' || within.startsWith(`..${sep}`)) {
    throw new Error(`Nx project ${id} root leaves the Iteration worktree.`);
  }
  return within.replaceAll('\\', '/') || '.';
}

function projectId(value: string): string {
  if (!/^[A-Za-z0-9@][A-Za-z0-9@/_.-]{0,199}$/.test(value)) {
    throw new Error('Nx project id contains unsupported characters.');
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function pnpmExecutable(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}
