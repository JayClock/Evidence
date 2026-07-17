import { createHash } from 'node:crypto';
import {
  collectArtifacts,
  collectCodeFiles,
} from '../../iteration/artifact-inventory';
import {
  iterationActivitySummary,
  type IterationActivitySummary,
} from '../../capabilities/activity-observability/summary';
import { iterationRoot } from '../../iteration/artifact-layout';
import { pairNextInstruction } from '../../loops/pair/pair-session';
import { showcaseNextInstruction } from '../../loops/showcase/showcase-session';
import { readPersistedState } from '../../iteration/state-repository';
import type { WorkflowLoop, WorkflowState } from '../../iteration/state';
import { nextStepGuidance } from './next-step';

export const MAX_STATUS_SUMMARY_BYTES = 4 * 1024;
export const MAX_STATUS_PAGE_SIZE = 50;

export type StatusDetailView = 'artifacts' | 'files';
export type StatusToolView = 'summary' | 'artifacts';

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
}

export interface StatusDetailPage {
  view: StatusDetailView;
  iteration_id?: string;
  total: number;
  offset: number;
  limit: number;
  items: string[];
  next_cursor?: string;
}

export type StatusToolDetails =
  | {
      view: 'summary';
      projection: StatusSummaryProjection;
    }
  | {
      view: 'artifacts';
      projection: StatusSummaryProjection;
      page: Omit<StatusDetailPage, 'items'> & { count: number };
    };

interface StatusProjectionInput {
  state?: WorkflowState;
  nextAction: string;
  artifactCounts: Record<string, number>;
  activity?: IterationActivitySummary;
}

interface StatusCursor {
  version: 1;
  view: StatusDetailView;
  scope: string;
  offset: number;
  inventory_sha256: string;
}

interface StatusPageOptions {
  cursor?: string;
  limit?: number;
}

interface StatusToolInput extends StatusPageOptions {
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
  return (
    state.halted?.reason ??
    state.pair_session?.automation_exception?.reason ??
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
    return 'human:/evidence-respond approve|revise <reason>';
  }
  if (state.loop === 'understand' && state.modeling_stage === 'model_review') {
    return 'human:/evidence-model confirm [reason] | revise|scenario-gap|method-gap <reason>';
  }
  if (state.loop === 'tasking' && state.tasking_stage === 'desk_check') {
    return 'human:/evidence-desk-check';
  }
  return nextStepGuidance(cwd, state);
}

export function statusSummaryProjection(cwd: string): StatusSummaryProjection {
  const state = readPersistedState(cwd);
  const artifacts = state
    ? collectArtifacts(cwd, iterationRoot(cwd, state))
    : [];
  return projectStatusSummary({
    state,
    nextAction: statusNextAction(cwd, state),
    artifactCounts: artifactCounts(artifacts),
    ...(state
      ? { activity: iterationActivitySummary(cwd, state.iteration_id) }
      : {}),
  });
}

export function statusMarkdown(cwd: string): string {
  return renderStatusSummary(statusSummaryProjection(cwd));
}

function inventoryHash(
  view: StatusDetailView,
  scope: string,
  items: readonly string[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ view, scope, items }))
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
      (parsed.view !== 'artifacts' && parsed.view !== 'files') ||
      typeof parsed.scope !== 'string' ||
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

function inventory(
  cwd: string,
  view: StatusDetailView,
): {
  iterationId?: string;
  scope: string;
  items: string[];
} {
  if (view === 'files') {
    return {
      scope: 'repository-code:apps,libs',
      items: collectCodeFiles(cwd),
    };
  }
  const state = readPersistedState(cwd);
  if (!state) {
    throw new Error(
      'Artifact status requires an active Evidence Orchestrator iteration.',
    );
  }
  return {
    iterationId: state.iteration_id,
    scope: `iteration:${state.iteration_id}`,
    items: collectArtifacts(cwd, iterationRoot(cwd, state)),
  };
}

export function statusDetailPage(
  cwd: string,
  view: StatusDetailView,
  options: StatusPageOptions = {},
): StatusDetailPage {
  const limit = pageLimit(options.limit);
  const current = inventory(cwd, view);
  const hash = inventoryHash(view, current.scope, current.items);
  let offset = 0;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    if (cursor.view !== view || cursor.scope !== current.scope) {
      throw new Error(
        'Evidence status cursor does not belong to this view or active iteration.',
      );
    }
    if (cursor.inventory_sha256 !== hash) {
      throw new Error(
        'Evidence status inventory changed after this cursor was issued; restart from the first page.',
      );
    }
    if (cursor.offset >= current.items.length) {
      throw new Error('Evidence status cursor is beyond the inventory.');
    }
    offset = cursor.offset;
  }

  const items = current.items.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    view,
    ...(current.iterationId ? { iteration_id: current.iterationId } : {}),
    total: current.items.length,
    offset,
    limit,
    items,
    ...(nextOffset < current.items.length
      ? {
          next_cursor: encodeCursor({
            version: 1,
            view,
            scope: current.scope,
            offset: nextOffset,
            inventory_sha256: hash,
          }),
        }
      : {}),
  };
}

export function renderStatusDetailPage(page: StatusDetailPage): string {
  const title = page.view === 'artifacts' ? 'Artifacts' : 'Code Files';
  const start = page.items.length ? page.offset + 1 : 0;
  const end = page.offset + page.items.length;
  return [
    `# Evidence Orchestrator ${title}`,
    '',
    ...(page.iteration_id ? [`- Iteration: ${page.iteration_id}`] : []),
    `- Showing: ${start}-${end} of ${page.total}`,
    '',
    ...(page.items.length ? page.items.map((item) => `- ${item}`) : ['- none']),
    ...(page.next_cursor
      ? [
          '',
          `- Next cursor: ${page.next_cursor}`,
          `- Continue: /evidence-status ${page.view} ${page.next_cursor}`,
        ]
      : []),
  ].join('\n');
}

export function statusCommandMarkdown(cwd: string, args = ''): string {
  const parts = args.trim() ? args.trim().split(/\s+/) : [];
  if (parts.length === 0) return statusMarkdown(cwd);
  const [view, cursor, ...extra] = parts;
  if ((view !== 'artifacts' && view !== 'files') || extra.length > 0) {
    throw new Error('Usage: /evidence-status [artifacts|files [cursor]].');
  }
  return renderStatusDetailPage(
    statusDetailPage(cwd, view, { ...(cursor ? { cursor } : {}) }),
  );
}

export function statusToolResult(
  cwd: string,
  input: StatusToolInput = {},
): { content: string; details: StatusToolDetails } {
  const view = input.view ?? 'summary';
  const projection = statusSummaryProjection(cwd);
  if (view === 'summary') {
    if (input.cursor || input.limit !== undefined) {
      throw new Error('Status summary does not accept cursor or limit.');
    }
    return {
      content: renderStatusSummary(projection),
      details: { view, projection },
    };
  }
  const page = statusDetailPage(cwd, 'artifacts', input);
  return {
    content: renderStatusDetailPage(page),
    details: {
      view,
      projection,
      page: {
        view: page.view,
        ...(page.iteration_id ? { iteration_id: page.iteration_id } : {}),
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        count: page.items.length,
        ...(page.next_cursor ? { next_cursor: page.next_cursor } : {}),
      },
    },
  };
}
