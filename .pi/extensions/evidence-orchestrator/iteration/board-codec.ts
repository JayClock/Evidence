import { isAbsolute } from 'node:path';
import type {
  BoardItem,
  BoardItemLifecycle,
  BoardState,
  FlowLane,
} from './board-state';

export const BOARD_ITERATION_ID_PATTERN = /^ITER-\d{4,}$/;
export const BOARD_CANDIDATE_ID_PATTERN = /^CAND-\d{4,}$/;
export const BOARD_BRANCH_PATTERN = /^evidence\/iter-\d{4,}$/;

const SHA_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const LIFECYCLES = new Set<BoardItemLifecycle>([
  'provisioning',
  'active',
  'terminal',
  'provisioning_failed',
  'archived',
]);
const LANES = new Set<FlowLane>([
  'discovery',
  'planning',
  'ready',
  'delivery',
  'review',
  'done',
]);
const BOARD_FIELDS = new Set(['revision', 'next_iteration_number', 'items']);
const ITEM_FIELDS = new Set([
  'iteration_id',
  'candidate_id',
  'lifecycle',
  'branch_name',
  'worktree_path',
  'base_sha',
  'admitted_lane',
  'pending_lane',
  'pending_lane_requested_at',
  'pending_state_sha256',
  'created_at',
  'updated_at',
  'terminal_at',
  'archived_at',
]);

function record(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function unexpectedFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  subject: string,
): void {
  const unexpected = Object.keys(value).filter((field) => !allowed.has(field));
  if (unexpected.length > 0) {
    throw new Error(
      `${subject} has unsupported fields: ${unexpected.join(', ')}.`,
    );
  }
}

function itemNumber(iterationId: string): number {
  return Number(iterationId.slice('ITER-'.length));
}

function normalizeItem(value: unknown, index: number): BoardItem {
  const raw = record(value, `Board item[${index}]`);
  unexpectedFields(raw, ITEM_FIELDS, `Board item[${index}]`);
  const item = structuredClone(raw) as unknown as BoardItem;
  const pendingValues = [
    item.pending_lane,
    item.pending_lane_requested_at,
    item.pending_state_sha256,
  ];
  const hasPending = pendingValues.some((entry) => entry !== undefined);
  const hasCompletePending = pendingValues.every(
    (entry) => entry !== undefined,
  );

  if (
    !BOARD_ITERATION_ID_PATTERN.test(item.iteration_id) ||
    !BOARD_CANDIDATE_ID_PATTERN.test(item.candidate_id) ||
    !LIFECYCLES.has(item.lifecycle) ||
    !BOARD_BRANCH_PATTERN.test(item.branch_name) ||
    !isAbsolute(item.worktree_path) ||
    !SHA_PATTERN.test(item.base_sha) ||
    !LANES.has(item.admitted_lane) ||
    (hasPending &&
      (!hasCompletePending ||
        !LANES.has(item.pending_lane as FlowLane) ||
        item.pending_lane === item.admitted_lane ||
        !timestamp(item.pending_lane_requested_at) ||
        !SHA256_PATTERN.test(item.pending_state_sha256 ?? ''))) ||
    !timestamp(item.created_at) ||
    !timestamp(item.updated_at) ||
    (item.terminal_at !== undefined && !timestamp(item.terminal_at)) ||
    (item.archived_at !== undefined && !timestamp(item.archived_at))
  ) {
    throw new Error(`Board item is invalid: ${item.iteration_id || index}.`);
  }
  if (item.lifecycle === 'terminal' && !item.terminal_at) {
    throw new Error(
      `Terminal Board item lacks terminal_at: ${item.iteration_id}.`,
    );
  }
  if (
    item.lifecycle === 'archived' &&
    (!item.terminal_at || !item.archived_at)
  ) {
    throw new Error(
      `Archived Board item lacks terminal timestamps: ${item.iteration_id}.`,
    );
  }
  if (
    !['terminal', 'archived'].includes(item.lifecycle) &&
    (item.terminal_at !== undefined || item.archived_at !== undefined)
  ) {
    throw new Error(
      `Non-terminal Board item has terminal timestamps: ${item.iteration_id}.`,
    );
  }
  if (
    (item.admitted_lane === 'done') !==
    ['terminal', 'archived'].includes(item.lifecycle)
  ) {
    throw new Error(
      `Board done lane and lifecycle disagree: ${item.iteration_id}.`,
    );
  }
  if (item.lifecycle !== 'active' && hasPending) {
    throw new Error(
      `Only active Board items may await lane admission: ${item.iteration_id}.`,
    );
  }
  return item;
}

function unique(
  items: BoardItem[],
  select: (item: BoardItem) => string,
  subject: string,
): void {
  const values = items.map(select);
  if (new Set(values).size !== values.length) {
    throw new Error(`Board ${subject} must be unique.`);
  }
}

export function normalizeBoardState(value: unknown): BoardState {
  const raw = record(value, 'Board state');
  unexpectedFields(raw, BOARD_FIELDS, 'Board state');
  if (
    !integer(raw.revision, 0) ||
    !integer(raw.next_iteration_number, 1) ||
    !Array.isArray(raw.items)
  ) {
    throw new Error('Board state is invalid.');
  }
  const items = raw.items.map(normalizeItem);
  unique(items, ({ iteration_id }) => iteration_id, 'iteration ids');
  unique(items, ({ candidate_id }) => candidate_id, 'Candidate claims');
  unique(items, ({ branch_name }) => branch_name, 'branch names');
  unique(items, ({ worktree_path }) => worktree_path, 'worktree paths');
  const highest = Math.max(
    0,
    ...items.map(({ iteration_id }) => itemNumber(iteration_id)),
  );
  if (Number(raw.next_iteration_number) <= highest) {
    throw new Error(
      'Board next iteration number is not ahead of allocated ids.',
    );
  }
  return {
    revision: Number(raw.revision),
    next_iteration_number: Number(raw.next_iteration_number),
    items,
  };
}
