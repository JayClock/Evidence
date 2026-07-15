import { execFileSync } from 'node:child_process';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function codePaths(paths: string[]): string[] {
  return paths.filter(
    (path) => path.startsWith('apps/') || path.startsWith('libs/'),
  );
}

/** Capture one clean, immutable baseline before Pair writes code. */
export function createCodingGitBaseline(cwd: string): string {
  const dirtyPaths = codePaths(
    git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
      .split('\n')
      .filter(Boolean)
      .map((line) =>
        (line.slice(3).split(' -> ').at(-1) ?? '').replaceAll('"', ''),
      ),
  );
  if (dirtyPaths.length > 0) {
    throw new Error(
      `Cannot select a coding work item with pre-existing code changes: ${dirtyPaths.join(', ')}. Commit, stash, or revert them first.`,
    );
  }
  return git(cwd, ['rev-parse', '--verify', 'HEAD']);
}
