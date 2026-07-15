import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkflowState } from './state';

type IterationIdentity = Pick<WorkflowState, 'iteration_id'>;

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

export function iterationRootRelative(iterationId: string): string {
  assertIterationId(iterationId);
  return `${ITERATIONS_ROOT}/${iterationId}`;
}

export function iterationRoot(cwd: string, state: IterationIdentity): string {
  return join(cwd, iterationRootRelative(state.iteration_id));
}

/** Resolve a logical artifacts path into the active iteration namespace. */
export function artifactPath(
  cwd: string,
  state: IterationIdentity,
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
  state: IterationIdentity,
  logicalPath: string,
): string {
  if (!logicalPath.startsWith(`${ARTIFACTS_ROOT}/`)) return logicalPath;
  return `${iterationRootRelative(state.iteration_id)}/${logicalPath.slice(
    `${ARTIFACTS_ROOT}/`.length,
  )}`;
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
