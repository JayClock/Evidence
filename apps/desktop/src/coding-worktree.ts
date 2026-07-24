import { createHash } from 'node:crypto';
import { access, mkdir, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { canonicalGitRepository, gitHead, runGit } from './git-repository';

const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

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

export class CodingWorktreeManager {
  private readonly managedRoot: string;

  constructor(root: string) {
    this.managedRoot = resolve(root);
  }

  async prepare(input: {
    runId: string;
    repositoryRoot: string;
    baseCommitSha: string;
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
    const branchName = `evidence/run-${runId}`;

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
      await runGit(repositoryRoot, ['branch', '-D', expectedBranch]);
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
    const expectedBranch = `evidence/run-${runId}`;
    if (worktree.branchName !== expectedBranch) {
      throw new Error('Coding worktree branch identity is invalid.');
    }
    return { expectedBranch, expectedRoot };
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
