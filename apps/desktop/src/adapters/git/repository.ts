import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { localCommandEnvironment } from '../node/command-environment';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT = 10 * 1024 * 1024;

export async function canonicalGitRepository(value: string): Promise<string> {
  const requested = value.trim();
  if (!requested) {
    throw new Error('Workspace repository root is required.');
  }

  let directory: string;
  try {
    directory = await realpath(requested);
  } catch {
    throw new Error('Workspace repository root is not accessible.');
  }
  if (!(await stat(directory)).isDirectory()) {
    throw new Error('Workspace repository root must be a directory.');
  }

  let topLevel: string;
  try {
    topLevel = (
      await runGit(directory, ['rev-parse', '--show-toplevel'])
    ).trim();
  } catch {
    throw new Error('Workspace repository root must be inside a Git worktree.');
  }
  const canonicalTopLevel = await realpath(topLevel);
  const inside = (
    await runGit(canonicalTopLevel, ['rev-parse', '--is-inside-work-tree'])
  ).trim();
  if (inside !== 'true') {
    throw new Error(
      'Workspace repository root must be a non-bare Git worktree.',
    );
  }
  return canonicalTopLevel;
}

export async function gitHead(repositoryRoot: string): Promise<string> {
  const root = await canonicalGitRepository(repositoryRoot);
  const head = (await runGit(root, ['rev-parse', 'HEAD'])).trim().toLowerCase();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(head)) {
    throw new Error('Git repository HEAD is not a supported commit identity.');
  }
  return head;
}

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...localCommandEnvironment(),
      GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
    },
    maxBuffer: MAX_GIT_OUTPUT,
    windowsHide: true,
  });
  return result.stdout;
}
