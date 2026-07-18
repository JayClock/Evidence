import type {
  ActivityAgentProgress,
  ActivityAgentResult,
} from '../../node/activity-agent-process';
import {
  ActivityAgentAbortedError,
  loadActivityAgent,
  runActivityAgent,
} from '../../node/activity-agent-process';
import {
  acquireActivityLease,
  releaseActivityLease,
  type ActivityLeaseHandle,
} from '../../../capabilities/flow-control/lease';
import { boardRoot } from '../../../iteration/board-repository';
import {
  addActivityUsage,
  type ActivityUsage,
  zeroActivityUsage,
} from '../../../capabilities/activity-observability/activity-usage';
import {
  ExecutionBudgetObservabilityGapError,
  evaluateExecutionBudget,
  executionBudgetUsageFromTrace,
  type ExecutionBudgetTrigger,
} from '../../../capabilities/execution-budget/evaluator';
import {
  assertPairExecutionBudgetLocked,
  readExecutionBudgetPolicy,
} from '../../../capabilities/execution-budget/policy';
import { completeNoModelImpact } from '../../../capabilities/modeling-evidence/no-model-impact';
import {
  capturePairWorktree,
  completePairDriver,
  executePairAction,
  failPairDriver,
  navigatePair,
  pairDeterministicAction,
  pairDriverMode,
  pairDriverWriteRoots,
  parsePairRedReview,
  recordPairAutomationException,
  recordPairCheckpointProgress,
  recordPairCommandFailure,
  recordPairDriverFailure,
  reviewPairRed,
} from '../../../loops/pair/pair-session';
import {
  captureShowcaseReviewer,
  completeShowcaseReviewer,
  executeShowcaseQ2,
} from '../../../loops/showcase/showcase-session';
import { readState, writeState } from '../../../iteration/state-repository';
import { createActivityToolPolicy } from '../../../capabilities/worktree-protection/activity-tool-policy';
import type {
  ExecutionBudgetUsage,
  PairAutomationExceptionKind,
  PairDriverMode,
  WorkflowLoop,
  WorkflowState,
} from '../../../iteration/state';
import { STATUS_KEY, statusLabel } from '../identity';
import { nextStepGuidance } from '../next-step';
import type { PreparedActivityRun } from './dispatch';
import { buildActivityTask } from './task';
import {
  ActivityObservabilityGapError,
  type ActivityTraceDescriptor,
  withActivityTrace,
} from './trace';

export interface ActivityExecutionDetails extends ActivityAgentResult {
  activity: Exclude<WorkflowLoop, 'complete'>;
  task: string;
  status: 'running' | 'completed' | 'failed';
  traceSpanId?: string;
  driverFailure?: {
    mode: PairDriverMode;
    changedPaths: string[];
    blockedReason: string;
  };
}

interface ActivityExecutionContext {
  cwd: string;
  ui: {
    setStatus(key: string, value: string | undefined): void;
  };
}

interface ExecutePreparedActivityRunOptions {
  invocation: string;
  /** Transfers this already-acquired lease to the execution wrapper. */
  leaseHandle?: ActivityLeaseHandle;
  /** Internal child-process binding populated by the execution wrapper. */
  activityLeaseId?: string;
  signal?: AbortSignal;
  onUpdate?: (details: ActivityExecutionDetails) => void;
  now?: () => string;
  parentSpanId?: string;
  onAgentProgress?: (progress: ActivityAgentProgress, spanId: string) => void;
}

function tqaSessionId(preparation: PreparedActivityRun): string | undefined {
  if (
    preparation.activity !== 'understand' ||
    preparation.state.understand_stage !== 'tqa'
  ) {
    return undefined;
  }
  const storyId = preparation.state.active_clarification_story?.story_id;
  if (!storyId) return undefined;
  return `evidence-${preparation.state.iteration_id}-${storyId}-tqa`.toLowerCase();
}

function traceDescriptor(
  cwd: string,
  preparation: PreparedActivityRun,
  state: WorkflowState,
  parentSpanId?: string,
): ActivityTraceDescriptor {
  const deterministicAgent = preparation.pairAction
    ? 'pair-controller'
    : preparation.showcaseAction
      ? 'showcase-controller'
      : preparation.modelingAction
        ? 'modeling-controller'
        : undefined;
  if (deterministicAgent) {
    return {
      state,
      activity: preparation.activity,
      task: preparation.task,
      agent: deterministicAgent,
      requestedModel: 'deterministic',
      thinking: 'off',
      sessionMode: 'deterministic',
      toolNames: [],
      ...(parentSpanId ? { parentSpanId } : {}),
    };
  }
  if (!preparation.agentName) {
    throw new Error(
      `Activity ${preparation.activity} has no activity agent or deterministic action.`,
    );
  }
  const agent = loadActivityAgent(cwd, preparation.agentName);
  return {
    state,
    activity: preparation.activity,
    task: preparation.task,
    agent: agent.name,
    requestedModel: agent.model,
    thinking: agent.thinking,
    sessionMode: tqaSessionId(preparation) ? 'persistent' : 'ephemeral',
    toolNames: [...(agent.tools ?? [])],
    ...(parentSpanId ? { parentSpanId } : {}),
  };
}

function activityPolicy(cwd: string, agentName: string, state: WorkflowState) {
  const mode = pairDriverMode(state);
  if (agentName === 'test-driver' && mode !== 'test') {
    throw new Error('Test Driver requires an active test checkpoint.');
  }
  if (
    agentName === 'production-driver' &&
    mode !== 'implementation' &&
    mode !== 'refactor'
  ) {
    throw new Error(
      'Production Driver requires an active Green or Refactor checkpoint.',
    );
  }
  const driverMode =
    agentName === 'test-driver' || agentName === 'production-driver'
      ? mode
      : undefined;
  const timeoutMs =
    state.pair_session?.execution_budget.activity_timeout_ms ??
    readExecutionBudgetPolicy(cwd).policy.activity.timeout_ms;
  return createActivityToolPolicy({
    cwd,
    role: agentName,
    timeoutMs,
    ...(driverMode
      ? {
          writeMode:
            driverMode === 'test'
              ? 'test'
              : driverMode === 'refactor'
                ? 'refactor'
                : 'production',
          writeRoots: pairDriverWriteRoots(cwd, state, driverMode),
        }
      : {}),
  });
}

function progressDetails(
  preparation: PreparedActivityRun,
  progress: ActivityAgentProgress,
): ActivityExecutionDetails {
  return {
    ...progress,
    activity: preparation.activity,
    task: preparation.task,
    status: 'running',
  };
}

function activityFailed(
  result: Pick<ActivityAgentResult, 'exitCode' | 'stopReason'>,
): boolean {
  return (
    result.exitCode !== 0 ||
    result.stopReason === 'error' ||
    result.stopReason === 'aborted' ||
    result.stopReason === 'timeout'
  );
}

function completedOutput(
  cwd: string,
  preparation: PreparedActivityRun,
  result: ActivityAgentResult,
  state: ReturnType<typeof readState>,
): string {
  if (activityFailed(result)) return result.output;
  if (preparation.activity === 'understand') {
    const pending = state.pending_clarification;
    if (pending) {
      return `TQA ${pending.question_id} · ${pending.story_id}\n\n${pending.question}\n\n请直接回复此问题。`;
    }
  }
  const output =
    result.output.trim() && result.output.trim() !== '(no output)'
      ? result.output.trim()
      : `Evidence ${preparation.activity} 活动已完成。`;
  return `${output}\n\n${nextStepGuidance(cwd, state)}`;
}

function deterministicAgentResult(
  agent: string,
  output: string,
  startedAt = new Date().toISOString(),
  completedAt = startedAt,
): ActivityAgentResult {
  const startedMs = Date.parse(startedAt);
  const completedMs = Date.parse(completedAt);
  return {
    agent,
    model: 'deterministic',
    requestedModel: 'deterministic',
    actualModel: 'deterministic',
    thinking: 'off',
    sessionMode: 'deterministic',
    toolNames: [],
    output,
    messages: [],
    exitCode: 0,
    stderr: '',
    usage: zeroActivityUsage(),
    stopReason: 'stop',
    startedAt,
    completedAt,
    durationMs:
      Number.isFinite(startedMs) && Number.isFinite(completedMs)
        ? Math.max(0, completedMs - startedMs)
        : 0,
    toolCallCounts: {},
  };
}

function completedDetails(
  cwd: string,
  preparation: PreparedActivityRun,
  result: ActivityAgentResult,
  state: ReturnType<typeof readState>,
): ActivityExecutionDetails {
  return {
    ...result,
    output: completedOutput(cwd, preparation, result, state),
    activity: preparation.activity,
    task: preparation.task,
    status: activityFailed(result) ? 'failed' : 'completed',
  };
}

/** Execute one bounded Driver, reviewer, or deterministic controller action. */
async function executeOnePreparedActivityRun(
  ctx: ActivityExecutionContext,
  preparation: PreparedActivityRun,
  options: ExecutePreparedActivityRunOptions,
): Promise<ActivityExecutionDetails> {
  const now = options.now ?? (() => new Date().toISOString());
  const state = writeState(ctx.cwd, {
    ...preparation.state,
    pi: {
      ...(preparation.state.pi ?? {}),
      last_command: options.invocation,
      last_run_at: now(),
    },
  });
  ctx.ui.setStatus(STATUS_KEY, statusLabel(state, 'agent'));
  let partialResult: ActivityAgentResult | undefined;
  let executionRecordSequences: number[] = [];
  let traceSpanId: string | undefined;
  let driverFailure: ActivityExecutionDetails['driverFailure'];

  try {
    const details = await withActivityTrace(
      ctx.cwd,
      traceDescriptor(ctx.cwd, preparation, state, options.parentSpanId),
      async (span) => {
        traceSpanId = span.spanId;
        if (preparation.pairAction) {
          const startedAt = now();
          const action = executePairAction(ctx.cwd, preparation.pairAction);
          executionRecordSequences = action.record
            ? [action.record.sequence]
            : [];
          partialResult = deterministicAgentResult(
            'pair-controller',
            action.output,
            startedAt,
            now(),
          );
          return completedDetails(
            ctx.cwd,
            preparation,
            partialResult,
            action.state,
          );
        }
        if (preparation.showcaseAction === 'run_q2') {
          const startedAt = now();
          const action = executeShowcaseQ2(ctx.cwd);
          executionRecordSequences = action.records.map(
            ({ sequence }) => sequence,
          );
          partialResult = deterministicAgentResult(
            'showcase-controller',
            action.output,
            startedAt,
            now(),
          );
          return completedDetails(
            ctx.cwd,
            preparation,
            partialResult,
            action.state,
          );
        }
        if (preparation.modelingAction === 'complete_no_model') {
          const completed = completeNoModelImpact(ctx.cwd, state, now());
          partialResult = deterministicAgentResult(
            'modeling-controller',
            `Recorded ${completed.model_expansion_path}; the human-confirmed Profile requires no canonical model expansion or challenge.`,
          );
          return completedDetails(
            ctx.cwd,
            preparation,
            partialResult,
            completed,
          );
        }
        const mode = pairDriverMode(state);
        const snapshot = mode ? capturePairWorktree(ctx.cwd) : undefined;
        const showcaseSnapshot =
          state.loop === 'showcase' && state.showcase_stage === 'reviewing'
            ? captureShowcaseReviewer(ctx.cwd)
            : undefined;
        if (!preparation.agentName) {
          throw new Error(
            `Activity ${preparation.activity} has no activity agent or deterministic action.`,
          );
        }
        const sessionId = tqaSessionId(preparation);
        let result: ActivityAgentResult;
        try {
          result = await runActivityAgent({
            cwd: ctx.cwd,
            iterationId: state.iteration_id,
            activityLeaseId: options.activityLeaseId,
            boardRoot: boardRoot(ctx.cwd),
            agentName: preparation.agentName,
            task: preparation.task,
            policy: activityPolicy(ctx.cwd, preparation.agentName, state),
            ...(sessionId ? { sessionId } : {}),
            signal: options.signal,
            onUpdate(progress) {
              options.onUpdate?.(progressDetails(preparation, progress));
              if (traceSpanId) {
                options.onAgentProgress?.(progress, traceSpanId);
              }
            },
          });
        } catch (error) {
          if (mode && snapshot && error instanceof ActivityAgentAbortedError) {
            const completion = failPairDriver(
              ctx.cwd,
              mode as PairDriverMode,
              snapshot,
              `${error.result.output}\n${error.result.stderr}`,
              now(),
            );
            error.result.output = `${error.result.output}\n\n${completion.output}`;
            error.result.stderr =
              `${error.result.stderr}\n${completion.output}`.trim();
            partialResult = error.result;
          }
          throw error;
        }
        partialResult = result;
        if (mode && snapshot) {
          const completion = !activityFailed(result)
            ? completePairDriver(
                ctx.cwd,
                mode as PairDriverMode,
                snapshot,
                result.output,
                now(),
              )
            : failPairDriver(
                ctx.cwd,
                mode as PairDriverMode,
                snapshot,
                `${result.output}\n${result.stderr}`,
                now(),
              );
          if (completion.blocked) {
            driverFailure = {
              mode: mode as PairDriverMode,
              changedPaths: completion.changedPaths,
              blockedReason: completion.output,
            };
          }
          result = {
            ...result,
            exitCode: completion.blocked ? 1 : result.exitCode,
            output: `${result.output}\n\n${completion.output}`,
            ...(completion.blocked
              ? { stderr: `${result.stderr}\n${completion.output}`.trim() }
              : {}),
          };
          partialResult = result;
        }
        if (showcaseSnapshot) {
          const completion = completeShowcaseReviewer(
            ctx.cwd,
            showcaseSnapshot,
            activityFailed(result) ? result.exitCode || 1 : 0,
            `${result.output}\n${result.stderr}`,
            now(),
          );
          result = {
            ...result,
            exitCode: completion.blocked ? 1 : result.exitCode,
            output: `${result.output}\n\n${completion.output}`,
            ...(completion.blocked
              ? { stderr: `${result.stderr}\n${completion.output}`.trim() }
              : {}),
          };
          partialResult = result;
        }
        return completedDetails(
          ctx.cwd,
          preparation,
          result,
          readState(ctx.cwd),
        );
      },
      {
        signal: options.signal,
        now,
        partialResult: () => partialResult,
        executionRecordSequences: () => executionRecordSequences,
        resultingState: () => readState(ctx.cwd),
      },
    );
    return {
      ...details,
      ...(traceSpanId ? { traceSpanId } : {}),
      ...(driverFailure ? { driverFailure } : {}),
    };
  } finally {
    ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
  }
}

interface PairAutomationTelemetry {
  startedAt: string;
  usage: ActivityUsage;
  agentCalls: number;
  toolCallCounts: Record<string, number>;
  toolNames: Set<string>;
}

function addPairAutomationTelemetry(
  telemetry: PairAutomationTelemetry,
  result: ActivityAgentResult,
): void {
  telemetry.usage = addActivityUsage(
    telemetry.usage,
    result.usage ?? zeroActivityUsage(null),
  );
  if (result.sessionMode !== 'deterministic') telemetry.agentCalls += 1;
  for (const [name, count] of Object.entries(result.toolCallCounts ?? {})) {
    telemetry.toolCallCounts[name] =
      (telemetry.toolCallCounts[name] ?? 0) + count;
  }
  for (const name of result.toolNames ?? []) telemetry.toolNames.add(name);
}

function nextPairBudgetProjection(
  cwd: string,
  state: WorkflowState,
): { pairAgentCalls: number; pairCheckpoints: number } {
  const session = state.pair_session;
  if (!session || session.checkpoint === 'quality_gates_passed') {
    return { pairAgentCalls: 0, pairCheckpoints: 0 };
  }
  const agentCheckpoint =
    (session.checkpoint === 'red_observed' &&
      session.red_observation?.accepted !== true) ||
    pairDriverMode(state) !== undefined;
  const deterministicCheckpoint =
    session.checkpoint === 'quality_gate_failed' ||
    pairDeterministicAction(cwd, state) !== undefined;
  return {
    pairAgentCalls: agentCheckpoint ? 1 : 0,
    pairCheckpoints: agentCheckpoint || deterministicCheckpoint ? 1 : 0,
  };
}

function nextPairPreparation(cwd: string): PreparedActivityRun {
  const state = readState(cwd);
  const mode = pairDriverMode(state);
  const action = pairDeterministicAction(cwd, state);
  return {
    state,
    activity: 'pair',
    ...(mode
      ? { agentName: mode === 'test' ? 'test-driver' : 'production-driver' }
      : {}),
    ...(action ? { pairAction: action } : {}),
    task: buildActivityTask(cwd),
  };
}

function pairAutomationUsage(
  telemetry: PairAutomationTelemetry,
  steps: number,
  completedAt: string,
): ExecutionBudgetUsage {
  const startedMs = Date.parse(telemetry.startedAt);
  const completedMs = Date.parse(completedAt);
  return {
    duration_ms:
      Number.isFinite(startedMs) && Number.isFinite(completedMs)
        ? Math.max(0, completedMs - startedMs)
        : 0,
    input_tokens: telemetry.usage.input_tokens,
    output_tokens: telemetry.usage.output_tokens,
    reported_cost_usd: telemetry.usage.cost_usd,
    cost_status: telemetry.usage.cost_usd === null ? 'unknown' : 'reported',
    pair_agent_calls: telemetry.agentCalls,
    pair_checkpoints: steps,
  };
}

function withInFlightActivityUsage(
  baseline: ExecutionBudgetUsage,
  progress: ActivityAgentProgress,
): ExecutionBudgetUsage {
  const progressCost = progress.usage.cost_usd;
  const costUnknown =
    baseline.cost_status === 'unknown' || progressCost === null;
  return {
    ...baseline,
    input_tokens: baseline.input_tokens + progress.usage.input_tokens,
    output_tokens: baseline.output_tokens + progress.usage.output_tokens,
    reported_cost_usd: costUnknown
      ? null
      : (baseline.reported_cost_usd ?? 0) + progressCost,
    cost_status: costUnknown ? 'unknown' : 'reported',
  };
}

function persistedPairAutomationResult(
  cwd: string,
  state: ReturnType<typeof readState>,
  status: 'completed' | 'failed',
  output: string,
  steps: number,
  telemetry: PairAutomationTelemetry,
  completedAt: string,
  exception: {
    kind?: PairAutomationExceptionKind;
    triggeringSpanId?: string;
    executionSequence?: number;
    failureFingerprint?: string;
    retryCount?: number;
    currentUsage?: ExecutionBudgetUsage;
    approvedLimit?: number;
    actualValue?: number;
  } = {},
): ActivityExecutionDetails {
  if (status === 'failed' && state.loop === 'pair' && state.pair_session) {
    recordPairAutomationException(cwd, {
      kind: exception.kind ?? 'retry_exhausted',
      reason: output,
      currentUsage:
        exception.currentUsage ??
        pairAutomationUsage(telemetry, steps, completedAt),
      ...(exception.triggeringSpanId
        ? { triggeringSpanId: exception.triggeringSpanId }
        : {}),
      ...(exception.executionSequence !== undefined
        ? { executionSequence: exception.executionSequence }
        : {}),
      ...(exception.failureFingerprint
        ? { failureFingerprint: exception.failureFingerprint }
        : {}),
      ...(exception.retryCount !== undefined
        ? { retryCount: exception.retryCount }
        : {}),
      ...(exception.approvedLimit !== undefined
        ? { approvedLimit: exception.approvedLimit }
        : {}),
      ...(exception.actualValue !== undefined
        ? { actualValue: exception.actualValue }
        : {}),
      now: completedAt,
    });
  }
  const startedMs = Date.parse(telemetry.startedAt);
  const completedMs = Date.parse(completedAt);
  return {
    agent: 'pair-automation',
    model: 'mixed',
    requestedModel: 'mixed',
    actualModel: 'mixed',
    thinking: 'off',
    sessionMode: 'deterministic',
    toolNames: [...telemetry.toolNames].sort(),
    output,
    messages: [],
    exitCode: status === 'completed' ? 0 : 1,
    stderr: status === 'completed' ? '' : output,
    usage: telemetry.usage,
    stopReason: status === 'completed' ? 'stop' : 'error',
    ...(status === 'failed' ? { errorMessage: output } : {}),
    startedAt: telemetry.startedAt,
    completedAt,
    durationMs:
      Number.isFinite(startedMs) && Number.isFinite(completedMs)
        ? Math.max(0, completedMs - startedMs)
        : 0,
    toolCallCounts: telemetry.toolCallCounts,
    activity: 'pair',
    task: `Automated ${steps} recorded Pair checkpoint(s).`,
    status,
  };
}

async function executeTracedPairControllerAction(
  ctx: ActivityExecutionContext,
  state: WorkflowState,
  parentSpanId: string,
  task: string,
  action: () => void,
  telemetry: PairAutomationTelemetry,
  options: ExecutePreparedActivityRunOptions,
): Promise<string> {
  const now = options.now ?? (() => new Date().toISOString());
  let partialResult: ActivityAgentResult | undefined;
  let traceSpanId: string | undefined;
  await withActivityTrace(
    ctx.cwd,
    {
      state,
      activity: 'pair',
      task,
      agent: 'pair-controller',
      requestedModel: 'deterministic',
      thinking: 'off',
      sessionMode: 'deterministic',
      toolNames: [],
      parentSpanId,
    },
    async (span) => {
      traceSpanId = span.spanId;
      const startedAt = now();
      action();
      partialResult = deterministicAgentResult(
        'pair-controller',
        'Pair controller navigation completed.',
        startedAt,
        now(),
      );
      addPairAutomationTelemetry(telemetry, partialResult);
      return partialResult;
    },
    {
      signal: options.signal,
      now,
      partialResult: () => partialResult,
      resultingState: () => readState(ctx.cwd),
    },
  );
  if (!traceSpanId) {
    throw new Error('Pair controller checkpoint has no trace span.');
  }
  return traceSpanId;
}

async function executeAutomatedPairRun(
  ctx: ActivityExecutionContext,
  options: ExecutePreparedActivityRunOptions,
  parentSpanId: string,
): Promise<ActivityExecutionDetails> {
  const now = options.now ?? (() => new Date().toISOString());
  const telemetry: PairAutomationTelemetry = {
    startedAt: now(),
    usage: zeroActivityUsage(),
    agentCalls: 0,
    toolCallCounts: {},
    toolNames: new Set(),
  };
  const summaries: string[] = [];
  let steps = 0;
  let softBoundaryConsumed = false;
  const pairAutomationResult = (
    state: ReturnType<typeof readState>,
    status: 'completed' | 'failed',
    output: string,
    completedSteps: number,
    exception: Parameters<typeof persistedPairAutomationResult>[7] = {},
  ) => {
    let resolvedException = exception;
    if (status === 'failed' && !exception.currentUsage) {
      try {
        resolvedException = {
          ...exception,
          currentUsage: executionBudgetUsageFromTrace(ctx.cwd, state, {
            now: now(),
            allowedIncompleteSpanIds: [parentSpanId],
          }),
        };
      } catch {
        // The typed observability-gap exception falls back to local telemetry.
      }
    }
    return persistedPairAutomationResult(
      ctx.cwd,
      state,
      status,
      output,
      completedSteps,
      telemetry,
      now(),
      resolvedException,
    );
  };
  const checkpointProgress = (spanId: string | undefined) =>
    spanId ? recordPairCheckpointProgress(ctx.cwd, spanId, now()) : undefined;
  const noProgressStop = (
    progress: ReturnType<typeof recordPairCheckpointProgress> | undefined,
    spanId: string | undefined,
  ): ActivityExecutionDetails | undefined => {
    if (!spanId || !progress?.limitReached) return undefined;
    const limit =
      progress.state.pair_session?.execution_budget.max_no_progress_checkpoints;
    return pairAutomationResult(
      progress.state,
      'failed',
      `Pair automation made no deterministic milestone progress for ${progress.window.no_progress_checkpoints} consecutive checkpoints; approved limit=${limit ?? 'shadow'}.`,
      steps,
      {
        kind: 'no_progress',
        triggeringSpanId: spanId,
        ...(limit !== null && limit !== undefined
          ? { approvedLimit: limit }
          : {}),
        actualValue: progress.window.no_progress_checkpoints,
      },
    );
  };

  const initialState = readState(ctx.cwd);
  const initialSession = initialState.pair_session;
  if (!initialSession) {
    return pairAutomationResult(
      readState(ctx.cwd),
      'failed',
      'Pair automation has no Desk Check budget envelope.',
      steps,
    );
  }
  try {
    assertPairExecutionBudgetLocked(ctx.cwd, initialState);
  } catch (error) {
    return pairAutomationResult(
      initialState,
      'failed',
      error instanceof Error ? error.message : String(error),
      steps,
      { kind: 'observability_gap', triggeringSpanId: parentSpanId },
    );
  }
  const emergencyMaxCheckpoints =
    initialSession.execution_budget.emergency_max_checkpoints;
  for (let guard = 0; guard < emergencyMaxCheckpoints; guard += 1) {
    const state = readState(ctx.cwd);
    const session = state.pair_session;
    if (state.loop !== 'pair' || !session) {
      return pairAutomationResult(
        state,
        'failed',
        `Pair automation lost its active Pair session after ${steps} checkpoint(s).`,
        steps,
      );
    }
    const projection = nextPairBudgetProjection(ctx.cwd, state);
    let usage: ExecutionBudgetUsage;
    try {
      usage = executionBudgetUsageFromTrace(ctx.cwd, state, {
        now: now(),
        allowedIncompleteSpanIds: [parentSpanId],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return pairAutomationResult(state, 'failed', message, steps, {
        kind:
          error instanceof ExecutionBudgetObservabilityGapError
            ? 'observability_gap'
            : 'retry_exhausted',
        triggeringSpanId: parentSpanId,
      });
    }
    const budget = evaluateExecutionBudget(
      session.execution_budget,
      usage,
      projection,
    );
    if (budget.level === 'hard') {
      const trigger = budget.hard[0];
      if (!trigger) throw new Error('Hard budget has no trigger.');
      return pairAutomationResult(
        state,
        'failed',
        `Pair hard budget would be exceeded: ${trigger.metric}=${trigger.actual}, approved=${trigger.limit}.`,
        steps,
        {
          kind:
            trigger.metric === 'pair_checkpoints'
              ? 'emergency_checkpoint_limit'
              : 'budget_hard_limit',
          triggeringSpanId: parentSpanId,
          currentUsage: usage,
          approvedLimit: trigger.limit,
          actualValue: trigger.actual,
        },
      );
    }
    if (budget.level === 'soft') {
      const trigger = budget.soft[0];
      if (!trigger) throw new Error('Soft budget has no trigger.');
      const canFinishDeterministicBoundary =
        !softBoundaryConsumed &&
        projection.pairCheckpoints === 1 &&
        projection.pairAgentCalls === 0;
      if (!canFinishDeterministicBoundary) {
        return pairAutomationResult(
          state,
          'failed',
          `Pair soft budget reached a safe stop: ${trigger.metric}=${trigger.actual}, soft=${trigger.soft_limit}, hard=${trigger.limit}.`,
          steps,
          {
            kind: 'budget_soft_limit',
            triggeringSpanId: parentSpanId,
            currentUsage: usage,
            approvedLimit: trigger.limit,
            actualValue: trigger.actual,
          },
        );
      }
      softBoundaryConsumed = true;
    }
    const hardBudgetAbort = new AbortController();
    let liveBudgetTrigger: ExecutionBudgetTrigger | undefined;
    let liveBudgetUsage: ExecutionBudgetUsage | undefined;
    let liveBudgetError: unknown;
    let liveBudgetSpanId: string | undefined;
    const checkpointSignal = options.signal
      ? AbortSignal.any([options.signal, hardBudgetAbort.signal])
      : hardBudgetAbort.signal;
    const monitorAgentProgress = (
      progress: ActivityAgentProgress,
      spanId: string,
    ) => {
      if (hardBudgetAbort.signal.aborted) return;
      liveBudgetSpanId = spanId;
      try {
        const traced = executionBudgetUsageFromTrace(ctx.cwd, state, {
          now: now(),
          allowedIncompleteSpanIds: [parentSpanId, spanId],
        });
        const inFlight = withInFlightActivityUsage(traced, progress);
        const live = evaluateExecutionBudget(
          session.execution_budget,
          inFlight,
        );
        if (live.level === 'hard') {
          liveBudgetTrigger = live.hard[0];
          liveBudgetUsage = inFlight;
          hardBudgetAbort.abort(
            new Error(
              `Execution hard budget exceeded: ${liveBudgetTrigger?.metric ?? 'unknown'}.`,
            ),
          );
        }
      } catch (error) {
        liveBudgetError = error;
        hardBudgetAbort.abort(error);
      }
    };
    if (session.checkpoint === 'quality_gates_passed') {
      return pairAutomationResult(
        state,
        'completed',
        `Pair automation completed ${steps} recorded checkpoint(s) for ${session.story_id}. Every TEST has Red/Green evidence, each process step has one Refactor record, and all final quality gates passed.\n\nOptional review aid: /evidence-explain-diff. Human Story-level coding approval: /evidence-pair approve <reason>.`,
        steps,
      );
    }

    if (
      session.checkpoint === 'red_observed' &&
      session.red_observation?.accepted !== true
    ) {
      const reviewPreparation: PreparedActivityRun = {
        state,
        activity: 'pair',
        agentName: 'red-reviewer',
        task: buildActivityTask(ctx.cwd),
      };
      ctx.ui.setStatus(STATUS_KEY, statusLabel(state, 'agent'));
      let reviewerResult: ActivityAgentResult | undefined;
      let reviewerSpanId: string | undefined;
      let classification: ReturnType<typeof parsePairRedReview> | undefined;
      try {
        reviewerResult = await withActivityTrace(
          ctx.cwd,
          traceDescriptor(ctx.cwd, reviewPreparation, state, parentSpanId),
          async (span) => {
            reviewerSpanId = span.spanId;
            const result = await runActivityAgent({
              cwd: ctx.cwd,
              iterationId: state.iteration_id,
              activityLeaseId: options.activityLeaseId,
              boardRoot: boardRoot(ctx.cwd),
              agentName: 'red-reviewer',
              task: reviewPreparation.task,
              policy: activityPolicy(ctx.cwd, 'red-reviewer', state),
              signal: checkpointSignal,
              onUpdate(progress) {
                options.onUpdate?.(
                  progressDetails(reviewPreparation, progress),
                );
                if (reviewerSpanId) {
                  monitorAgentProgress(progress, reviewerSpanId);
                }
              },
            });
            reviewerResult = result;
            addPairAutomationTelemetry(telemetry, result);
            if (activityFailed(result)) return result;
            classification = parsePairRedReview(result.output);
            reviewPairRed(
              ctx.cwd,
              classification.failureKind,
              classification.reason,
              now(),
              'red-reviewer',
            );
            return result;
          },
          {
            signal: options.signal,
            now,
            partialResult: () => reviewerResult,
            resultingState: () => readState(ctx.cwd),
          },
        );
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (liveBudgetTrigger && liveBudgetUsage) {
          return pairAutomationResult(
            readState(ctx.cwd),
            'failed',
            `Pair hard budget exceeded during Red Reviewer: ${liveBudgetTrigger.metric}=${liveBudgetTrigger.actual}, approved=${liveBudgetTrigger.limit}.`,
            steps + 1,
            {
              kind: 'budget_hard_limit',
              ...(reviewerSpanId ? { triggeringSpanId: reviewerSpanId } : {}),
              currentUsage: liveBudgetUsage,
              approvedLimit: liveBudgetTrigger.limit,
              actualValue: liveBudgetTrigger.actual,
            },
          );
        }
        if (liveBudgetError) {
          return pairAutomationResult(
            readState(ctx.cwd),
            'failed',
            `Pair budget monitor failed closed: ${liveBudgetError instanceof Error ? liveBudgetError.message : String(liveBudgetError)}`,
            steps + 1,
            {
              kind: 'observability_gap',
              ...(reviewerSpanId ? { triggeringSpanId: reviewerSpanId } : {}),
            },
          );
        }
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof ActivityObservabilityGapError) {
          return pairAutomationResult(
            readState(ctx.cwd),
            'failed',
            message,
            steps,
            {
              kind: 'observability_gap',
              ...(reviewerSpanId ? { triggeringSpanId: reviewerSpanId } : {}),
            },
          );
        }
        if (!reviewerResult) {
          return pairAutomationResult(
            readState(ctx.cwd),
            'failed',
            message,
            steps,
          );
        }
        steps += 1;
        const failure = recordPairDriverFailure(ctx.cwd, {
          mode: 'red-reviewer',
          blockedReason: message,
          changedPaths: [],
          output: reviewerResult.output,
          ...(reviewerSpanId ? { traceSpanId: reviewerSpanId } : {}),
          now: now(),
        });
        const progress = checkpointProgress(reviewerSpanId);
        if (failure.repeated) {
          return pairAutomationResult(
            failure.state,
            'failed',
            `Pair automation repeated the same Red Reviewer failure ${failure.record.occurrence_count} time(s): ${message}`,
            steps,
            {
              kind: 'repeated_failure',
              ...(reviewerSpanId ? { triggeringSpanId: reviewerSpanId } : {}),
              failureFingerprint: failure.record.fingerprint,
              retryCount: failure.record.retry_count,
              approvedLimit:
                failure.state.pair_session?.execution_budget
                  .max_retries_per_failure_fingerprint,
              actualValue: failure.record.retry_count,
            },
          );
        }
        const progressStop = noProgressStop(progress, reviewerSpanId);
        if (progressStop) return progressStop;
        summaries.push('red-reviewer retry');
        continue;
      }
      steps += 1;
      const progress = checkpointProgress(reviewerSpanId);
      if (activityFailed(reviewerResult)) {
        const activityTimeout = reviewerResult.stopReason === 'timeout';
        if (activityTimeout) {
          return pairAutomationResult(
            readState(ctx.cwd),
            'failed',
            `AI Red Reviewer timed out for ${session.task_id}/${session.test_id}: ${reviewerResult.output}`,
            steps,
            {
              kind: 'activity_timeout',
              ...(reviewerSpanId ? { triggeringSpanId: reviewerSpanId } : {}),
            },
          );
        }
        const failure = recordPairDriverFailure(ctx.cwd, {
          mode: 'red-reviewer',
          blockedReason: reviewerResult.errorMessage ?? reviewerResult.output,
          changedPaths: [],
          output: reviewerResult.output,
          ...(reviewerSpanId ? { traceSpanId: reviewerSpanId } : {}),
          now: now(),
        });
        if (failure.repeated) {
          return pairAutomationResult(
            failure.state,
            'failed',
            `Pair automation repeated the same Red Reviewer failure ${failure.record.occurrence_count} time(s).`,
            steps,
            {
              kind: 'repeated_failure',
              ...(reviewerSpanId ? { triggeringSpanId: reviewerSpanId } : {}),
              failureFingerprint: failure.record.fingerprint,
              retryCount: failure.record.retry_count,
              approvedLimit:
                failure.state.pair_session?.execution_budget
                  .max_retries_per_failure_fingerprint,
              actualValue: failure.record.retry_count,
            },
          );
        }
        const progressStop = noProgressStop(progress, reviewerSpanId);
        if (progressStop) return progressStop;
        summaries.push('red-reviewer retry');
        continue;
      }
      if (!classification) {
        return pairAutomationResult(
          state,
          'failed',
          'AI Red Reviewer completed without a classification.',
          steps,
        );
      }
      summaries.push(
        `${session.task_id}/${session.test_id} Red=${classification.failureKind}`,
      );
      if (classification.failureKind !== 'behavior') {
        const red = session.red_observation;
        if (!red) throw new Error('Pseudo-Red lost its execution observation.');
        const failure = recordPairCommandFailure(ctx.cwd, {
          observation: red,
          failureKind: classification.failureKind,
          ...(reviewerSpanId ? { traceSpanId: reviewerSpanId } : {}),
          now: now(),
        });
        if (failure.repeated) {
          return pairAutomationResult(
            failure.state,
            'failed',
            `Pair automation repeated the same pseudo-Red ${failure.record.occurrence_count} time(s) for ${session.task_id}/${session.test_id}: ${classification.failureKind} · ${classification.reason}`,
            steps,
            {
              kind: 'repeated_failure',
              ...(reviewerSpanId ? { triggeringSpanId: reviewerSpanId } : {}),
              executionSequence: red.sequence,
              failureFingerprint: failure.record.fingerprint,
              retryCount: failure.record.retry_count,
              approvedLimit:
                failure.state.pair_session?.execution_budget
                  .max_retries_per_failure_fingerprint,
              actualValue: failure.record.retry_count,
            },
          );
        }
      }
      const progressStop = noProgressStop(progress, reviewerSpanId);
      if (progressStop) return progressStop;
      continue;
    }

    if (session.checkpoint === 'quality_gate_failed') {
      const observation = session.last_observation;
      const reason = `Automated repair for quality gate exit=${observation?.exit_code ?? 'unknown'}: ${observation?.command ?? 'unknown command'}`;
      let controllerSpanId: string;
      try {
        controllerSpanId = await executeTracedPairControllerAction(
          ctx,
          state,
          parentSpanId,
          `Navigate Pair back to implementation. ${reason}`,
          () => {
            navigatePair(
              ctx.cwd,
              'back_implementation',
              reason,
              now(),
              'system',
            );
          },
          telemetry,
          options,
        );
      } catch (error) {
        if (options.signal?.aborted) throw error;
        return pairAutomationResult(
          readState(ctx.cwd),
          'failed',
          error instanceof Error ? error.message : String(error),
          steps,
          {
            kind:
              error instanceof ActivityObservabilityGapError
                ? 'observability_gap'
                : 'retry_exhausted',
          },
        );
      }
      steps += 1;
      const progressStop = noProgressStop(
        checkpointProgress(controllerSpanId),
        controllerSpanId,
      );
      if (progressStop) return progressStop;
      summaries.push('quality-gate repair navigation');
      continue;
    }

    const next = nextPairPreparation(ctx.cwd);
    if (!next.agentName && !next.pairAction) {
      return pairAutomationResult(
        state,
        'failed',
        `Pair automation cannot advance checkpoint ${session.checkpoint}.`,
        steps,
      );
    }
    let details: ActivityExecutionDetails;
    try {
      details = await executeOnePreparedActivityRun(ctx, next, {
        ...options,
        signal: checkpointSignal,
        parentSpanId,
        onAgentProgress: monitorAgentProgress,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (liveBudgetTrigger && liveBudgetUsage) {
        return pairAutomationResult(
          readState(ctx.cwd),
          'failed',
          `Pair hard budget exceeded during ${next.agentName ?? 'activity'}: ${liveBudgetTrigger.metric}=${liveBudgetTrigger.actual}, approved=${liveBudgetTrigger.limit}.`,
          steps + 1,
          {
            kind: 'budget_hard_limit',
            ...(liveBudgetSpanId ? { triggeringSpanId: liveBudgetSpanId } : {}),
            currentUsage: liveBudgetUsage,
            approvedLimit: liveBudgetTrigger.limit,
            actualValue: liveBudgetTrigger.actual,
          },
        );
      }
      if (liveBudgetError) {
        return pairAutomationResult(
          readState(ctx.cwd),
          'failed',
          `Pair budget monitor failed closed: ${liveBudgetError instanceof Error ? liveBudgetError.message : String(liveBudgetError)}`,
          steps + 1,
          {
            kind: 'observability_gap',
            ...(liveBudgetSpanId ? { triggeringSpanId: liveBudgetSpanId } : {}),
          },
        );
      }
      const observabilityGap = error instanceof ActivityObservabilityGapError;
      return pairAutomationResult(
        readState(ctx.cwd),
        'failed',
        error instanceof Error ? error.message : String(error),
        steps,
        {
          kind: observabilityGap ? 'observability_gap' : 'retry_exhausted',
        },
      );
    }
    addPairAutomationTelemetry(telemetry, details);
    steps += 1;
    summaries.push(
      `${next.agentName ?? next.pairAction ?? 'controller'}: ${details.exitCode}`,
    );
    const resultingObservation = readState(ctx.cwd).pair_session
      ?.last_observation;
    const progress = checkpointProgress(details.traceSpanId);
    if (
      next.pairAction &&
      resultingObservation?.termination.kind === 'timeout'
    ) {
      return pairAutomationResult(
        readState(ctx.cwd),
        'failed',
        `Deterministic ${resultingObservation.stage} command timed out after ${resultingObservation.termination.timeout_ms}ms: ${resultingObservation.command}`,
        steps,
        {
          kind: 'command_timeout',
          ...(details.traceSpanId
            ? { triggeringSpanId: details.traceSpanId }
            : {}),
          executionSequence: resultingObservation.sequence,
          approvedLimit: resultingObservation.termination.timeout_ms,
          actualValue: resultingObservation.termination.timeout_ms,
        },
      );
    }
    if (
      next.pairAction &&
      resultingObservation &&
      resultingObservation.termination.kind !== 'exit'
    ) {
      return pairAutomationResult(
        readState(ctx.cwd),
        'failed',
        `Deterministic ${resultingObservation.stage} command ended by ${resultingObservation.termination.kind}: ${resultingObservation.command}`,
        steps,
        {
          kind: 'retry_exhausted',
          ...(details.traceSpanId
            ? { triggeringSpanId: details.traceSpanId }
            : {}),
          executionSequence: resultingObservation.sequence,
        },
      );
    }
    if (details.stopReason === 'timeout') {
      return pairAutomationResult(
        readState(ctx.cwd),
        'failed',
        `Pair activity timed out for ${next.agentName ?? 'unknown agent'} at ${readState(ctx.cwd).pair_session?.checkpoint ?? 'unknown checkpoint'}: ${details.output}`,
        steps,
        {
          kind: 'activity_timeout',
          ...(details.traceSpanId
            ? { triggeringSpanId: details.traceSpanId }
            : {}),
        },
      );
    }
    if (
      next.pairAction &&
      resultingObservation &&
      resultingObservation.stage !== 'red' &&
      resultingObservation.exit_code !== 0
    ) {
      const failure = recordPairCommandFailure(ctx.cwd, {
        observation: resultingObservation,
        failureKind: resultingObservation.stage,
        ...(details.traceSpanId ? { traceSpanId: details.traceSpanId } : {}),
        now: now(),
      });
      if (failure.repeated) {
        return pairAutomationResult(
          failure.state,
          'failed',
          `Pair automation repeated the same ${resultingObservation.stage} command failure ${failure.record.occurrence_count} time(s) for ${session.task_id}/${session.test_id}.`,
          steps,
          {
            kind: 'repeated_failure',
            ...(details.traceSpanId
              ? { triggeringSpanId: details.traceSpanId }
              : {}),
            executionSequence: resultingObservation.sequence,
            failureFingerprint: failure.record.fingerprint,
            retryCount: failure.record.retry_count,
            approvedLimit:
              failure.state.pair_session?.execution_budget
                .max_retries_per_failure_fingerprint,
            actualValue: failure.record.retry_count,
          },
        );
      }
    }
    if (details.status === 'failed') {
      const mode =
        details.driverFailure?.mode ??
        pairDriverMode(next.state) ??
        'implementation';
      const failure = recordPairDriverFailure(ctx.cwd, {
        mode,
        blockedReason:
          details.driverFailure?.blockedReason ??
          details.errorMessage ??
          details.output,
        changedPaths: details.driverFailure?.changedPaths ?? [],
        output: details.output,
        ...(details.traceSpanId ? { traceSpanId: details.traceSpanId } : {}),
        now: now(),
      });
      if (failure.repeated) {
        return pairAutomationResult(
          failure.state,
          'failed',
          `Pair automation repeated the same ${mode} Driver failure ${failure.record.occurrence_count} time(s) for ${session.task_id}/${session.test_id}.`,
          steps,
          {
            kind: 'repeated_failure',
            ...(details.traceSpanId
              ? { triggeringSpanId: details.traceSpanId }
              : {}),
            failureFingerprint: failure.record.fingerprint,
            retryCount: failure.record.retry_count,
            approvedLimit:
              failure.state.pair_session?.execution_budget
                .max_retries_per_failure_fingerprint,
            actualValue: failure.record.retry_count,
          },
        );
      }
    }
    const progressStop = noProgressStop(progress, details.traceSpanId);
    if (progressStop) return progressStop;
  }

  return pairAutomationResult(
    readState(ctx.cwd),
    'failed',
    `Pair automation exceeded the approved emergency limit of ${emergencyMaxCheckpoints} checkpoints. Recent trace: ${summaries.slice(-10).join(' → ')}`,
    steps,
    {
      kind: 'emergency_checkpoint_limit',
      approvedLimit: emergencyMaxCheckpoints,
      actualValue: steps,
    },
  );
}

/** Execute a normal loop checkpoint, or the complete automated Pair coding run. */
export async function executePreparedActivityRun(
  ctx: ActivityExecutionContext,
  preparation: PreparedActivityRun,
  options: ExecutePreparedActivityRunOptions,
): Promise<ActivityExecutionDetails> {
  const leaseHandle =
    options.leaseHandle ??
    acquireActivityLease(
      ctx.cwd,
      ctx.cwd,
      preparation.state,
      preparation.activity === 'pair' ? 'pair' : 'activity',
    );
  const leasedOptions: ExecutePreparedActivityRunOptions = {
    ...options,
    leaseHandle,
    activityLeaseId: leaseHandle.lease.lease_id,
  };
  try {
    if (
      preparation.activity === 'pair' &&
      preparation.state.loop === 'pair' &&
      preparation.state.pair_session
    ) {
      let partialResult: ActivityExecutionDetails | undefined;
      try {
        return await withActivityTrace(
          ctx.cwd,
          {
            state: preparation.state,
            activity: 'pair',
            task: preparation.task,
            agent: 'pair-automation',
            requestedModel: 'mixed',
            thinking: 'off',
            sessionMode: 'deterministic',
            toolNames: [],
          },
          async (span) => {
            partialResult = await executeAutomatedPairRun(
              ctx,
              leasedOptions,
              span.spanId,
            );
            return partialResult;
          },
          {
            signal: options.signal,
            now: options.now,
            partialResult: () => partialResult,
            resultForTrace: (result) => ({
              ...result,
              model: 'mixed',
              requestedModel: 'mixed',
              actualModel: 'mixed',
              toolNames: [],
              usage: zeroActivityUsage(),
              toolCallCounts: {},
            }),
            resultingState: () => readState(ctx.cwd),
          },
        );
      } finally {
        ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
      }
    }
    return await executeOnePreparedActivityRun(ctx, preparation, leasedOptions);
  } finally {
    releaseActivityLease(leaseHandle);
  }
}
