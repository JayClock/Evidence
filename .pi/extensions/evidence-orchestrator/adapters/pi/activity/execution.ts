import type {
  ActivityAgentProgress,
  ActivityAgentResult,
} from '../../node/activity-agent-process';
import {
  loadActivityAgent,
  runActivityAgent,
} from '../../node/activity-agent-process';
import {
  addActivityUsage,
  type ActivityUsage,
  zeroActivityUsage,
} from '../../../capabilities/activity-observability/activity-usage';
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
}

interface ActivityExecutionContext {
  cwd: string;
  ui: {
    setStatus(key: string, value: string | undefined): void;
  };
}

interface ExecutePreparedActivityRunOptions {
  invocation: string;
  signal?: AbortSignal;
  onUpdate?: (details: ActivityExecutionDetails) => void;
  now?: () => string;
  parentSpanId?: string;
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
  return createActivityToolPolicy({
    cwd,
    role: agentName,
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

  try {
    return await withActivityTrace(
      ctx.cwd,
      traceDescriptor(ctx.cwd, preparation, state, options.parentSpanId),
      async () => {
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
        let result = await runActivityAgent({
          cwd: ctx.cwd,
          agentName: preparation.agentName,
          task: preparation.task,
          policy: activityPolicy(ctx.cwd, preparation.agentName, state),
          ...(sessionId ? { sessionId } : {}),
          signal: options.signal,
          onUpdate(progress) {
            options.onUpdate?.(progressDetails(preparation, progress));
          },
        });
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
  } finally {
    ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
  }
}

const MAX_AUTOMATED_RETRIES = 2;
const MAX_PAIR_AUTOMATION_STEPS = 200;

interface PairAutomationTelemetry {
  startedAt: string;
  usage: ActivityUsage;
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
  for (const [name, count] of Object.entries(result.toolCallCounts ?? {})) {
    telemetry.toolCallCounts[name] =
      (telemetry.toolCallCounts[name] ?? 0) + count;
  }
  for (const name of result.toolNames ?? []) telemetry.toolNames.add(name);
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

function persistedPairAutomationResult(
  cwd: string,
  state: ReturnType<typeof readState>,
  status: 'completed' | 'failed',
  output: string,
  steps: number,
  telemetry: PairAutomationTelemetry,
  completedAt: string,
): ActivityExecutionDetails {
  if (status === 'failed' && state.loop === 'pair' && state.pair_session) {
    writeState(cwd, {
      ...state,
      pair_session: {
        ...state.pair_session,
        automation_exception: {
          kind: 'automation_exhausted',
          reason: output,
          checkpoint: state.pair_session.checkpoint,
          recorded_at: completedAt,
        },
      },
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

function retryAllowed(retries: Map<string, number>, key: string): boolean {
  const next = (retries.get(key) ?? 0) + 1;
  retries.set(key, next);
  return next <= MAX_AUTOMATED_RETRIES;
}

async function executeTracedPairControllerAction(
  ctx: ActivityExecutionContext,
  state: WorkflowState,
  parentSpanId: string,
  task: string,
  action: () => void,
  telemetry: PairAutomationTelemetry,
  options: ExecutePreparedActivityRunOptions,
): Promise<void> {
  const now = options.now ?? (() => new Date().toISOString());
  let partialResult: ActivityAgentResult | undefined;
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
    async () => {
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
    toolCallCounts: {},
    toolNames: new Set(),
  };
  const retries = new Map<string, number>();
  const reviewedFailures = new Set<number>();
  const summaries: string[] = [];
  let steps = 0;
  const pairAutomationResult = (
    state: ReturnType<typeof readState>,
    status: 'completed' | 'failed',
    output: string,
    completedSteps: number,
  ) =>
    persistedPairAutomationResult(
      ctx.cwd,
      state,
      status,
      output,
      completedSteps,
      telemetry,
      now(),
    );

  for (let guard = 0; guard < MAX_PAIR_AUTOMATION_STEPS; guard += 1) {
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
      let classification: ReturnType<typeof parsePairRedReview> | undefined;
      try {
        reviewerResult = await withActivityTrace(
          ctx.cwd,
          traceDescriptor(ctx.cwd, reviewPreparation, state, parentSpanId),
          async () => {
            const result = await runActivityAgent({
              cwd: ctx.cwd,
              agentName: 'red-reviewer',
              task: reviewPreparation.task,
              policy: activityPolicy(ctx.cwd, 'red-reviewer', state),
              signal: options.signal,
              onUpdate(progress) {
                options.onUpdate?.(
                  progressDetails(reviewPreparation, progress),
                );
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
        if (
          options.signal?.aborted ||
          error instanceof ActivityObservabilityGapError
        ) {
          throw error;
        }
        return pairAutomationResult(
          readState(ctx.cwd),
          'failed',
          error instanceof Error ? error.message : String(error),
          steps,
        );
      }
      if (activityFailed(reviewerResult)) {
        return pairAutomationResult(
          state,
          'failed',
          `AI Red Reviewer failed for ${session.task_id}/${session.test_id}: ${reviewerResult.output}`,
          steps,
        );
      }
      if (!classification) {
        return pairAutomationResult(
          state,
          'failed',
          'AI Red Reviewer completed without a classification.',
          steps,
        );
      }
      steps += 1;
      summaries.push(
        `${session.task_id}/${session.test_id} Red=${classification.failureKind}`,
      );
      if (
        classification.failureKind !== 'behavior' &&
        !retryAllowed(
          retries,
          `red:${session.task_id}/${session.test_id}:${classification.failureKind}`,
        )
      ) {
        return pairAutomationResult(
          readState(ctx.cwd),
          'failed',
          `Pair automation stopped after repeated pseudo-Red classifications for ${session.task_id}/${session.test_id}: ${classification.failureKind} · ${classification.reason}`,
          steps,
        );
      }
      continue;
    }

    if (session.checkpoint === 'quality_gate_failed') {
      const observation = session.last_observation;
      const key = `quality:${session.quality_gate_index}:${observation?.command ?? 'unknown'}`;
      if (!retryAllowed(retries, key)) {
        return pairAutomationResult(
          state,
          'failed',
          `Pair automation exhausted quality-gate repair retries: ${observation?.command ?? 'unknown command'}. Human exception routing is required.`,
          steps,
        );
      }
      const reason = `Automated repair for quality gate exit=${observation?.exit_code ?? 'unknown'}: ${observation?.command ?? 'unknown command'}`;
      await executeTracedPairControllerAction(
        ctx,
        state,
        parentSpanId,
        `Navigate Pair back to implementation. ${reason}`,
        () => {
          navigatePair(ctx.cwd, 'back_implementation', reason, now());
        },
        telemetry,
        options,
      );
      summaries.push(`quality-gate repair ${retries.get(key)}`);
      continue;
    }

    const failedObservation = session.last_observation;
    if (
      failedObservation &&
      failedObservation.exit_code !== 0 &&
      ['green', 'refactor'].includes(failedObservation.stage) &&
      !reviewedFailures.has(failedObservation.sequence)
    ) {
      reviewedFailures.add(failedObservation.sequence);
      const key = `${failedObservation.stage}:${session.task_id}/${session.test_id}`;
      if (!retryAllowed(retries, key)) {
        return pairAutomationResult(
          state,
          'failed',
          `Pair automation exhausted ${failedObservation.stage} repair retries for ${session.task_id}/${session.test_id}. Human exception routing is required.`,
          steps,
        );
      }
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
    const details = await executeOnePreparedActivityRun(ctx, next, {
      ...options,
      parentSpanId,
    });
    addPairAutomationTelemetry(telemetry, details);
    steps += 1;
    summaries.push(
      `${next.agentName ?? next.pairAction ?? 'controller'}: ${details.exitCode}`,
    );
    if (details.status === 'failed') {
      const current = readState(ctx.cwd).pair_session;
      const key = `driver:${current?.task_id}/${current?.test_id}:${next.agentName ?? next.pairAction}`;
      if (!retryAllowed(retries, key)) {
        return pairAutomationResult(
          readState(ctx.cwd),
          'failed',
          `Pair automation exhausted Driver retries at ${key}.\n\n${details.output}`,
          steps,
        );
      }
    }
  }

  return pairAutomationResult(
    readState(ctx.cwd),
    'failed',
    `Pair automation exceeded ${MAX_PAIR_AUTOMATION_STEPS} checkpoints. Recent trace: ${summaries.slice(-10).join(' → ')}`,
    steps,
  );
}

/** Execute a normal loop checkpoint, or the complete automated Pair coding run. */
export async function executePreparedActivityRun(
  ctx: ActivityExecutionContext,
  preparation: PreparedActivityRun,
  options: ExecutePreparedActivityRunOptions,
): Promise<ActivityExecutionDetails> {
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
            options,
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
  return executeOnePreparedActivityRun(ctx, preparation, options);
}
