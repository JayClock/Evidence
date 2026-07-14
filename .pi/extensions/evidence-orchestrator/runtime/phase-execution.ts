import type {
  PhaseAgentProgress,
  PhaseAgentResult,
} from '../subagents/phase-runner';
import { runPhaseSubagent } from '../subagents/phase-runner';
import {
  capturePairWorktree,
  completePairDriver,
  executePairAction,
  failPairDriver,
  pairDriverMode,
} from '../testing/pairing';
import {
  captureShowcaseReviewer,
  completeShowcaseReviewer,
  executeShowcaseQ2,
} from '../testing/showcase';
import { readState, writeState } from '../workflow/state-store';
import type { PairDriverMode, Phase } from '../workflow/types';
import { STATUS_KEY, statusLabel } from './identity';
import type { PreparedPhaseRun } from './phase-dispatch';

export interface PhaseExecutionDetails extends PhaseAgentResult {
  phase: Exclude<Phase, 'complete'>;
  task: string;
  status: 'running' | 'completed' | 'failed';
}

interface PhaseExecutionContext {
  cwd: string;
  ui: {
    setStatus(key: string, value: string | undefined): void;
  };
}

interface ExecutePreparedPhaseRunOptions {
  invocation: string;
  signal?: AbortSignal;
  onUpdate?: (details: PhaseExecutionDetails) => void;
  now?: () => string;
}

function progressDetails(
  preparation: PreparedPhaseRun,
  progress: PhaseAgentProgress,
): PhaseExecutionDetails {
  return {
    ...progress,
    phase: preparation.phase,
    task: preparation.task,
    status: 'running',
  };
}

function completedOutput(
  preparation: PreparedPhaseRun,
  result: PhaseAgentResult,
  state: ReturnType<typeof readState>,
): string {
  if (preparation.phase !== 'clarify' || result.exitCode !== 0) {
    return result.output;
  }
  const pending = state.pending_clarification;
  if (pending) {
    return `TQA ${pending.question_id} · ${pending.story_id}\n\n${pending.question}\n\n请直接回复此问题。`;
  }
  const proposal = state.proposed_clarification_story_outcome;
  if (proposal) {
    return `AI 建议将 ${proposal.story_id} 标记为 ${proposal.outcome}。\n\n理由：${proposal.summary}\n\nStory 仍保持活动，且尚未形成最终结论。请由领域专家运行 /evidence-story-complete，选择确认、修改结论或继续澄清。`;
  }
  return result.output;
}

function completedDetails(
  preparation: PreparedPhaseRun,
  result: PhaseAgentResult,
  state: ReturnType<typeof readState>,
): PhaseExecutionDetails {
  return {
    ...result,
    output: completedOutput(preparation, result, state),
    phase: preparation.phase,
    task: preparation.task,
    status: result.exitCode === 0 ? 'completed' : 'failed',
  };
}

/** Execute one prepared phase identically from commands and model tools. */
export async function executePreparedPhaseRun(
  ctx: PhaseExecutionContext,
  preparation: PreparedPhaseRun,
  options: ExecutePreparedPhaseRunOptions,
): Promise<PhaseExecutionDetails> {
  const state = writeState(ctx.cwd, {
    ...preparation.state,
    pi: {
      enabled: true,
      version: 5,
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
      state.workflow_version === 5 &&
      state.loop === 'showcase' &&
      state.showcase_stage === 'reviewing'
        ? captureShowcaseReviewer(ctx.cwd)
        : undefined;
    let result = await runPhaseSubagent({
      cwd: ctx.cwd,
      phase: preparation.phase,
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
