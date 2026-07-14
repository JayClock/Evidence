import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { WorkflowState } from './types';

export const ARTIFACTS_ROOT = 'artifacts';
export const ITERATIONS_ROOT = 'artifacts/iterations';
export const ITERATION_ID_PATTERN = /^ITER-\d{4,}$/;

export function assertIterationId(iterationId: string): void {
  if (!ITERATION_ID_PATTERN.test(iterationId)) {
    throw new Error(
      `Invalid Evidence Orchestrator iteration id: ${iterationId}. Expected ITER-xxxx.`,
    );
  }
}

export function activeIterationId(state: WorkflowState): string {
  if (!state.iteration_id) {
    throw new Error(
      'No Evidence Orchestrator iteration is active. Start one from a GitHub Issue.',
    );
  }
  assertIterationId(state.iteration_id);
  return state.iteration_id;
}

export function iterationRootRelative(iterationId: string): string {
  assertIterationId(iterationId);
  return `${ITERATIONS_ROOT}/${iterationId}`;
}

export function iterationRoot(cwd: string, state: WorkflowState): string {
  return join(cwd, iterationRootRelative(activeIterationId(state)));
}

/** Resolve a logical artifacts path into the active iteration namespace. */
export function artifactPath(
  cwd: string,
  state: WorkflowState,
  logicalPath: string,
): string {
  if (!logicalPath.startsWith(`${ARTIFACTS_ROOT}/`)) {
    return join(cwd, logicalPath);
  }
  return join(
    iterationRoot(cwd, state),
    logicalPath.slice(`${ARTIFACTS_ROOT}/`.length),
  );
}

export function artifactRelativePath(
  state: WorkflowState,
  logicalPath: string,
): string {
  if (!logicalPath.startsWith(`${ARTIFACTS_ROOT}/`)) return logicalPath;
  return `${iterationRootRelative(activeIterationId(state))}/${logicalPath.slice(
    `${ARTIFACTS_ROOT}/`.length,
  )}`;
}

export function resolveArtifactPaths(
  cwd: string,
  state: WorkflowState,
  logicalPaths: string[],
): string[] {
  return logicalPaths.map((path) =>
    relative(cwd, artifactPath(cwd, state, path)),
  );
}

export function nextIterationId(cwd: string): string {
  const root = join(cwd, ITERATIONS_ROOT);
  const highest = existsSync(root)
    ? readdirSync(root)
        .filter((entry) => ITERATION_ID_PATTERN.test(entry))
        .map((entry) => Number(entry.slice('ITER-'.length)))
        .filter(Number.isSafeInteger)
        .reduce((max, value) => Math.max(max, value), 0)
    : 0;
  return `ITER-${String(highest + 1).padStart(4, '0')}`;
}
