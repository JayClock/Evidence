import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { codingCommandEnvironment } from './coding-command-environment';
import { canonicalGitRepository, gitHead, runGit } from './git-repository';

const execFileAsync = promisify(execFile);

const ITERATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const DEPENDENCY_OUTPUT_LIMIT = 2 * 1024 * 1024;
const DEPENDENCY_TIMEOUT_MS = 10 * 60 * 1_000;

export interface IterationDiff {
  content: string;
  sha256: string;
  changedFileCount: number;
}

export interface IterationWorktreeSnapshot extends IterationDiff {
  headSha: string;
  changedPaths: string[];
  pathFingerprints: Record<string, string>;
  worktreeSha256: string;
}

export interface IterationWorktree {
  iterationId: string;
  repositoryRoot: string;
  worktreeRoot: string;
  branchName: string;
  baseCommitSha: string;
}

export type IterationDependencyHydrator = (
  worktreeRoot: string,
  signal?: AbortSignal,
) => Promise<void>;

export class IterationWorktreeManager {
  private readonly managedRoot: string;

  constructor(
    root: string,
    private readonly hydrateDependencies: IterationDependencyHydrator = hydratePnpmDependencies,
  ) {
    this.managedRoot = resolve(root);
  }

  locate(input: {
    iterationId: string;
    repositoryRoot: string;
    baseCommitSha: string;
    branchName: string;
  }): IterationWorktree {
    const iterationId = normalizeIterationId(input.iterationId);
    const baseCommitSha = normalizeCommit(input.baseCommitSha);
    const branchName = `evidence/iter-${iterationId}`;
    if (input.branchName !== branchName) {
      throw new Error('Iteration worktree branch identity is invalid.');
    }
    const worktreeRoot = resolve(this.managedRoot, iterationId);
    assertManagedPath(this.managedRoot, worktreeRoot);
    return {
      iterationId,
      repositoryRoot: input.repositoryRoot,
      worktreeRoot,
      branchName,
      baseCommitSha,
    };
  }

  async prepare(input: {
    iterationId: string;
    repositoryRoot: string;
    baseCommitSha: string;
    signal?: AbortSignal;
  }): Promise<IterationWorktree> {
    const iterationId = normalizeIterationId(input.iterationId);
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
      throw new Error('Iteration worktree base commit does not match Git.');
    }

    await mkdir(this.managedRoot, { recursive: true });
    const worktreeRoot = resolve(this.managedRoot, iterationId);
    assertManagedPath(this.managedRoot, worktreeRoot);
    if (await pathExists(worktreeRoot)) {
      throw new Error(`Iteration worktree ${iterationId} already exists.`);
    }
    const branchName = `evidence/iter-${iterationId}`;

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
          'Iteration worktree was created from an unexpected commit.',
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
          'Iteration worktree dependency preparation changed repository files. Ensure dependency outputs are ignored by Git.',
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
      iterationId,
      repositoryRoot,
      worktreeRoot,
      branchName,
      baseCommitSha,
    };
  }

  async recover(worktree: IterationWorktree): Promise<IterationWorktree> {
    const { expectedBranch, expectedRoot } = this.assertRecord(worktree);
    const repositoryRoot = await canonicalGitRepository(
      worktree.repositoryRoot,
    );
    const worktreeRoot = await canonicalGitRepository(expectedRoot);
    if (worktreeRoot !== (await realpath(expectedRoot))) {
      throw new Error(
        'Iteration worktree path no longer identifies its Git root.',
      );
    }
    const [repositoryCommonDirectory, worktreeCommonDirectory] =
      await Promise.all([
        gitCommonDirectory(repositoryRoot),
        gitCommonDirectory(worktreeRoot),
      ]);
    if (repositoryCommonDirectory !== worktreeCommonDirectory) {
      throw new Error(
        'Iteration worktree belongs to a different Git repository.',
      );
    }
    const branch = (
      await runGit(worktreeRoot, ['branch', '--show-current'])
    ).trim();
    if (branch !== expectedBranch) {
      throw new Error(
        'Iteration worktree branch no longer matches its Iteration.',
      );
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
    worktree: IterationWorktree,
    commitSha: string | null,
  ): Promise<IterationDiff> {
    const recovered = await this.recover(worktree);
    const currentHead = await gitHead(recovered.worktreeRoot);
    if (commitSha === null) {
      return currentHead === recovered.baseCommitSha
        ? this.inspect(recovered)
        : this.inspectCommitted(recovered, currentHead);
    }
    const normalizedCommit = normalizeCommit(commitSha);
    if (currentHead !== normalizedCommit) {
      throw new Error(
        'Iteration worktree commit no longer matches its review.',
      );
    }
    return this.inspectCommitted(recovered, normalizedCommit);
  }

  async inspect(worktree: IterationWorktree): Promise<IterationDiff> {
    const snapshot = await this.snapshot(worktree);
    return {
      content: snapshot.content,
      sha256: snapshot.sha256,
      changedFileCount: snapshot.changedFileCount,
    };
  }

  async snapshot(
    worktree: IterationWorktree,
  ): Promise<IterationWorktreeSnapshot> {
    this.assertRecord(worktree);
    const headSha = await gitHead(worktree.worktreeRoot);
    if (headSha !== worktree.baseCommitSha) {
      throw new Error('Iteration worktree HEAD changed from its locked base.');
    }
    await runGit(worktree.worktreeRoot, ['add', '--intent-to-add', '--', '.']);
    const [content, names] = await Promise.all([
      runGit(worktree.worktreeRoot, [
        'diff',
        '--no-ext-diff',
        '--no-renames',
        '--binary',
        '--',
        '.',
      ]),
      runGit(worktree.worktreeRoot, [
        'diff',
        '--no-renames',
        '--name-only',
        '-z',
        '--',
        '.',
      ]),
    ]);
    const changedPaths = names.split('\0').filter(Boolean).sort();
    const pathFingerprints = Object.fromEntries(
      await Promise.all(
        changedPaths.map(async (path) => [
          path,
          await runGit(worktree.worktreeRoot, [
            'hash-object',
            '--no-filters',
            '--',
            path,
          ])
            .then((value) => `blob:${value.trim().toLowerCase()}`)
            .catch(() => 'deleted'),
        ]),
      ),
    );
    const sha256 = digest(content);
    return {
      content,
      sha256,
      changedFileCount: changedPaths.length,
      headSha,
      changedPaths,
      pathFingerprints,
      worktreeSha256: digest(
        JSON.stringify({
          headSha,
          paths: changedPaths.map((path) => [path, pathFingerprints[path]]),
        }),
      ),
    };
  }

  async restoreCheckpoint(
    worktree: IterationWorktree,
    patch: string,
    expectedDiffSha256: string,
  ): Promise<IterationWorktreeSnapshot> {
    this.assertRecord(worktree);
    await this.recover(worktree);
    if (digest(patch) !== expectedDiffSha256) {
      throw new Error('Iteration checkpoint patch SHA-256 is invalid.');
    }
    const patchPath = join(
      this.managedRoot,
      `.pair-checkpoint-${process.pid}-${Date.now()}.patch`,
    );
    await runGit(worktree.worktreeRoot, [
      'reset',
      '--hard',
      worktree.baseCommitSha,
    ]);
    await runGit(worktree.worktreeRoot, ['clean', '-fd', '--', '.']);
    try {
      if (patch) {
        await writeFile(patchPath, patch, { encoding: 'utf8', mode: 0o600 });
        await runGit(worktree.worktreeRoot, [
          'apply',
          '--binary',
          '--whitespace=nowarn',
          patchPath,
        ]);
      }
      const restored = await this.snapshot(worktree);
      if (restored.sha256 !== expectedDiffSha256) {
        throw new Error('Iteration checkpoint did not restore its exact diff.');
      }
      return restored;
    } catch (error) {
      await runGit(worktree.worktreeRoot, [
        'reset',
        '--hard',
        worktree.baseCommitSha,
      ]).catch(() => undefined);
      await runGit(worktree.worktreeRoot, ['clean', '-fd', '--', '.']).catch(
        () => undefined,
      );
      throw error;
    } finally {
      await rm(patchPath, { force: true });
    }
  }

  async commit(
    worktree: IterationWorktree,
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
      throw new Error('Iteration worktree diff changed after review.');
    }
    const current = await this.inspect(worktree);
    if (current.changedFileCount === 0) {
      throw new Error('Iteration worktree has no changes to commit.');
    }
    if (current.sha256 !== expectedDiffSha256) {
      throw new Error('Iteration worktree diff changed after review.');
    }
    await runGit(worktree.worktreeRoot, ['add', '--all', '--', '.']);
    await runGit(worktree.worktreeRoot, ['commit', '-m', message]);
    return gitHead(worktree.worktreeRoot);
  }

  private async inspectCommitted(
    worktree: IterationWorktree,
    commitSha: string,
  ): Promise<IterationDiff> {
    const [content, names] = await Promise.all([
      runGit(worktree.worktreeRoot, [
        'diff',
        '--no-ext-diff',
        '--no-renames',
        '--binary',
        worktree.baseCommitSha,
        commitSha,
        '--',
        '.',
      ]),
      runGit(worktree.worktreeRoot, [
        'diff',
        '--no-renames',
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
    worktree: IterationWorktree,
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

  private assertRecord(worktree: IterationWorktree): {
    expectedBranch: string;
    expectedRoot: string;
  } {
    const iterationId = normalizeIterationId(worktree.iterationId);
    const expectedRoot = resolve(this.managedRoot, iterationId);
    assertManagedPath(this.managedRoot, expectedRoot);
    if (
      !isAbsolute(worktree.worktreeRoot) ||
      resolve(worktree.worktreeRoot) !== expectedRoot
    ) {
      throw new Error('Iteration worktree path is outside the managed root.');
    }
    const expectedBranch = `evidence/iter-${iterationId}`;
    if (worktree.branchName !== expectedBranch) {
      throw new Error('Iteration worktree branch identity is invalid.');
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
      `Iteration worktree dependencies could not be prepared from the local pnpm store: ${errorMessage(error)}`,
    );
  }
}

export function changedPathsBetween(
  before: Pick<IterationWorktreeSnapshot, 'pathFingerprints'>,
  after: Pick<IterationWorktreeSnapshot, 'pathFingerprints'>,
): string[] {
  return [
    ...new Set([
      ...Object.keys(before.pathFingerprints),
      ...Object.keys(after.pathFingerprints),
    ]),
  ]
    .filter(
      (path) => before.pathFingerprints[path] !== after.pathFingerprints[path],
    )
    .sort();
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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
      'Iteration commit message must be a supported Conventional Commit.',
    );
  }
  return normalized;
}

function normalizeIterationId(value: string): string {
  const normalized = value.trim();
  if (!ITERATION_ID_PATTERN.test(normalized)) {
    throw new Error('Iteration identity is invalid.');
  }
  return normalized;
}

function normalizeCommit(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(normalized)) {
    throw new Error('Iteration worktree base commit SHA is invalid.');
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
    throw new Error('Iteration worktree path is outside the managed root.');
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
