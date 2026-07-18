import { existsSync, realpathSync } from 'node:fs';
import { ACTIVITY_ITERATION_ENV } from '../../capabilities/worktree-protection/activity-tool-policy';
import { BOARD_ITERATION_ID_PATTERN } from '../../iteration/board-codec';
import { primaryWorktreeRoot } from '../../iteration/git-common-dir';
import { readBoard } from '../../iteration/board-repository';
import type { BoardItem } from '../../iteration/board-state';
import { readPersistedState } from '../../iteration/state-repository';
import type { WorkflowState } from '../../iteration/state';

export interface ParsedIterationCommand {
  iterationId: string;
  rest: string;
}

export interface WorkItemTarget {
  primaryRoot: string;
  item: BoardItem;
  worktreeRoot: string;
  state: WorkflowState;
}

export interface WorkItemTargetOptions {
  allowPending?: boolean;
  allowTerminal?: boolean;
  allowProvisioningFailed?: boolean;
}

export function parseIterationCommand(args: string): ParsedIterationCommand {
  const normalized = args.trim();
  const separator = normalized.search(/\s/);
  const rawIterationId =
    separator < 0 ? normalized : normalized.slice(0, separator);
  const iterationId = rawIterationId.toUpperCase();
  if (!BOARD_ITERATION_ID_PATTERN.test(iterationId)) {
    throw new Error('Story command requires ITER-xxxx as its first argument.');
  }
  return {
    iterationId,
    rest: separator < 0 ? '' : normalized.slice(separator).trim(),
  };
}

export function requireWorkItemTarget(
  primaryRoot: string,
  iterationId: string,
  options: WorkItemTargetOptions = {},
): WorkItemTarget {
  const normalized = iterationId.trim().toUpperCase();
  if (!BOARD_ITERATION_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid Iteration id: ${iterationId}.`);
  }
  const boundIterationId =
    process.env[ACTIVITY_ITERATION_ENV]?.trim().toUpperCase();
  if (boundIterationId && boundIterationId !== normalized) {
    throw new Error(
      `Activity context is bound to ${boundIterationId}; refusing target ${normalized}.`,
    );
  }
  const repositoryPrimaryRoot = primaryWorktreeRoot(primaryRoot);
  const item = readBoard(repositoryPrimaryRoot).items.find(
    ({ iteration_id }) => iteration_id === normalized,
  );
  if (!item) throw new Error(`Board item does not exist: ${normalized}.`);
  if (item.lifecycle === 'archived') {
    throw new Error(`Board item is archived: ${normalized}.`);
  }
  if (
    item.lifecycle === 'provisioning_failed' &&
    !options.allowProvisioningFailed
  ) {
    throw new Error(`Board item provisioning failed: ${normalized}.`);
  }
  if (item.lifecycle === 'provisioning') {
    throw new Error(`Board item is still provisioning: ${normalized}.`);
  }
  if (item.lifecycle === 'terminal' && !options.allowTerminal) {
    throw new Error(`Board item is terminal: ${normalized}.`);
  }
  if (item.pending_lane && !options.allowPending) {
    throw new Error(
      `${normalized} is queued for ${item.pending_lane}; run /evidence-flow pull ${normalized}.`,
    );
  }
  if (!existsSync(item.worktree_path)) {
    throw new Error(`Board worktree is missing: ${normalized}.`);
  }
  const worktreeRoot = realpathSync(item.worktree_path);
  if (worktreeRoot !== item.worktree_path) {
    throw new Error(`Board worktree path drifted: ${normalized}.`);
  }
  const state = readPersistedState(worktreeRoot);
  if (!state) throw new Error(`Story state is missing: ${normalized}.`);
  if (state.iteration_id !== normalized) {
    throw new Error(
      `Board/State Iteration mismatch: ${normalized}/${state.iteration_id}.`,
    );
  }
  return {
    primaryRoot: repositoryPrimaryRoot,
    item,
    worktreeRoot,
    state,
  };
}
