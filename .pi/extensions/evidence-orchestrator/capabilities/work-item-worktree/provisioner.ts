import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { BOARD_CANDIDATE_ID_PATTERN } from '../../iteration/board-codec';
import {
  allocateIterationId,
  mutateBoard,
  readBoard,
} from '../../iteration/board-repository';
import type { BoardItem } from '../../iteration/board-state';
import {
  createStoryWorktree,
  currentHead,
  storyBranchName,
  storyWorktreePath,
  type StoryWorktree,
} from './manager';

export interface ProvisionedWorkItem {
  item: BoardItem;
  worktree: StoryWorktree;
}

export class WorkItemProvisioningError extends Error {
  constructor(
    readonly iterationId: string,
    cause: unknown,
  ) {
    super(
      `Provisioning ${iterationId} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'WorkItemProvisioningError';
  }
}

function candidateId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!BOARD_CANDIDATE_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid Inbox Story candidate id: ${value}.`);
  }
  return normalized;
}

function boardItem(
  primaryRoot: string,
  iterationId: string,
  selectedCandidateId: string,
  baseSha: string,
  now: string,
): BoardItem {
  return {
    iteration_id: iterationId,
    candidate_id: selectedCandidateId,
    lifecycle: 'provisioning',
    branch_name: storyBranchName(iterationId),
    worktree_path: storyWorktreePath(primaryRoot, iterationId),
    base_sha: baseSha,
    admitted_lane: 'discovery',
    created_at: now,
    updated_at: now,
  };
}

function updateItem(
  primaryRoot: string,
  iterationId: string,
  update: (item: BoardItem) => void,
): BoardItem {
  return mutateBoard(primaryRoot, (draft) => {
    const item = draft.items.find(
      ({ iteration_id }) => iteration_id === iterationId,
    );
    if (!item) throw new Error(`Board item disappeared: ${iterationId}.`);
    update(item);
    return structuredClone(item);
  }).value;
}

/** Reserve a Candidate and provision its isolated worktree before exposing it as active. */
export function provisionWorkItem(
  primaryRoot: string,
  selectedCandidateId: string,
  initialize: (input: {
    iterationId: string;
    worktreeRoot: string;
  }) => void = () => undefined,
  now = new Date().toISOString(),
): ProvisionedWorkItem {
  const selected = candidateId(selectedCandidateId);
  const baseSha = currentHead(primaryRoot);
  const reservation = mutateBoard(primaryRoot, (draft) => {
    const iterationId = allocateIterationId(draft);
    const item = boardItem(primaryRoot, iterationId, selected, baseSha, now);
    draft.items.push(item);
    return structuredClone(item);
  }).value;
  let worktree: StoryWorktree | undefined;
  try {
    worktree = createStoryWorktree(
      primaryRoot,
      reservation.iteration_id,
      baseSha,
    );
    initialize({
      iterationId: reservation.iteration_id,
      worktreeRoot: worktree.path,
    });
    const active = updateItem(primaryRoot, reservation.iteration_id, (item) => {
      item.lifecycle = 'active';
      item.worktree_path = worktree?.path ?? item.worktree_path;
      item.updated_at = now;
    });
    return { item: active, worktree };
  } catch (error) {
    updateItem(primaryRoot, reservation.iteration_id, (item) => {
      item.lifecycle = 'provisioning_failed';
      item.updated_at = now;
    });
    throw new WorkItemProvisioningError(reservation.iteration_id, error);
  }
}

function branchName(worktreePath: string): string {
  return execFileSync('git', ['branch', '--show-current'], {
    cwd: worktreePath,
    encoding: 'utf8',
  }).trim();
}

/** Validate active Board pointers without interpreting Story workflow state. */
export function validateBoardWorktrees(primaryRoot: string): void {
  for (const item of readBoard(primaryRoot).items) {
    if (item.lifecycle === 'provisioning') {
      throw new Error(
        `Board item is still provisioning: ${item.iteration_id}.`,
      );
    }
    if (item.lifecycle === 'archived') {
      if (existsSync(item.worktree_path)) {
        throw new Error(
          `Archived Board worktree still exists: ${item.iteration_id}.`,
        );
      }
      continue;
    }
    if (item.lifecycle === 'provisioning_failed') continue;
    if (!existsSync(item.worktree_path)) {
      throw new Error(`Board worktree is missing: ${item.iteration_id}.`);
    }
    if (realpathSync(item.worktree_path) !== item.worktree_path) {
      throw new Error(
        `Board worktree path is not canonical: ${item.iteration_id}.`,
      );
    }
    if (branchName(item.worktree_path) !== item.branch_name) {
      throw new Error(`Board worktree branch drifted: ${item.iteration_id}.`);
    }
  }
}
