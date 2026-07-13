import type {
  PhaseAgentProgress,
  PhaseAgentResult,
} from '../subagents/phase-runner';
import { runPhaseSubagent } from '../subagents/phase-runner';
import { readState, writeState } from '../workflow/state-store';
import type { Phase } from '../workflow/types';
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

function completedDetails(
  preparation: PreparedPhaseRun,
  result: PhaseAgentResult,
): PhaseExecutionDetails {
  return {
    ...result,
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
    const result = await runPhaseSubagent({
      cwd: ctx.cwd,
      phase: preparation.phase,
      task: preparation.task,
      signal: options.signal,
      onUpdate(progress) {
        options.onUpdate?.(progressDetails(preparation, progress));
      },
    });
    return completedDetails(preparation, result);
  } finally {
    ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
  }
}
