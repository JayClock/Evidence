import type {
  ActivityAgentResult,
  ActivitySessionMode,
  ThinkingLevel,
} from '../../node/activity-agent-process';
import { zeroActivityUsage } from '../../../capabilities/activity-observability/activity-usage';
import {
  finishActivityTrace,
  startActivityTrace,
  type ActivityTraceSessionMode,
  type ActivityTraceSpan,
  type ActivityTraceStatus,
  type TraceableActivity,
} from '../../../capabilities/activity-observability/trace';
import { readState } from '../../../iteration/state-repository';
import type { WorkflowState } from '../../../iteration/state';

export interface ActivityTraceDescriptor {
  state: WorkflowState;
  activity: TraceableActivity;
  task: string;
  agent: string;
  requestedModel: string;
  thinking: ThinkingLevel;
  sessionMode: ActivitySessionMode;
  toolNames: string[];
  parentSpanId?: string;
}

interface ActivityTraceRuntimeOptions<T extends ActivityAgentResult> {
  signal?: AbortSignal;
  now?: () => string;
  partialResult?: () => ActivityAgentResult | undefined;
  resultForTrace?: (value: T) => ActivityAgentResult;
  executionRecordSequences?: () => number[];
  resultingState?: () => WorkflowState;
}

export class ActivityObservabilityGapError extends Error {
  constructor(
    readonly activityError: unknown,
    readonly traceError: unknown,
  ) {
    const activityMessage = errorMessage(activityError);
    const traceMessage = errorMessage(traceError);
    super(
      `Activity failed: ${activityMessage}. Observability gap while finishing trace: ${traceMessage}`,
      { cause: activityError },
    );
    this.name = 'ActivityObservabilityGapError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function embeddedActivityResult(
  error: unknown,
): ActivityAgentResult | undefined {
  if (typeof error !== 'object' || error === null || !('result' in error)) {
    return undefined;
  }
  const result = (error as { result?: unknown }).result;
  if (
    typeof result !== 'object' ||
    result === null ||
    !('agent' in result) ||
    !('exitCode' in result)
  ) {
    return undefined;
  }
  return result as ActivityAgentResult;
}

export function workflowActivityCheckpoint(
  state: WorkflowState,
): string | undefined {
  if (state.loop === 'pair') return state.pair_session?.checkpoint ?? 'pair';
  if (state.loop === 'understand') {
    return state.modeling_stage ?? state.understand_stage ?? 'understand';
  }
  if (state.loop === 'tasking') return state.tasking_stage ?? 'tasking';
  if (state.loop === 'showcase') return state.showcase_stage ?? 'showcase';
  if (state.loop === 'respond') return state.respond_stage ?? 'respond';
  if (state.loop === 'kickoff') {
    return state.kickoff_candidate ? 'candidate_ready' : 'kickoff';
  }
  return state.loop;
}

function traceStoryId(state: WorkflowState): string | undefined {
  return (
    state.pair_session?.story_id ??
    state.active_work_item?.story_id ??
    state.active_clarification_story?.story_id ??
    state.confirmed_scenarios?.[0]?.story_id
  );
}

function startTrace(
  cwd: string,
  descriptor: ActivityTraceDescriptor,
  now: () => string,
): ActivityTraceSpan {
  const pair = descriptor.state.pair_session;
  return startActivityTrace(cwd, {
    iterationId: descriptor.state.iteration_id,
    ...(descriptor.parentSpanId
      ? { parentSpanId: descriptor.parentSpanId }
      : {}),
    activity: descriptor.activity,
    ...(workflowActivityCheckpoint(descriptor.state)
      ? { checkpoint: workflowActivityCheckpoint(descriptor.state) }
      : {}),
    ...(traceStoryId(descriptor.state)
      ? { storyId: traceStoryId(descriptor.state) }
      : {}),
    ...(pair?.task_id ? { taskId: pair.task_id } : {}),
    ...(pair?.test_id ? { testId: pair.test_id } : {}),
    ...(pair?.process_id ? { processId: pair.process_id } : {}),
    ...(pair?.step_id ? { stepId: pair.step_id } : {}),
    agent: descriptor.agent,
    requestedModel: descriptor.requestedModel,
    thinking: descriptor.thinking,
    sessionMode: descriptor.sessionMode as ActivityTraceSessionMode,
    task: descriptor.task,
    toolNames: descriptor.toolNames,
    startedAt: now(),
  });
}

function resultStatus(result: ActivityAgentResult): ActivityTraceStatus {
  if (result.stopReason === 'timeout') return 'timeout';
  if (result.stopReason === 'aborted') return 'aborted';
  if (result.exitCode !== 0 || result.stopReason === 'error') return 'failed';
  return 'completed';
}

function errorStatus(
  error: unknown,
  signal: AbortSignal | undefined,
): ActivityTraceStatus {
  const message = errorMessage(error).toLowerCase();
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (
    signal?.aborted ||
    (error instanceof Error && error.name === 'AbortError') ||
    message.includes('aborted')
  ) {
    return 'aborted';
  }
  return 'failed';
}

function finishFromResult(
  span: ActivityTraceSpan,
  result: ActivityAgentResult,
  state: WorkflowState,
  completedAt: string,
  executionRecordSequences: number[],
): void {
  const status = resultStatus(result);
  finishActivityTrace(span, {
    status,
    actualModel: result.actualModel ?? result.model,
    completedAt,
    exitCode: result.exitCode,
    stopReason:
      result.stopReason ??
      (status === 'completed'
        ? 'stop'
        : status === 'failed'
          ? 'error'
          : status),
    errorMessage:
      result.errorMessage ??
      (status === 'failed' && result.stderr ? result.stderr : undefined),
    output: result.output,
    usage: result.usage ?? zeroActivityUsage(null),
    toolCallCounts: result.toolCallCounts ?? {},
    executionRecordSequences,
    resultingCheckpoint: workflowActivityCheckpoint(state),
  });
}

function finishFromError(
  span: ActivityTraceSpan,
  error: unknown,
  partial: ActivityAgentResult | undefined,
  state: WorkflowState,
  signal: AbortSignal | undefined,
  completedAt: string,
  executionRecordSequences: number[],
): void {
  const status = errorStatus(error, signal);
  finishActivityTrace(span, {
    status,
    actualModel: partial?.actualModel ?? partial?.model,
    completedAt,
    ...(partial ? { exitCode: partial.exitCode } : {}),
    stopReason:
      status === 'aborted' || status === 'timeout'
        ? status
        : (partial?.stopReason ?? 'error'),
    errorMessage: errorMessage(error),
    ...(partial?.output ? { output: partial.output } : {}),
    usage: partial?.usage ?? zeroActivityUsage(null),
    toolCallCounts: partial?.toolCallCounts ?? {},
    executionRecordSequences,
    resultingCheckpoint: workflowActivityCheckpoint(state),
  });
}

/**
 * Run one activity between synchronous started/finished appends. A start-write
 * failure prevents the operation; a finish-write failure never fabricates a
 * completed span and preserves any original activity error as its cause.
 */
export async function withActivityTrace<T extends ActivityAgentResult>(
  cwd: string,
  descriptor: ActivityTraceDescriptor,
  operation: () => Promise<T>,
  options: ActivityTraceRuntimeOptions<T> = {},
): Promise<T> {
  const now = options.now ?? (() => new Date().toISOString());
  const span = startTrace(cwd, descriptor, now);
  let value: T | undefined;
  let activityError: unknown;
  try {
    value = await operation();
  } catch (error) {
    activityError = error;
  }

  try {
    const state = options.resultingState?.() ?? readState(cwd);
    const sequences = options.executionRecordSequences?.() ?? [];
    if (activityError !== undefined) {
      finishFromError(
        span,
        activityError,
        options.partialResult?.() ?? embeddedActivityResult(activityError),
        state,
        options.signal,
        now(),
        sequences,
      );
    } else if (value) {
      finishFromResult(
        span,
        options.resultForTrace?.(value) ?? value,
        state,
        now(),
        sequences,
      );
    } else {
      throw new Error('Activity completed without a result.');
    }
  } catch (traceError) {
    if (activityError !== undefined) {
      throw new ActivityObservabilityGapError(activityError, traceError);
    }
    throw traceError;
  }

  if (activityError !== undefined) throw activityError;
  return value as T;
}
