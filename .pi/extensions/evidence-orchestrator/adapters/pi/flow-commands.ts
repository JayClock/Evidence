import { existsSync } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  pullPendingLane,
  reconcileBoardItem,
} from '../../capabilities/flow-control/admission';
import { recoverExpiredActivityLease } from '../../capabilities/flow-control/lease';
import { projectFlow } from '../../capabilities/flow-control/projection';
import {
  removeStoryWorktree,
  worktreeIsClean,
} from '../../capabilities/work-item-worktree/manager';
import { appendBoardEvent } from '../../iteration/board-events';
import { mutateBoard, readBoard } from '../../iteration/board-repository';
import type { WorkflowState } from '../../iteration/state';
import { readPersistedState } from '../../iteration/state-repository';
import { EVIDENCE_COMMANDS } from './command-names';
import { requireWorkItemTarget } from './work-item-target';

function storyId(state: WorkflowState): string {
  return (
    state.active_work_item?.story_id ??
    state.active_clarification_story?.story_id ??
    state.confirmed_scenarios?.[0]?.story_id ??
    'unconfirmed'
  );
}

export function flowListMarkdown(primaryRoot: string): string {
  const board = readBoard(primaryRoot);
  const active = board.items.filter(({ lifecycle }) =>
    ['provisioning', 'active'].includes(lifecycle),
  );
  const lines = [
    '# Evidence Story Flow',
    '',
    `- Board revision: ${board.revision}`,
    `- Active: ${active.length}`,
    '',
  ];
  const visible = board.items.filter(
    ({ lifecycle }) => lifecycle !== 'archived',
  );
  const selected = visible.slice(-50);
  for (const item of selected) {
    const state = existsSync(item.worktree_path)
      ? readPersistedState(item.worktree_path)
      : undefined;
    const projection = state
      ? projectFlow(state, item)
      : {
          desired_lane: item.admitted_lane,
          condition:
            item.lifecycle === 'archived' || item.lifecycle === 'terminal'
              ? ('terminal' as const)
              : ('blocked' as const),
          blocker: 'Story state or worktree is unavailable.',
        };
    lines.push(
      `- ${item.iteration_id} · ${item.admitted_lane} · ${projection.condition} · ${state ? storyId(state) : item.lifecycle}${item.pending_lane ? ` · queued:${item.pending_lane}` : ''}${projection.blocker ? ` · ${projection.blocker}` : ''}`,
    );
  }
  if (selected.length === 0) lines.push('- No active Story Work Items.');
  if (visible.length > selected.length) {
    lines.push(`- … ${visible.length - selected.length} older item(s) hidden.`);
  }
  return lines.join('\n');
}

function nonEmptyReason(value: string, action: string): string {
  const reason = value.trim();
  if (!reason) throw new Error(`/evidence-flow ${action} requires a reason.`);
  return reason;
}

function parseTargetAndReason(value: string, action: string) {
  const normalized = value.trim();
  const separator = normalized.search(/\s/);
  const iterationId = (
    separator < 0 ? normalized : normalized.slice(0, separator)
  ).toUpperCase();
  const reason = nonEmptyReason(
    separator < 0 ? '' : normalized.slice(separator).trim(),
    action,
  );
  return { iterationId, reason };
}

function recoverFailedProvisioning(
  primaryRoot: string,
  iterationId: string,
  reason: string,
  now = new Date().toISOString(),
): void {
  const board = readBoard(primaryRoot);
  const item = board.items.find(
    ({ iteration_id }) => iteration_id === iterationId,
  );
  if (!item || item.lifecycle !== 'provisioning_failed') {
    throw new Error(
      `Only a failed provisioning can be recovered: ${iterationId}.`,
    );
  }
  if (existsSync(item.worktree_path)) {
    if (!worktreeIsClean(item.worktree_path)) {
      throw new Error(
        `Failed provisioning worktree is dirty and requires manual preservation: ${iterationId}.`,
      );
    }
    removeStoryWorktree(primaryRoot, item.worktree_path);
  }
  mutateBoard(primaryRoot, (draft) => {
    const failed = draft.items.find(
      ({ iteration_id }) => iteration_id === iterationId,
    );
    if (!failed) throw new Error(`Board item disappeared: ${iterationId}.`);
    failed.lifecycle = 'archived';
    failed.admitted_lane = 'done';
    failed.updated_at = now;
    failed.terminal_at = now;
    failed.archived_at = now;
    delete failed.pending_lane;
    delete failed.pending_lane_requested_at;
    delete failed.pending_state_sha256;
  });
  appendBoardEvent(primaryRoot, {
    type: 'provisioning_recovered',
    iteration_id: iterationId,
    recorded_at: now,
    from_lane: item.admitted_lane,
    to_lane: 'done',
    outcome: 'archived',
    reason,
  });
}

function recoverWork(
  primaryRoot: string,
  iterationId: string,
  reason: string,
): 'provisioning' | 'lease' {
  const item = readBoard(primaryRoot).items.find(
    ({ iteration_id }) => iteration_id === iterationId,
  );
  if (item?.lifecycle === 'provisioning_failed') {
    recoverFailedProvisioning(primaryRoot, iterationId, reason);
    return 'provisioning';
  }
  if (item?.lifecycle === 'active') {
    recoverExpiredActivityLease(primaryRoot, iterationId, reason);
    return 'lease';
  }
  throw new Error(`No recoverable work exists for ${iterationId}.`);
}

function archiveCompletedWork(
  primaryRoot: string,
  iterationId: string,
  reason: string,
  now = new Date().toISOString(),
): void {
  const target = requireWorkItemTarget(primaryRoot, iterationId, {
    allowTerminal: true,
  });
  if (target.state.loop !== 'complete' && !target.state.halted) {
    throw new Error(
      `Only a complete or halted Story can be archived: ${iterationId}.`,
    );
  }
  reconcileBoardItem(primaryRoot, iterationId, target.state, now);
  removeStoryWorktree(primaryRoot, target.worktreeRoot);
  mutateBoard(primaryRoot, (draft) => {
    const item = draft.items.find(
      ({ iteration_id }) => iteration_id === iterationId,
    );
    if (!item || item.lifecycle !== 'terminal') {
      throw new Error(`Terminal Board item disappeared: ${iterationId}.`);
    }
    item.lifecycle = 'archived';
    item.archived_at = now;
    item.updated_at = now;
  });
  appendBoardEvent(primaryRoot, {
    type: 'archived',
    iteration_id: iterationId,
    recorded_at: now,
    from_lane: 'done',
    to_lane: 'done',
    outcome: 'archived',
    reason,
  });
}

export function registerFlowCommands(pi: ExtensionAPI): void {
  pi.registerCommand(EVIDENCE_COMMANDS.flow, {
    description:
      'List Story Work Items, explicitly Pull queued work, recover failed provisioning, or archive terminal work',
    handler: async (args, ctx) => {
      try {
        const normalized = args.trim();
        const [action = 'list', ...parts] = normalized.split(/\s+/);
        const rest = parts.join(' ');
        if (action === 'list') {
          if (rest) throw new Error('Usage: /evidence-flow list');
          ctx.ui.notify(flowListMarkdown(ctx.cwd), 'info');
          return;
        }
        if (action === 'pull') {
          const target = requireWorkItemTarget(ctx.cwd, rest, {
            allowPending: true,
          });
          const result = pullPendingLane(
            ctx.cwd,
            target.item.iteration_id,
            target.state,
          );
          ctx.ui.notify(
            `${result.iteration_id} admitted to ${result.admitted_lane}.`,
            'info',
          );
          return;
        }
        if (action === 'recover') {
          const { iterationId, reason } = parseTargetAndReason(rest, 'recover');
          const recovered = recoverWork(ctx.cwd, iterationId, reason);
          ctx.ui.notify(
            recovered === 'lease'
              ? `${iterationId} expired activity lease recovered.`
              : `${iterationId} failed provisioning archived.`,
            'info',
          );
          return;
        }
        if (action === 'archive') {
          const { iterationId, reason } = parseTargetAndReason(rest, 'archive');
          archiveCompletedWork(ctx.cwd, iterationId, reason);
          ctx.ui.notify(`${iterationId} worktree archived.`, 'info');
          return;
        }
        throw new Error(
          'Usage: /evidence-flow list | pull ITER-xxxx | recover ITER-xxxx <reason> | archive ITER-xxxx <reason>',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });
}
