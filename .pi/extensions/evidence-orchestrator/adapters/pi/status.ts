import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { collectArtifacts } from '../../iteration/artifact-inventory';
import {
  iterationActivitySummary,
  type IterationActivitySummary,
} from '../../capabilities/activity-observability/summary';
import {
  evaluateExecutionBudget,
  executionBudgetUsageFromTrace,
} from '../../capabilities/execution-budget/evaluator';
import {
  assertPairExecutionBudgetLocked,
  executionBudgetEnvelopeMode,
} from '../../capabilities/execution-budget/policy';
import { projectFlow } from '../../capabilities/flow-control/projection';
import { readFlowPolicy } from '../../capabilities/flow-control/policy';
import { currentBranch } from '../../capabilities/work-item-worktree/manager';
import { iterationRoot } from '../../iteration/artifact-layout';
import { readBoard } from '../../iteration/board-repository';
import { primaryWorktreeRoot } from '../../iteration/git-common-dir';
import type { BoardItem, FlowLane } from '../../iteration/board-state';
import { pairNextInstruction } from '../../loops/pair/pair-session';
import { showcaseNextInstruction } from '../../loops/showcase/showcase-session';
import { readPersistedState } from '../../iteration/state-repository';
import type { WorkflowLoop, WorkflowState } from '../../iteration/state';
import { nextStepGuidance } from './next-step';
import { requireWorkItemTarget } from './work-item-target';

export const MAX_STATUS_SUMMARY_BYTES = 4 * 1024;
export const MAX_STATUS_PAGE_SIZE = 50;

export type StatusDetailView = 'artifacts';
export type StatusToolView = 'summary' | 'artifacts';

export interface StatusBudgetSummary {
  mode: 'shadow' | 'enforced';
  level: 'ok' | 'soft' | 'hard' | 'observability_gap';
  expected_pair_agent_calls: number;
  pair_agent_calls: number;
  max_pair_agent_calls: number | null;
  pair_checkpoints: number;
  emergency_max_checkpoints: number;
  no_progress_checkpoints: number;
  max_no_progress_checkpoints: number | null;
  duration_ms: number;
  max_duration_ms: number | null;
  input_tokens: number;
  max_input_tokens: number | null;
  output_tokens: number;
  max_output_tokens: number | null;
  reported_cost_usd: number | null;
  max_reported_cost_usd: number | null;
  cost_status: 'reported' | 'unknown';
}

export interface StatusSummaryProjection {
  iteration_id?: string;
  loop: WorkflowLoop | 'idle';
  story_id?: string;
  stage?: string;
  checkpoint?: string;
  current_unit?: string;
  pending_question?: { id: string; question: string };
  blocker?: string;
  next_action: string;
  artifact_counts: Record<string, number>;
  activity_summary?: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    reported_cost_usd: number;
    unreported_cost_activities: number;
    elapsed_ms: number;
  };
  budget_summary?: StatusBudgetSummary;
}

export interface StatusDetailPage {
  view: StatusDetailView;
  iteration_id: string;
  total: number;
  offset: number;
  limit: number;
  items: string[];
  next_cursor?: string;
}

export interface BoardStatusItemProjection {
  iteration_id: string;
  lane: FlowLane;
  condition: string;
  reference: string;
  lifecycle: BoardItem['lifecycle'];
  pending_lane?: FlowLane;
  blocker?: string;
}

export interface BoardStatusProjection {
  board_revision: number;
  active: number;
  max_active: number;
  lane_counts: Record<FlowLane, number>;
  lane_limits: Partial<Record<FlowLane, number>>;
  items: BoardStatusItemProjection[];
  hidden_items: number;
  policy_error?: string;
}

export type StatusToolDetails =
  | {
      view: 'summary';
      scope: 'board';
      projection: BoardStatusProjection;
    }
  | {
      view: 'summary';
      scope: 'story';
      projection: StatusSummaryProjection;
    }
  | {
      view: 'artifacts';
      scope: 'story';
      projection: StatusSummaryProjection;
      page: Omit<StatusDetailPage, 'items'> & { count: number };
    };

interface StatusProjectionInput {
  state?: WorkflowState;
  nextAction: string;
  artifactCounts: Record<string, number>;
  activity?: IterationActivitySummary;
  budget?: StatusBudgetSummary;
}

interface StatusCursor {
  version: 1;
  view: StatusDetailView;
  board_revision: number;
  iteration_id: string;
  offset: number;
  inventory_sha256: string;
}

interface StatusPageOptions {
  cursor?: string;
  limit?: number;
}

interface StatusToolInput extends StatusPageOptions {
  iterationId?: string;
  view?: StatusToolView;
}

function storyId(state: WorkflowState): string | undefined {
  return (
    state.active_work_item?.story_id ??
    state.active_clarification_story?.story_id ??
    state.confirmed_scenarios?.[0]?.story_id ??
    state.completed_work_items?.at(-1)?.story_id
  );
}

function stage(state: WorkflowState): string | undefined {
  if (state.loop === 'kickoff') {
    return state.kickoff_candidate ? 'candidate_review' : 'candidate_drafting';
  }
  if (state.loop === 'understand') {
    return state.modeling_stage ?? state.understand_stage;
  }
  if (state.loop === 'tasking') return state.tasking_stage;
  if (state.loop === 'pair') return state.pair_session?.checkpoint;
  if (state.loop === 'showcase') return state.showcase_stage;
  if (state.loop === 'respond') return state.respond_stage;
  return state.loop === 'complete' ? 'complete' : undefined;
}

function currentUnit(state: WorkflowState): string | undefined {
  const pair = state.pair_session;
  if (pair) {
    return `${pair.task_id}/${pair.test_id} · ${pair.process_id}/${pair.step_id}`;
  }
  const scenarios = state.confirmed_scenarios ?? [];
  if (scenarios.length > 0) {
    return `${scenarios[0].story_id}/[${scenarios
      .map(({ scenario_id }) => scenario_id)
      .join(',')}]`;
  }
  return storyId(state);
}

function blocker(state: WorkflowState): string | undefined {
  const exception = state.pair_session?.automation_exception;
  return (
    state.halted?.reason ??
    (exception ? `${exception.kind}: ${exception.reason}` : undefined) ??
    state.tasking_gap?.reason ??
    (state.pending_clarification
      ? `awaiting domain expert answer to ${state.pending_clarification.question_id}`
      : undefined)
  );
}

/** Project already-resolved facts without reading the repository or formatting UI. */
export function projectStatusSummary({
  state,
  nextAction,
  artifactCounts,
  activity,
  budget,
}: StatusProjectionInput): StatusSummaryProjection {
  if (!state) {
    return {
      loop: 'idle',
      next_action: nextAction,
      artifact_counts: { ...artifactCounts },
    };
  }

  const projection: StatusSummaryProjection = {
    iteration_id: state.iteration_id,
    loop: state.loop,
    ...(storyId(state) ? { story_id: storyId(state) } : {}),
    ...(stage(state) ? { stage: stage(state) } : {}),
    ...(state.pair_session?.checkpoint
      ? { checkpoint: state.pair_session.checkpoint }
      : {}),
    ...(currentUnit(state) ? { current_unit: currentUnit(state) } : {}),
    ...(state.pending_clarification
      ? {
          pending_question: {
            id: state.pending_clarification.question_id,
            question: state.pending_clarification.question,
          },
        }
      : {}),
    ...(blocker(state) ? { blocker: blocker(state) } : {}),
    next_action: nextAction,
    artifact_counts: { ...artifactCounts },
  };

  if (activity && activity.activities_started > 0) {
    projection.activity_summary = {
      calls: activity.activities_finished,
      input_tokens: activity.input_tokens,
      output_tokens: activity.output_tokens,
      reported_cost_usd: activity.reported_cost_usd,
      unreported_cost_activities: activity.unreported_cost_activities,
      elapsed_ms: activity.duration_ms,
    };
  }
  if (budget) projection.budget_summary = budget;
  return projection;
}

function artifactCounts(paths: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = { total: paths.length };
  for (const path of paths) {
    const match = path.match(/^artifacts\/iterations\/[^/]+\/([^/]+)/);
    const group = match?.[1] ?? 'other';
    counts[group] = (counts[group] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => {
      if (left === 'total') return -1;
      if (right === 'total') return 1;
      return left.localeCompare(right);
    }),
  );
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function assertSummaryBounded(
  projection: StatusSummaryProjection,
  markdown: string,
): void {
  const projectionBytes = utf8Bytes(JSON.stringify(projection));
  const markdownBytes = utf8Bytes(markdown);
  if (
    projectionBytes > MAX_STATUS_SUMMARY_BYTES ||
    markdownBytes > MAX_STATUS_SUMMARY_BYTES
  ) {
    throw new Error(
      `Evidence status summary exceeds ${MAX_STATUS_SUMMARY_BYTES} UTF-8 bytes; split the current decision or reference a disk artifact.`,
    );
  }
}

function compactNumber(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h${minutes}m${seconds}s`;
  if (minutes) return `${minutes}m${seconds}s`;
  return `${(elapsedMs / 1_000).toFixed(1)}s`;
}

function activityLine(
  summary: NonNullable<StatusSummaryProjection['activity_summary']>,
): string {
  const reportedCalls = summary.calls - summary.unreported_cost_activities;
  const cost = reportedCalls
    ? `$${summary.reported_cost_usd.toFixed(4)} reported`
    : 'cost:n/a';
  const unreported = summary.unreported_cost_activities
    ? ` · cost:n/a=${summary.unreported_cost_activities}`
    : '';
  return `${summary.calls} calls · ↑${compactNumber(summary.input_tokens)} · ↓${compactNumber(summary.output_tokens)} · ${cost}${unreported} · ${formatDuration(summary.elapsed_ms)}`;
}

function budgetLine(summary: StatusBudgetSummary): string {
  const limit = (value: number | null, format = compactNumber) =>
    value === null ? 'shadow' : format(value);
  const costLimit =
    summary.max_reported_cost_usd === null
      ? 'shadow'
      : `$${summary.max_reported_cost_usd.toFixed(2)}`;
  const cost =
    summary.cost_status === 'unknown'
      ? 'cost=unknown'
      : `cost=$${(summary.reported_cost_usd ?? 0).toFixed(4)}/${costLimit}`;
  return `${summary.mode}/${summary.level} · agents=${summary.pair_agent_calls}/${limit(summary.max_pair_agent_calls)} (expected ${summary.expected_pair_agent_calls}) · checkpoints=${summary.pair_checkpoints}/${summary.emergency_max_checkpoints} · no-progress=${summary.no_progress_checkpoints}/${limit(summary.max_no_progress_checkpoints)} · duration=${formatDuration(summary.duration_ms)}/${limit(summary.max_duration_ms, formatDuration)} · tokens=↑${compactNumber(summary.input_tokens)}/${limit(summary.max_input_tokens)} ↓${compactNumber(summary.output_tokens)}/${limit(summary.max_output_tokens)} · ${cost}`;
}

function countsLine(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([name, count]) => `${name}=${count}`)
    .join(' · ');
}

export function renderStatusSummary(
  projection: StatusSummaryProjection,
): string {
  const lines = [
    '# Evidence Orchestrator',
    '',
    `- Iteration: ${projection.iteration_id ?? 'none'}`,
    `- Story: ${projection.story_id ?? 'none'}`,
    `- Loop: ${projection.loop}`,
    `- Stage: ${projection.stage ?? 'none'}`,
    `- Checkpoint: ${projection.checkpoint ?? 'none'}`,
    `- Current unit: ${projection.current_unit ?? 'none'}`,
  ];
  if (projection.pending_question) {
    lines.push(
      `- Pending question: ${projection.pending_question.id} · ${projection.pending_question.question}`,
    );
  }
  lines.push(
    `- Blocker: ${projection.blocker ?? 'none'}`,
    `- Artifacts: ${countsLine(projection.artifact_counts)}`,
  );
  if (projection.activity_summary) {
    lines.push(`- Activity: ${activityLine(projection.activity_summary)}`);
  }
  if (projection.budget_summary) {
    lines.push(`- Budget: ${budgetLine(projection.budget_summary)}`);
  }
  lines.push(`- Next: ${projection.next_action}`);
  const markdown = lines.join('\n');
  assertSummaryBounded(projection, markdown);
  return markdown;
}

function statusNextAction(
  cwd: string,
  state: WorkflowState | undefined,
): string {
  if (!state || state.halted || state.pending_clarification) {
    return nextStepGuidance(cwd, state);
  }
  if (state.loop === 'pair') return pairNextInstruction(state);
  if (state.loop === 'showcase') return showcaseNextInstruction(cwd);
  if (state.loop === 'respond' && state.respond_stage === 'decision') {
    return `human:/evidence-respond ${state.iteration_id} approve|revise <reason>`;
  }
  if (state.loop === 'understand' && state.modeling_stage === 'model_review') {
    return `human:/evidence-model ${state.iteration_id} confirm [reason] | revise|scenario-gap|method-gap <reason>`;
  }
  if (state.loop === 'tasking' && state.tasking_stage === 'desk_check') {
    return `human:/evidence-desk-check ${state.iteration_id}`;
  }
  return nextStepGuidance(cwd, state);
}

function statusBudgetSummary(
  cwd: string,
  state: WorkflowState,
): StatusBudgetSummary | undefined {
  const session = state.pair_session;
  if (!session) return undefined;
  let usage;
  let level: StatusBudgetSummary['level'];
  try {
    assertPairExecutionBudgetLocked(cwd, state);
    usage = executionBudgetUsageFromTrace(cwd, state);
    level = evaluateExecutionBudget(session.execution_budget, usage).level;
  } catch {
    usage = session.automation_exception?.current_usage ?? {
      duration_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      reported_cost_usd: null,
      cost_status: 'unknown' as const,
      pair_agent_calls: 0,
      pair_checkpoints: 0,
    };
    level = 'observability_gap';
  }
  const envelope = session.execution_budget;
  return {
    mode: executionBudgetEnvelopeMode(envelope),
    level,
    expected_pair_agent_calls: envelope.expected_pair_agent_calls,
    pair_agent_calls: usage.pair_agent_calls,
    max_pair_agent_calls: envelope.max_pair_agent_calls,
    pair_checkpoints: usage.pair_checkpoints,
    emergency_max_checkpoints: envelope.emergency_max_checkpoints,
    no_progress_checkpoints:
      session.pair_progress?.no_progress_checkpoints ?? 0,
    max_no_progress_checkpoints: envelope.max_no_progress_checkpoints,
    duration_ms: usage.duration_ms,
    max_duration_ms: envelope.max_duration_ms,
    input_tokens: usage.input_tokens,
    max_input_tokens: envelope.max_input_tokens,
    output_tokens: usage.output_tokens,
    max_output_tokens: envelope.max_output_tokens,
    reported_cost_usd: usage.reported_cost_usd,
    max_reported_cost_usd: envelope.max_reported_cost_usd,
    cost_status: usage.cost_status,
  };
}

export function storyStatusSummaryProjection(
  worktreeRoot: string,
): StatusSummaryProjection {
  const state = readPersistedState(worktreeRoot);
  if (!state) {
    throw new Error(`Story State is missing: ${worktreeRoot}.`);
  }
  const artifacts = collectArtifacts(
    worktreeRoot,
    iterationRoot(worktreeRoot, state),
  );
  const budget = statusBudgetSummary(worktreeRoot, state);
  return projectStatusSummary({
    state,
    nextAction: statusNextAction(worktreeRoot, state),
    artifactCounts: artifactCounts(artifacts),
    activity: iterationActivitySummary(worktreeRoot, state.iteration_id),
    ...(budget ? { budget } : {}),
  });
}

export function storyStatusMarkdown(worktreeRoot: string): string {
  return renderStatusSummary(storyStatusSummaryProjection(worktreeRoot));
}

const BOARD_STATUS_ITEM_LIMIT = 12;
const FLOW_LANES: FlowLane[] = [
  'discovery',
  'planning',
  'ready',
  'delivery',
  'review',
  'done',
];

function boundedText(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

function boardStoryReference(state: WorkflowState): string {
  const story = storyId(state) ?? 'unconfirmed';
  if (state.pending_clarification) {
    return `${story}/${state.pending_clarification.question_id}`;
  }
  if (
    state.loop === 'pair' &&
    state.pair_session?.checkpoint === 'quality_gates_passed'
  ) {
    return `${story}/coding-approval`;
  }
  return story;
}

function unavailableBoardItem(
  item: BoardItem,
  blockerText: string,
): BoardStatusItemProjection {
  return {
    iteration_id: item.iteration_id,
    lane: item.admitted_lane,
    condition:
      item.lifecycle === 'terminal' || item.lifecycle === 'archived'
        ? 'terminal'
        : 'blocked',
    reference: item.candidate_id,
    lifecycle: item.lifecycle,
    ...(item.pending_lane ? { pending_lane: item.pending_lane } : {}),
    blocker: boundedText(blockerText),
  };
}

function projectBoardItem(item: BoardItem): BoardStatusItemProjection {
  if (item.lifecycle === 'provisioning') {
    return {
      iteration_id: item.iteration_id,
      lane: item.admitted_lane,
      condition: 'provisioning',
      reference: item.candidate_id,
      lifecycle: item.lifecycle,
    };
  }
  if (item.lifecycle === 'provisioning_failed') {
    return unavailableBoardItem(item, 'Story worktree provisioning failed.');
  }
  if (!existsSync(item.worktree_path)) {
    return unavailableBoardItem(item, 'Story worktree is missing.');
  }
  let canonical: string;
  try {
    canonical = realpathSync(item.worktree_path);
  } catch {
    return unavailableBoardItem(item, 'Story worktree cannot be resolved.');
  }
  if (canonical !== item.worktree_path) {
    return unavailableBoardItem(item, 'Story worktree path drifted.');
  }
  try {
    const branch = currentBranch(canonical);
    if (branch !== item.branch_name) {
      return unavailableBoardItem(
        item,
        `Story branch drifted: expected ${item.branch_name}, found ${branch || 'detached HEAD'}.`,
      );
    }
    const state = readPersistedState(canonical);
    if (!state) return unavailableBoardItem(item, 'Story State is missing.');
    if (state.iteration_id !== item.iteration_id) {
      return unavailableBoardItem(
        item,
        'Board/State Iteration identity drifted.',
      );
    }
    const flow = projectFlow(state, item);
    return {
      iteration_id: item.iteration_id,
      lane: item.admitted_lane,
      condition: flow.condition,
      reference: boardStoryReference(state),
      lifecycle: item.lifecycle,
      ...(item.pending_lane ? { pending_lane: item.pending_lane } : {}),
      ...(flow.blocker ? { blocker: boundedText(flow.blocker) } : {}),
    };
  } catch (error) {
    return unavailableBoardItem(
      item,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function emptyLaneCounts(): Record<FlowLane, number> {
  return {
    discovery: 0,
    planning: 0,
    ready: 0,
    delivery: 0,
    review: 0,
    done: 0,
  };
}

export function boardStatusProjection(cwd: string): BoardStatusProjection {
  const primaryRoot = primaryWorktreeRoot(cwd);
  const board = readBoard(primaryRoot);
  const activeItems = board.items.filter(({ lifecycle }) =>
    ['provisioning', 'active'].includes(lifecycle),
  );
  const laneCounts = emptyLaneCounts();
  for (const item of activeItems) laneCounts[item.admitted_lane] += 1;

  let maxActive = 0;
  let laneLimits: Partial<Record<FlowLane, number>> = {};
  let policyError: string | undefined;
  try {
    const policy = readFlowPolicy(primaryRoot).policy;
    maxActive = policy.max_active_stories;
    laneLimits = { ...policy.lanes };
  } catch (error) {
    policyError = boundedText(
      error instanceof Error ? error.message : String(error),
    );
  }

  const visible = board.items.filter(
    ({ lifecycle }) => lifecycle !== 'archived',
  );
  const selected = visible.slice(-BOARD_STATUS_ITEM_LIMIT);
  return {
    board_revision: board.revision,
    active: activeItems.length,
    max_active: maxActive,
    lane_counts: laneCounts,
    lane_limits: laneLimits,
    items: selected.map(projectBoardItem),
    hidden_items: visible.length - selected.length,
    ...(policyError ? { policy_error: policyError } : {}),
  };
}

function boardWipLine(projection: BoardStatusProjection): string {
  return FLOW_LANES.filter((lane) => lane !== 'done')
    .map((lane) => {
      const limit = projection.lane_limits[lane];
      return `${lane}=${projection.lane_counts[lane]}/${limit ?? '?'}`;
    })
    .join(' · ');
}

export function renderBoardStatus(projection: BoardStatusProjection): string {
  const lines = [
    '# Evidence Story Board',
    '',
    `- Board revision: ${projection.board_revision}`,
    `- Active: ${projection.active}/${projection.max_active || '?'}`,
    `- WIP: ${boardWipLine(projection)}`,
  ];
  if (projection.policy_error) {
    lines.push(`- Policy blocker: ${projection.policy_error}`);
  }
  lines.push('');
  for (const item of projection.items) {
    lines.push(
      `- ${item.iteration_id} · ${item.lane} · ${item.pending_lane ? `queued:${item.pending_lane}` : item.condition} · ${item.reference}${item.blocker ? ` · blocker:${item.blocker}` : ''}`,
    );
  }
  if (projection.items.length === 0)
    lines.push('- No active Story Work Items.');
  if (projection.hidden_items > 0) {
    lines.push(
      `- … ${projection.hidden_items} older non-archived item(s) hidden.`,
    );
  }
  const markdown = lines.join('\n');
  if (
    utf8Bytes(markdown) > MAX_STATUS_SUMMARY_BYTES ||
    utf8Bytes(JSON.stringify(projection)) > MAX_STATUS_SUMMARY_BYTES
  ) {
    throw new Error(
      `Evidence Board status exceeds ${MAX_STATUS_SUMMARY_BYTES} UTF-8 bytes.`,
    );
  }
  return markdown;
}

export function statusMarkdown(cwd: string): string {
  return renderBoardStatus(boardStatusProjection(cwd));
}

function inventoryHash(
  boardRevision: number,
  iterationId: string,
  items: readonly string[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ boardRevision, iterationId, items }))
    .digest('hex');
}

function encodeCursor(cursor: StatusCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): StatusCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<StatusCursor>;
    if (
      parsed.version !== 1 ||
      parsed.view !== 'artifacts' ||
      !Number.isSafeInteger(parsed.board_revision) ||
      (parsed.board_revision ?? -1) < 0 ||
      typeof parsed.iteration_id !== 'string' ||
      !/^ITER-\d{4,}$/.test(parsed.iteration_id) ||
      !Number.isSafeInteger(parsed.offset) ||
      (parsed.offset ?? 0) <= 0 ||
      typeof parsed.inventory_sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(parsed.inventory_sha256)
    ) {
      throw new Error('shape');
    }
    return parsed as StatusCursor;
  } catch {
    throw new Error('Invalid Evidence status cursor.');
  }
}

function pageLimit(value: number | undefined): number {
  const limit = value ?? MAX_STATUS_PAGE_SIZE;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_STATUS_PAGE_SIZE
  ) {
    throw new Error(
      `Evidence status page limit must be an integer from 1 to ${MAX_STATUS_PAGE_SIZE}.`,
    );
  }
  return limit;
}

function statusTarget(cwd: string, iterationId: string) {
  const target = requireWorkItemTarget(cwd, iterationId, {
    allowPending: true,
    allowTerminal: true,
  });
  const branch = currentBranch(target.worktreeRoot);
  if (branch !== target.item.branch_name) {
    throw new Error(
      `Story branch drifted for ${target.item.iteration_id}: expected ${target.item.branch_name}, found ${branch || 'detached HEAD'}.`,
    );
  }
  return target;
}

export function statusDetailPage(
  cwd: string,
  iterationId: string,
  options: StatusPageOptions = {},
): StatusDetailPage {
  const limit = pageLimit(options.limit);
  const board = readBoard(cwd);
  const target = statusTarget(cwd, iterationId);
  const items = collectArtifacts(
    target.worktreeRoot,
    iterationRoot(target.worktreeRoot, target.state),
  );
  const hash = inventoryHash(board.revision, target.item.iteration_id, items);
  let offset = 0;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    if (cursor.iteration_id !== target.item.iteration_id) {
      throw new Error('Evidence status cursor belongs to another Iteration.');
    }
    if (cursor.board_revision !== board.revision) {
      throw new Error(
        'Evidence Board changed after this cursor was issued; restart from the first page.',
      );
    }
    if (cursor.inventory_sha256 !== hash) {
      throw new Error(
        'Evidence status inventory changed after this cursor was issued; restart from the first page.',
      );
    }
    if (cursor.offset >= items.length) {
      throw new Error('Evidence status cursor is beyond the inventory.');
    }
    offset = cursor.offset;
  }

  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    view: 'artifacts',
    iteration_id: target.item.iteration_id,
    total: items.length,
    offset,
    limit,
    items: pageItems,
    ...(nextOffset < items.length
      ? {
          next_cursor: encodeCursor({
            version: 1,
            view: 'artifacts',
            board_revision: board.revision,
            iteration_id: target.item.iteration_id,
            offset: nextOffset,
            inventory_sha256: hash,
          }),
        }
      : {}),
  };
}

export function renderStatusDetailPage(page: StatusDetailPage): string {
  const start = page.items.length ? page.offset + 1 : 0;
  const end = page.offset + page.items.length;
  return [
    '# Evidence Orchestrator Artifacts',
    '',
    `- Iteration: ${page.iteration_id}`,
    `- Showing: ${start}-${end} of ${page.total}`,
    '',
    ...(page.items.length ? page.items.map((item) => `- ${item}`) : ['- none']),
    ...(page.next_cursor
      ? [
          '',
          `- Next cursor: ${page.next_cursor}`,
          `- Continue: /evidence-status ${page.iteration_id} artifacts ${page.next_cursor}`,
        ]
      : []),
  ].join('\n');
}

export function statusCommandMarkdown(cwd: string, args = ''): string {
  const parts = args.trim() ? args.trim().split(/\s+/) : [];
  if (parts.length === 0) return statusMarkdown(cwd);
  const [rawIterationId, view, cursor, ...extra] = parts;
  const iterationId = rawIterationId.toUpperCase();
  if (!/^ITER-\d{4,}$/.test(iterationId) || extra.length > 0) {
    throw new Error(
      'Usage: /evidence-status [ITER-xxxx [artifacts [cursor]]].',
    );
  }
  const target = statusTarget(cwd, iterationId);
  if (!view) return storyStatusMarkdown(target.worktreeRoot);
  if (view !== 'artifacts') {
    throw new Error(
      'Usage: /evidence-status [ITER-xxxx [artifacts [cursor]]].',
    );
  }
  return renderStatusDetailPage(
    statusDetailPage(cwd, iterationId, { ...(cursor ? { cursor } : {}) }),
  );
}

export function statusToolResult(
  cwd: string,
  input: StatusToolInput = {},
): { content: string; details: StatusToolDetails } {
  const view = input.view ?? 'summary';
  if (view === 'summary') {
    if (input.cursor || input.limit !== undefined) {
      throw new Error('Status summary does not accept cursor or limit.');
    }
    if (!input.iterationId) {
      const projection = boardStatusProjection(cwd);
      return {
        content: renderBoardStatus(projection),
        details: { view, scope: 'board', projection },
      };
    }
    const target = statusTarget(cwd, input.iterationId);
    const projection = storyStatusSummaryProjection(target.worktreeRoot);
    return {
      content: renderStatusSummary(projection),
      details: { view, scope: 'story', projection },
    };
  }
  if (!input.iterationId) {
    throw new Error('Artifact status requires an exact iterationId.');
  }
  const target = statusTarget(cwd, input.iterationId);
  const projection = storyStatusSummaryProjection(target.worktreeRoot);
  const page = statusDetailPage(cwd, target.item.iteration_id, input);
  return {
    content: renderStatusDetailPage(page),
    details: {
      view,
      scope: 'story',
      projection,
      page: {
        view: page.view,
        iteration_id: page.iteration_id,
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        count: page.items.length,
        ...(page.next_cursor ? { next_cursor: page.next_cursor } : {}),
      },
    },
  };
}
