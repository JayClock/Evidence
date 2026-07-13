import { ensureProjectDirs, missingPaths } from '../evidence/artifact-index';
import { isGateAnswered, resolvePendingGate } from '../workflow/gates';
import {
  artifactRelativePath,
  iterationRoot,
} from '../workflow/iteration-paths';
import { PHASE_META } from '../workflow/phase-catalog';
import { readState, selectWorkItem } from '../workflow/state-store';
import type { Phase, WorkflowState } from '../workflow/types';
import { buildPhaseTask } from '../subagents/phase-task';

export interface PhaseRunRequest {
  requestedPhase?: string;
  instructions?: string;
  storyId?: string;
  scenarioId?: string;
}

export class PhaseRunBlockedError extends Error {
  constructor(
    readonly kind: 'gate' | 'clarification',
    message: string,
  ) {
    super(message);
    this.name = 'PhaseRunBlockedError';
  }
}

export interface PreparedPhaseRun {
  state: WorkflowState;
  phase: Exclude<Phase, 'complete'>;
  task: string;
}

export interface CompletedIteration {
  state: WorkflowState;
  task: string;
}

export type PhaseRunPreparation = PreparedPhaseRun | CompletedIteration;

function isCompleted(
  preparation: PhaseRunPreparation,
): preparation is CompletedIteration {
  return preparation.state.phase === 'complete';
}

/**
 * Resolve one run deterministically before handing it to a phase subagent.
 * This function deliberately performs no agent work and never starts a child
 * process, so commands and tools cannot diverge in their guardrails.
 */
export function preparePhaseRun(
  cwd: string,
  request: PhaseRunRequest = {},
): PhaseRunPreparation {
  let state = readState(cwd);
  ensureProjectDirs(cwd, iterationRoot(cwd, state));

  if (state.pending_gate && isGateAnswered(cwd, state.pending_gate)) {
    state = resolvePendingGate(cwd);
  }
  if (state.halted) {
    throw new Error(
      `Iteration ${state.iteration_id} is halted: ${state.halted.reason}`,
    );
  }
  if (state.phase !== 'complete' && !state.requirement_source) {
    throw new Error(
      'This bootstrap iteration is archival and cannot run. Select a GitHub Issue with /evidence-new.',
    );
  }
  if (state.pending_clarification) {
    const pending = state.pending_clarification;
    throw new PhaseRunBlockedError(
      'clarification',
      `Clarification ${pending.question_id} for ${pending.story_id} is awaiting a domain-expert answer: ${pending.question}`,
    );
  }
  if (request.requestedPhase && request.requestedPhase !== state.phase) {
    throw new Error(
      `Cannot run ${request.requestedPhase}: current phase is ${state.phase}. Use /evidence-new before a new iteration.`,
    );
  }
  if (request.storyId || request.scenarioId) {
    if (state.phase !== 'coding') {
      throw new Error(
        'A --story/--scenario work item can only be selected during coding.',
      );
    }
    if (!request.storyId || !request.scenarioId) {
      throw new Error(
        'Coding requires both --story=US-xxx and --scenario=SC-xxx.',
      );
    }
    state = selectWorkItem(cwd, request.storyId, request.scenarioId);
  }

  const current = readState(cwd);
  if (current.pending_gate && !isGateAnswered(cwd, current.pending_gate)) {
    throw new PhaseRunBlockedError(
      'gate',
      `Gate ${current.pending_gate} is pending. Edit ${artifactRelativePath(current, `artifacts/gates/${current.pending_gate}.md`)} or run /evidence-gate <decision>.`,
    );
  }
  const task = buildPhaseTask(
    cwd,
    request.requestedPhase,
    request.instructions ?? '',
  );
  if (current.phase === 'complete') return { state: current, task };

  const missingInputs = missingPaths(
    cwd,
    PHASE_META[current.phase].inputs.map((path) =>
      artifactRelativePath(current, path),
    ),
  );
  if (missingInputs.length > 0) {
    throw new Error(
      `Cannot run ${current.phase}: missing inputs: ${missingInputs.join(', ')}.`,
    );
  }
  return { state: current, phase: current.phase, task };
}

export function isCompletedIteration(
  preparation: PhaseRunPreparation,
): preparation is CompletedIteration {
  return isCompleted(preparation);
}

/**
 * Parent-agent request used by /evidence-run. The parent must invoke the
 * visible tool rather than perform phase work or hide child execution.
 */
export function foregroundPhaseRequest(instructions = ''): string {
  return `请在当前会话中以前台、可见方式执行当前 Evidence Orchestrator 阶段。

必须立即调用 evidence_orchestrator_run_phase 工具；不要自行读取、编辑、运行或完成该阶段。该工具会启动隔离的专业 subagent，并将进度流式显示在本次对话中。

调用参数（JSON）：
${JSON.stringify({ instructions }, null, 2)}

工具返回后，只总结已观测到的工件、验证结果和下一项人类决策：
- 若出现 TQA 问题，原样向用户提问并停止；
- 若出现 Gate，展示 Gate 与可选决策并停止；
- 若阶段仍未完成，说明具体失败或缺失输入；
- 不要自动跨越阶段或替用户作业务决定。`;
}
