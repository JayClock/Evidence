import type {
  ActivityAgentProgress,
  ActivityAgentResult,
} from '../../node/activity-agent-process';
import { runActivitySubagent } from '../../node/activity-agent-process';
import {
  capturePairWorktree,
  completePairDriver,
  executePairAction,
  failPairDriver,
  pairDriverMode,
} from '../../../loops/pair/pair-session';
import {
  captureShowcaseReviewer,
  completeShowcaseReviewer,
  executeShowcaseQ2,
} from '../../../loops/showcase/showcase-session';
import { readState, writeState } from '../../../iteration/state-repository';
import type { PairDriverMode, WorkflowLoop } from '../../../iteration/state';
import { STATUS_KEY, statusLabel } from '../identity';
import type { PreparedActivityRun } from './dispatch';

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
  preparation: PreparedActivityRun,
  result: ActivityAgentResult,
  state: ReturnType<typeof readState>,
): string {
  if (preparation.activity !== 'understand' || result.exitCode !== 0) {
    return result.output;
  }
  const pending = state.pending_clarification;
  if (pending) {
    return `TQA ${pending.question_id} · ${pending.story_id}\n\n${pending.question}\n\n请直接回复此问题。`;
  }
  return result.output;
}

function completedDetails(
  preparation: PreparedActivityRun,
  result: ActivityAgentResult,
  state: ReturnType<typeof readState>,
): ActivityExecutionDetails {
  return {
    ...result,
    output: completedOutput(preparation, result, state),
    activity: preparation.activity,
    task: preparation.task,
    status: result.exitCode === 0 ? 'completed' : 'failed',
  };
}

/** Execute one prepared activity identically from commands and model tools. */
export async function executePreparedActivityRun(
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
    let result = await runActivitySubagent({
      cwd: ctx.cwd,
      agentName: preparation.agentName,
      task: preparation.task,
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
    return completedDetails(preparation, result, readState(ctx.cwd));
  } finally {
    ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
  }
}
