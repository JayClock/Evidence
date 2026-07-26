import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { codingCommandEnvironment } from './coding-command-environment';
import { canonicalGitRepository, gitHead, runGit } from './git-repository';

const execFileAsync = promisify(execFile);

const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const DEPENDENCY_OUTPUT_LIMIT = 2 * 1024 * 1024;
const DEPENDENCY_TIMEOUT_MS = 10 * 60 * 1_000;

export interface CodingDiff {
  content: string;
  sha256: string;
  changedFileCount: number;
}

export interface CodingWorktree {
  runId: string;
  repositoryRoot: string;
  worktreeRoot: string;
  branchName: string;
  baseCommitSha: string;
}

export type CodingDependencyHydrator = (
  worktreeRoot: string,
  signal?: AbortSignal,
) => Promise<void>;

export class CodingWorktreeManager {
  private readonly managedRoot: string;

  constructor(
    root: string,
    private readonly hydrateDependencies: CodingDependencyHydrator = hydratePnpmDependencies,
    private readonly branchNamespace = 'run',
  ) {
    this.managedRoot = resolve(root);
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(branchNamespace)) {
      throw new Error('Worktree branch namespace is invalid.');
    }
  }

  async prepare(input: {
    runId: string;
    repositoryRoot: string;
    baseCommitSha: string;
    signal?: AbortSignal;
  }): Promise<CodingWorktree> {
    const runId = normalizeRunId(input.runId);
    const baseCommitSha = normalizeCommit(input.baseCommitSha);
    const repositoryRoot = await canonicalGitRepository(input.repositoryRoot);
    const resolvedBase = (
      await runGit(repositoryRoot, [
        'rev-parse',
        '--verify',
        `${baseCommitSha}^{commit}`,
      ])
    )
      .trim()
      .toLowerCase();
    if (resolvedBase !== baseCommitSha) {
      throw new Error('Coding worktree base commit does not match Git.');
    }

    await mkdir(this.managedRoot, { recursive: true });
    const worktreeRoot = resolve(this.managedRoot, runId);
    assertManagedPath(this.managedRoot, worktreeRoot);
    if (await pathExists(worktreeRoot)) {
      throw new Error(`Coding worktree ${runId} already exists.`);
    }
    const branchName = `evidence/${this.branchNamespace}-${runId}`;

    try {
      await runGit(repositoryRoot, [
        'worktree',
        'add',
        '-b',
        branchName,
        worktreeRoot,
        baseCommitSha,
      ]);
      if ((await gitHead(worktreeRoot)) !== baseCommitSha) {
        throw new Error(
          'Coding worktree was created from an unexpected commit.',
        );
      }
      await this.hydrateDependencies(worktreeRoot, input.signal);
      const hydrationChanges = await runGit(worktreeRoot, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--',
        '.',
      ]);
      if (hydrationChanges.trim()) {
        throw new Error(
          'Coding worktree dependency preparation changed repository files. Ensure dependency outputs are ignored by Git.',
        );
      }
    } catch (error) {
      await runGit(repositoryRoot, [
        'worktree',
        'remove',
        '--force',
        worktreeRoot,
      ]).catch(() => undefined);
      await rm(worktreeRoot, { recursive: true, force: true });
      await runGit(repositoryRoot, ['worktree', 'prune']).catch(
        () => undefined,
      );
      await runGit(repositoryRoot, ['branch', '-D', branchName]).catch(
        () => undefined,
      );
      throw error;
    }

    return {
      runId,
      repositoryRoot,
      worktreeRoot,
      branchName,
      baseCommitSha,
    };
  }

  async recover(worktree: CodingWorktree): Promise<CodingWorktree> {
    const { expectedBranch, expectedRoot } = this.assertRecord(worktree);
    const repositoryRoot = await canonicalGitRepository(
      worktree.repositoryRoot,
    );
    const worktreeRoot = await canonicalGitRepository(expectedRoot);
    if (worktreeRoot !== (await realpath(expectedRoot))) {
      throw new Error(
        'Coding worktree path no longer identifies its Git root.',
      );
    }
    const [repositoryCommonDirectory, worktreeCommonDirectory] =
      await Promise.all([
        gitCommonDirectory(repositoryRoot),
        gitCommonDirectory(worktreeRoot),
      ]);
    if (repositoryCommonDirectory !== worktreeCommonDirectory) {
      throw new Error('Coding worktree belongs to a different Git repository.');
    }
    const branch = (
      await runGit(worktreeRoot, ['branch', '--show-current'])
    ).trim();
    if (branch !== expectedBranch) {
      throw new Error('Coding worktree branch no longer matches its Run.');
    }
    await runGit(worktreeRoot, [
      'merge-base',
      '--is-ancestor',
      worktree.baseCommitSha,
      'HEAD',
    ]);
    return worktree;
  }

  async inspectForReview(
    worktree: CodingWorktree,
    commitSha: string | null,
  ): Promise<CodingDiff> {
    const recovered = await this.recover(worktree);
    const currentHead = await gitHead(recovered.worktreeRoot);
    if (commitSha === null) {
      return currentHead === recovered.baseCommitSha
        ? this.inspect(recovered)
        : this.inspectCommitted(recovered, currentHead);
    }
    const normalizedCommit = normalizeCommit(commitSha);
    if (currentHead !== normalizedCommit) {
      throw new Error('Coding worktree commit no longer matches its review.');
    }
    return this.inspectCommitted(recovered, normalizedCommit);
  }

  async inspect(worktree: CodingWorktree): Promise<CodingDiff> {
    this.assertRecord(worktree);
    await runGit(worktree.worktreeRoot, ['add', '--intent-to-add', '--', '.']);
    const [content, names] = await Promise.all([
      runGit(worktree.worktreeRoot, [
        'diff',
        '--no-ext-diff',
        '--binary',
        '--',
        '.',
      ]),
      runGit(worktree.worktreeRoot, ['diff', '--name-only', '-z', '--', '.']),
    ]);
    return {
      content,
      sha256: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      changedFileCount: names.split('\0').filter(Boolean).length,
    };
  }

  async commit(
    worktree: CodingWorktree,
    expectedDiffSha256: string,
    messageInput: string,
  ): Promise<string> {
    this.assertRecord(worktree);
    const message = normalizeCommitMessage(messageInput);
    const currentHead = await gitHead(worktree.worktreeRoot);
    if (currentHead !== worktree.baseCommitSha) {
      const committed = await this.inspectCommitted(worktree, currentHead);
      if (
        committed.changedFileCount > 0 &&
        committed.sha256 === expectedDiffSha256
      ) {
        return currentHead;
      }
      throw new Error('Coding worktree diff changed after review.');
    }
    const current = await this.inspect(worktree);
    if (current.changedFileCount === 0) {
      throw new Error('Coding worktree has no changes to commit.');
    }
    if (current.sha256 !== expectedDiffSha256) {
      throw new Error('Coding worktree diff changed after review.');
    }
    await runGit(worktree.worktreeRoot, ['add', '--all', '--', '.']);
    await runGit(worktree.worktreeRoot, ['commit', '-m', message]);
    return gitHead(worktree.worktreeRoot);
  }

  private async inspectCommitted(
    worktree: CodingWorktree,
    commitSha: string,
  ): Promise<CodingDiff> {
    const [content, names] = await Promise.all([
      runGit(worktree.worktreeRoot, [
        'diff',
        '--no-ext-diff',
        '--binary',
        worktree.baseCommitSha,
        commitSha,
        '--',
        '.',
      ]),
      runGit(worktree.worktreeRoot, [
        'diff',
        '--name-only',
        '-z',
        worktree.baseCommitSha,
        commitSha,
        '--',
        '.',
      ]),
    ]);
    return {
      content,
      sha256: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      changedFileCount: names.split('\0').filter(Boolean).length,
    };
  }

  async remove(
    worktree: CodingWorktree,
    options: { deleteBranch: boolean },
  ): Promise<void> {
    const { expectedBranch, expectedRoot } = this.assertRecord(worktree);
    const repositoryRoot = await canonicalGitRepository(
      worktree.repositoryRoot,
    );

    if (await pathExists(expectedRoot)) {
      await runGit(repositoryRoot, [
        'worktree',
        'remove',
        '--force',
        expectedRoot,
      ]);
    } else {
      await runGit(repositoryRoot, ['worktree', 'prune']);
    }
    if (options.deleteBranch) {
      const branchExists = await runGit(repositoryRoot, [
        'show-ref',
        '--verify',
        `refs/heads/${expectedBranch}`,
      ])
        .then(() => true)
        .catch(() => false);
      if (branchExists) {
        await runGit(repositoryRoot, ['branch', '-D', expectedBranch]);
      }
    }
  }

  private assertRecord(worktree: CodingWorktree): {
    expectedBranch: string;
    expectedRoot: string;
  } {
    const runId = normalizeRunId(worktree.runId);
    const expectedRoot = resolve(this.managedRoot, runId);
    assertManagedPath(this.managedRoot, expectedRoot);
    if (
      !isAbsolute(worktree.worktreeRoot) ||
      resolve(worktree.worktreeRoot) !== expectedRoot
    ) {
      throw new Error('Coding worktree path is outside the managed root.');
    }
    const expectedBranch = `evidence/${this.branchNamespace}-${runId}`;
    if (worktree.branchName !== expectedBranch) {
      throw new Error('Coding worktree branch identity is invalid.');
    }
    return { expectedBranch, expectedRoot };
  }
}

async function hydratePnpmDependencies(
  worktreeRoot: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!(await pathExists(join(worktreeRoot, 'pnpm-lock.yaml')))) return;

  try {
    await execFileAsync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [
        'install',
        '--offline',
        '--frozen-lockfile',
        '--ignore-scripts',
        '--reporter=append-only',
      ],
      {
        cwd: worktreeRoot,
        encoding: 'utf8',
        env: codingCommandEnvironment(),
        maxBuffer: DEPENDENCY_OUTPUT_LIMIT,
        signal,
        timeout: DEPENDENCY_TIMEOUT_MS,
        windowsHide: true,
      },
    );
  } catch (error) {
    throw new Error(
      `Coding worktree dependencies could not be prepared from the local pnpm store: ${errorMessage(error)}`,
    );
  }
}

function normalizeCommitMessage(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length > 200 ||
    /[\r\n]/.test(normalized) ||
    !/^(feat|fix|refactor|test|docs|chore)\((web|desktop|server|workspace|deps|ci|release)\): .+/.test(
      normalized,
    )
  ) {
    throw new Error(
      'Coding commit message must be a supported Conventional Commit.',
    );
  }
  return normalized;
}

function normalizeRunId(value: string): string {
  const normalized = value.trim();
  if (!RUN_ID_PATTERN.test(normalized)) {
    throw new Error('Coding Run identity is invalid.');
  }
  return normalized;
}

function normalizeCommit(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(normalized)) {
    throw new Error('Coding worktree base commit SHA is invalid.');
  }
  return normalized;
}

function assertManagedPath(root: string, candidate: string): void {
  const within = relative(root, candidate);
  if (
    !within ||
    isAbsolute(within) ||
    within === '..' ||
    within.startsWith(`..${sep}`)
  ) {
    throw new Error('Coding worktree path is outside the managed root.');
  }
}

async function gitCommonDirectory(root: string): Promise<string> {
  const value = (await runGit(root, ['rev-parse', '--git-common-dir'])).trim();
  return realpath(resolve(root, value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
