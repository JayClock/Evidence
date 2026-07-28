import {
  protectedWorktreePath,
  testSourcePath,
  worktreeRootOwns,
  WORKTREE_PROTECTED_NAMES,
} from '../../capabilities/worktree-protection/policy';
import type {
  PairDriverRole,
  PairDriverRuntimeRequest,
} from './driver-protocol';

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
    if (protectedWorktreePath(path) || WORKTREE_PROTECTED_NAMES.has(name)) {
      throw new Error(`Pair Driver changed protected path ${path}.`);
    }
    if (policy.role === 'test') {
      if (
        !policy.allowedTestRoots.some((root) => worktreeRootOwns(root, path)) ||
        !testSourcePath(path)
      ) {
        throw new Error(`Test Driver changed non-test path ${path}.`);
      }
      continue;
    }
    if (
      !policy.allowedProductionRoots.some((root) =>
        worktreeRootOwns(root, path),
      )
    ) {
      throw new Error(`Production Driver changed unplanned path ${path}.`);
    }
    if (testSourcePath(path) || policy.frozenTestPaths.includes(path)) {
      throw new Error(`Production Driver changed frozen test ${path}.`);
    }
  }
}
