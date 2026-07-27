import type {
  PairDriverRole,
  PairDriverRuntimeRequest,
} from './pair-agent-protocol';

export const PAIR_PROTECTED_ROOTS = [
  '.git',
  '.pi',
  '.evidence',
  'node_modules',
  'engineering/evidence-orchestrator',
  'artifacts/iterations',
];

export const PAIR_PROTECTED_NAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'nx.json',
  'project.json',
  'tsconfig.json',
  'tsconfig.base.json',
]);

export interface PairDriverWritePolicy {
  role: PairDriverRole;
  allowedTestRoots: string[];
  allowedProductionRoots: string[];
  frozenTestPaths: string[];
}

export function pairDriverWritePolicy(
  request: PairDriverRuntimeRequest,
): PairDriverWritePolicy {
  return {
    role: request.role,
    allowedTestRoots: request.allowedTestRoots,
    allowedProductionRoots: request.allowedProductionRoots,
    frozenTestPaths: request.frozenTestPaths,
  };
}

export function assertPairDriverChangedPaths(
  policy: PairDriverWritePolicy,
  paths: string[],
): void {
  for (const path of paths) {
    const name = path.split('/').at(-1) ?? path;
    if (pairProtectedPath(path) || PAIR_PROTECTED_NAMES.has(name)) {
      throw new Error(`Pair Driver changed protected path ${path}.`);
    }
    if (policy.role === 'test') {
      if (
        !policy.allowedTestRoots.some((root) => pairRootOwns(root, path)) ||
        !pairTestPath(path)
      ) {
        throw new Error(`Test Driver changed non-test path ${path}.`);
      }
      continue;
    }
    if (
      !policy.allowedProductionRoots.some((root) => pairRootOwns(root, path))
    ) {
      throw new Error(`Production Driver changed unplanned path ${path}.`);
    }
    if (pairTestPath(path) || policy.frozenTestPaths.includes(path)) {
      throw new Error(`Production Driver changed frozen test ${path}.`);
    }
  }
}

export function pairProtectedPath(path: string): boolean {
  return PAIR_PROTECTED_ROOTS.some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

export function pairRootOwns(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function pairTestPath(path: string): boolean {
  return /(^|\/)(?:tests?\/|__tests__\/)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(
    path,
  );
}
