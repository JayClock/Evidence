import type {
  ActivityAgentProgress,
  ActivityAgentResult,
} from '../../node/activity-agent-process';
import { runActivityAgent } from '../../node/activity-agent-process';
import { completeNoModelImpact } from '../../../capabilities/modeling-evidence/no-model-impact';
import {
  buildPairRedReviewTask,
  capturePairWorktree,
  completePairDriver,
  executePairAction,
  failPairDriver,
  navigatePair,
  pairDeterministicAction,
  pairDriverMode,
  parsePairRedReview,
  reviewPairRed,
} from '../../../loops/pair/pair-session';
import {
  captureShowcaseReviewer,
  completeShowcaseReviewer,
  executeShowcaseQ2,
} from '../../../loops/showcase/showcase-session';
import { readState, writeState } from '../../../iteration/state-repository';
import type { PairDriverMode, WorkflowLoop } from '../../../iteration/state';
import { STATUS_KEY, statusLabel } from '../identity';
import { nextStepGuidance } from '../next-step';
import type { PreparedActivityRun } from './dispatch';
import { buildActivityTask } from './task';

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

function completedOutput(
  cwd: string,
  preparation: PreparedActivityRun,
  result: ActivityAgentResult,
  state: ReturnType<typeof readState>,
): string {
  if (result.exitCode !== 0) return result.output;
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
    status: result.exitCode === 0 ? 'completed' : 'failed',
  };
}

/** Execute one bounded Driver, reviewer, or deterministic controller action. */
async function executeOnePreparedActivityRun(
  ctx: ActivityExecutionContext,
  preparation: PreparedActivityRun,
  options: ExecutePreparedActivityRunOptions,
): Promise<ActivityExecutionDetails> {
  const state = writeState(ctx.cwd, {
    ...preparation.state,
    pi: {
      ...(preparation.state.pi ?? {}),
      last_command: options.invocation,
      last_run_at: (options.now ?? (() => new Date().toISOString()))(),
    },
  });
  ctx.ui.setStatus(STATUS_KEY, statusLabel(state, 'subagent'));

  try {
    if (preparation.pairAction) {
      const action = executePairAction(ctx.cwd, preparation.pairAction);
      return completedDetails(
        ctx.cwd,
        preparation,
        {
          agent: 'pair-controller',
          model: 'deterministic',
          thinking: 'off',
          output: action.output,
          messages: [],
          exitCode: 0,
          stderr: '',
        },
        action.state,
      );
    }
    if (preparation.showcaseAction === 'run_q2') {
      const action = executeShowcaseQ2(ctx.cwd);
      return completedDetails(
        ctx.cwd,
        preparation,
        {
          agent: 'showcase-controller',
          model: 'deterministic',
          thinking: 'off',
          output: action.output,
          messages: [],
          exitCode: 0,
          stderr: '',
        },
        action.state,
      );
    }
    if (preparation.modelingAction === 'complete_no_model') {
      const completed = completeNoModelImpact(
        ctx.cwd,
        state,
        (options.now ?? (() => new Date().toISOString()))(),
      );
      return completedDetails(
        ctx.cwd,
        preparation,
        {
          agent: 'modeling-controller',
          model: 'deterministic',
          thinking: 'off',
          output: `Recorded ${completed.model_expansion_path}; the human-confirmed Profile requires no canonical model expansion or challenge.`,
          messages: [],
          exitCode: 0,
          stderr: '',
        },
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
        `Activity ${preparation.activity} has no subagent or deterministic action.`,
      );
    }
    const sessionId = tqaSessionId(preparation);
    let result = await runActivityAgent({
      cwd: ctx.cwd,
      agentName: preparation.agentName,
      task: preparation.task,
      ...(sessionId ? { sessionId } : {}),
      signal: options.signal,
      onUpdate(progress) {
        options.onUpdate?.(progressDetails(preparation, progress));
      },
    });
    if (mode && snapshot) {
      const completion =
        result.exitCode === 0
          ? completePairDriver(
              ctx.cwd,
              mode as PairDriverMode,
              snapshot,
              result.output,
              (options.now ?? (() => new Date().toISOString()))(),
            )
          : failPairDriver(
              ctx.cwd,
              mode as PairDriverMode,
              snapshot,
              `${result.output}\n${result.stderr}`,
              (options.now ?? (() => new Date().toISOString()))(),
            );
      result = {
        ...result,
        exitCode: completion.blocked ? 1 : result.exitCode,
        output: `${result.output}\n\n${completion.output}`,
        ...(completion.blocked
          ? { stderr: `${result.stderr}\n${completion.output}`.trim() }
          : {}),
      };
    }
    if (showcaseSnapshot) {
      const completion = completeShowcaseReviewer(
        ctx.cwd,
        showcaseSnapshot,
        result.exitCode,
        `${result.output}\n${result.stderr}`,
        (options.now ?? (() => new Date().toISOString()))(),
      );
      result = {
        ...result,
        exitCode: completion.blocked ? 1 : result.exitCode,
        output: `${result.output}\n\n${completion.output}`,
        ...(completion.blocked
          ? { stderr: `${result.stderr}\n${completion.output}`.trim() }
          : {}),
      };
    }
    return completedDetails(ctx.cwd, preparation, result, readState(ctx.cwd));
  } finally {
    ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
  }
}

const MAX_AUTOMATED_RETRIES = 2;
const MAX_PAIR_AUTOMATION_STEPS = 200;

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
          recorded_at: new Date().toISOString(),
        },
      },
    });
  }
  return {
    agent: 'pair-automation',
    model: 'mixed',
    thinking: 'off',
    output,
    messages: [],
    exitCode: status === 'completed' ? 0 : 1,
    stderr: status === 'completed' ? '' : output,
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

async function executeAutomatedPairRun(
  ctx: ActivityExecutionContext,
  options: ExecutePreparedActivityRunOptions,
): Promise<ActivityExecutionDetails> {
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
        task: buildPairRedReviewTask(ctx.cwd, state),
      };
      ctx.ui.setStatus(STATUS_KEY, statusLabel(state, 'subagent'));
      const result = await runActivityAgent({
        cwd: ctx.cwd,
        agentName: 'red-reviewer',
        task: reviewPreparation.task,
        signal: options.signal,
        onUpdate(progress) {
          options.onUpdate?.(progressDetails(reviewPreparation, progress));
        },
      });
      if (result.exitCode !== 0) {
        return pairAutomationResult(
          state,
          'failed',
          `AI Red Reviewer failed for ${session.task_id}/${session.test_id}: ${result.output}`,
          steps,
        );
      }
      let classification;
      try {
        classification = parsePairRedReview(result.output);
      } catch (error) {
        return pairAutomationResult(
          state,
          'failed',
          error instanceof Error ? error.message : String(error),
          steps,
        );
      }
      reviewPairRed(
        ctx.cwd,
        classification.failureKind,
        classification.reason,
        (options.now ?? (() => new Date().toISOString()))(),
        'red-reviewer',
      );
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
      navigatePair(
        ctx.cwd,
        'back_implementation',
        `Automated repair for quality gate exit=${observation?.exit_code ?? 'unknown'}: ${observation?.command ?? 'unknown command'}`,
        (options.now ?? (() => new Date().toISOString()))(),
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
    const details = await executeOnePreparedActivityRun(ctx, next, options);
    steps += 1;
    summaries.push(
      `${next.agentName ?? next.pairAction ?? 'controller'}: ${details.exitCode}`,
    );
    if (details.exitCode !== 0) {
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
    try {
      return await executeAutomatedPairRun(ctx, options);
    } finally {
      ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
    }
  }
  return executeOnePreparedActivityRun(ctx, preparation, options);
}
