import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

interface SnapshotFile {
  content: Buffer;
  mode: number;
}

export interface WorktreeSnapshot {
  head: string;
  indexTree: string;
  tracked: Set<string>;
  untracked: Set<string>;
  files: Map<string, SnapshotFile>;
}

export interface WorktreeDelta {
  paths: string[];
  headChanged: boolean;
  indexChanged: boolean;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function nulPaths(cwd: string, args: string[]): string[] {
  return execFileSync('git', args, { cwd, encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function snapshotFile(cwd: string, path: string): SnapshotFile | undefined {
  const absolute = join(cwd, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return undefined;
  const stat = statSync(absolute);
  return { content: readFileSync(absolute), mode: stat.mode };
}

export function captureWorktreeSnapshot(cwd: string): WorktreeSnapshot {
  const tracked = new Set(nulPaths(cwd, ['ls-files', '-z']));
  const untracked = new Set(
    nulPaths(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
  );
  const files = new Map<string, SnapshotFile>();
  for (const path of new Set([...tracked, ...untracked])) {
    const file = snapshotFile(cwd, path);
    if (file) files.set(path, file);
  }
  return {
    head: git(cwd, ['rev-parse', '--verify', 'HEAD']),
    indexTree: git(cwd, ['write-tree']),
    tracked,
    untracked,
    files,
  };
}

export function worktreeDelta(
  cwd: string,
  snapshot: WorktreeSnapshot,
): WorktreeDelta {
  const paths = new Set<string>();
  for (const path of snapshot.tracked) {
    const before = snapshot.files.get(path);
    const after = snapshotFile(cwd, path);
    if (
      (!before && after) ||
      (before &&
        (!after ||
          !after.content.equals(before.content) ||
          after.mode !== before.mode))
    ) {
      paths.add(path);
    }
  }
  for (const path of snapshot.untracked) {
    const before = snapshot.files.get(path);
    const after = snapshotFile(cwd, path);
    if (
      (!before && after) ||
      (before &&
        (!after ||
          !after.content.equals(before.content) ||
          after.mode !== before.mode))
    ) {
      paths.add(path);
    }
  }
  const currentUntracked = new Set(
    nulPaths(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
  );
  for (const path of currentUntracked) {
    if (!snapshot.untracked.has(path)) paths.add(path);
  }
  let indexChanged = false;
  const indexPaths = git(cwd, [
    'diff',
    '--cached',
    '--name-only',
    snapshot.indexTree,
  ])
    .split('\n')
    .filter(Boolean);
  if (indexPaths.length > 0) {
    indexChanged = true;
    indexPaths.forEach((path) => paths.add(path));
  }
  return {
    paths: [...paths].sort(),
    headChanged: git(cwd, ['rev-parse', '--verify', 'HEAD']) !== snapshot.head,
    indexChanged,
  };
}

export function restoreWorktreeSnapshot(
  cwd: string,
  snapshot: WorktreeSnapshot,
): void {
  execFileSync('git', ['reset', '--hard', snapshot.head], {
    cwd,
    stdio: 'ignore',
  });
  const currentUntracked = nulPaths(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  for (const path of currentUntracked) {
    if (!snapshot.untracked.has(path)) {
      rmSync(join(cwd, path), { recursive: true, force: true });
    }
  }
  for (const path of snapshot.tracked) {
    const before = snapshot.files.get(path);
    const absolute = join(cwd, path);
    if (!before) {
      rmSync(absolute, { recursive: true, force: true });
      continue;
    }
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, before.content);
    chmodSync(absolute, before.mode);
  }
  for (const path of snapshot.untracked) {
    const before = snapshot.files.get(path);
    if (!before) continue;
    const absolute = join(cwd, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, before.content);
    chmodSync(absolute, before.mode);
  }
  execFileSync('git', ['read-tree', snapshot.indexTree], {
    cwd,
    stdio: 'ignore',
  });
}
