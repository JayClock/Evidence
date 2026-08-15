export const WORKTREE_PROTECTED_ROOTS = [
  '.git',
  '.pi',
  '.evidence',
  'node_modules',
];

export const WORKTREE_PROTECTED_NAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'nx.json',
  'project.json',
  'tsconfig.json',
  'tsconfig.base.json',
]);

export function protectedWorktreePath(path: string): boolean {
  return WORKTREE_PROTECTED_ROOTS.some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

export function worktreeRootOwns(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function testSourcePath(path: string): boolean {
  return /(^|\/)(?:tests?\/|__tests__\/)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(
    path,
  );
}
