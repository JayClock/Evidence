import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  evaluateExecutionBudget,
  executionBudgetUsageFromTrace,
} from '../../capabilities/execution-budget/evaluator';
import { assertPairExecutionBudgetLocked } from '../../capabilities/execution-budget/policy';
import { generateExecutionEvidence } from '../../capabilities/execution-evidence/manifest';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { transitionLoopState } from '../../iteration/transition-graph';
import { readState, writeState } from '../../iteration/state-repository';
import {
  completedWorkItem,
  type CompletedWorkItem,
  type DeliveryIncrementAction,
  type ExecutionBudgetUsage,
  type WorkflowState,
} from '../../iteration/state';
import { recordPairAutomationException } from './pair-session';

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function modelingDecisionEvidencePath(
  state: WorkflowState,
): string | undefined {
  if (
    state.modeling_profile?.method === 'none' &&
    state.modeling_profile.model_change_required === false
  ) {
    return state.model_expansion_path;
  }
  const decision = state.model_decisions?.at(-1);
  return decision?.action === 'confirm' ? decision.artifact_path : undefined;
}

function completedItem(
  cwd: string,
  state: WorkflowState,
  now: string,
): CompletedWorkItem {
  const scenarios = state.confirmed_scenarios ?? [];
  const workItem = state.active_work_item;
  const tasking = state.tasking_candidate;
  const pair = state.pair_session;
  const modelingDecisionPath = modelingDecisionEvidencePath(state);
  if (
    scenarios.length === 0 ||
    !workItem ||
    !tasking ||
    !pair ||
    pair.checkpoint !== 'quality_gates_passed' ||
    !state.approved_test_plan_path ||
    !state.approved_test_plan_sha256 ||
    !state.model_expansion_path ||
    !modelingDecisionPath
  ) {
    throw new Error(
      'A delivery decision requires one fully completed Story Scenario Set.',
    );
  }
  const generated = generateExecutionEvidence(cwd, workItem);
  const manifest = generated.manifest;
  const executionManifestPath = generated.manifestPath;
  const absoluteManifest = join(cwd, executionManifestPath);
  return {
    version: 1,
    story_id: workItem.story_id,
    scenarios,
    work_item: workItem,
    tasking,
    pair,
    approved_test_plan_path: state.approved_test_plan_path,
    approved_test_plan_sha256: state.approved_test_plan_sha256,
    model_expansion_path: state.model_expansion_path,
    model_decision_path: modelingDecisionPath,
    execution_manifest_path: executionManifestPath,
    execution_manifest_sha256: digest(readFileSync(absoluteManifest)),
    completed_at: manifest.source.completed_at || now,
  };
}

/** Record the one human coding approval at the completed Story boundary, then enter Showcase. */
export function decideDeliveryIncrement(
  cwd: string,
  action: DeliveryIncrementAction,
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'pair' ||
    state.pair_session?.checkpoint !== 'quality_gates_passed' ||
    state.pair_session.automation_exception
  ) {
    throw new Error(
      'A delivery increment decision is available only after all Pair quality gates pass.',
    );
  }
  if (action !== 'showcase') {
    throw new Error(`Unsupported Story completion decision: ${action}.`);
  }
  if (!reason.trim())
    throw new Error('A human Story coding approval requires a reason.');
  if (completedWorkItem(state)) {
    throw new Error('This iteration already has a completed Story.');
  }

  const workItem = state.active_work_item;
  if (!workItem)
    throw new Error('Story coding approval has no active work item.');
  let usage: ExecutionBudgetUsage;
  try {
    assertPairExecutionBudgetLocked(cwd, state);
    usage = executionBudgetUsageFromTrace(cwd, state, { now });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordPairAutomationException(cwd, {
      kind: 'observability_gap',
      reason: `Coding approval budget preflight failed closed: ${message}`,
      currentUsage: {
        duration_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        reported_cost_usd: null,
        cost_status: 'unknown',
        pair_agent_calls: 0,
        pair_checkpoints: 0,
      },
      now,
    });
    throw new Error(`Coding approval blocked by observability gap: ${message}`);
  }
  const budget = evaluateExecutionBudget(
    state.pair_session.execution_budget,
    usage,
  );
  if (budget.level !== 'ok') {
    const trigger = (budget.level === 'hard' ? budget.hard : budget.soft)[0];
    if (!trigger) throw new Error('Coding approval budget has no trigger.');
    recordPairAutomationException(cwd, {
      kind:
        budget.level === 'hard'
          ? trigger.metric === 'pair_checkpoints'
            ? 'emergency_checkpoint_limit'
            : 'budget_hard_limit'
          : 'budget_soft_limit',
      reason: `Coding approval blocked by ${budget.level} budget: ${trigger.metric}=${trigger.actual}, approved=${trigger.limit}.`,
      currentUsage: usage,
      approvedLimit: trigger.limit,
      actualValue: trigger.actual,
      now,
    });
    throw new Error(
      `Coding approval blocked by ${budget.level} execution budget (${trigger.metric}).`,
    );
  }
  const generated = generateExecutionEvidence(cwd, workItem);
  const manifestContent = readFileSync(join(cwd, generated.manifestPath));
  const decisionPath = artifactRelativePath(
    state,
    `artifacts/05-code/${workItem.story_id}/coding-decision.json`,
  );
  const decision = {
    version: 1 as const,
    story_id: workItem.story_id,
    action: 'approve' as const,
    reason: reason.trim(),
    execution_manifest_path: generated.manifestPath,
    execution_manifest_sha256: digest(manifestContent),
    artifact_path: decisionPath,
    decided_by: 'human' as const,
    decided_at: now,
  };
  const absoluteDecisionPath = artifactPath(
    cwd,
    state,
    `artifacts/05-code/${workItem.story_id}/coding-decision.json`,
  );
  mkdirSync(dirname(absoluteDecisionPath), { recursive: true });
  writeFileSync(absoluteDecisionPath, `${JSON.stringify(decision, null, 2)}\n`);
  const approvedState = writeState(cwd, {
    ...state,
    pair_session: { ...state.pair_session, coding_decision: decision },
  });
  const item = completedItem(cwd, approvedState, now);
  const transitioned = transitionLoopState(
    approvedState,
    { to: 'showcase' },
    now,
  );
  return writeState(cwd, {
    ...transitioned,
    completed_work_items: [item],
    showcase_stage: 'setup',
    showcase_q2_observations: undefined,
    showcase_risk_decisions: undefined,
    showcase_product_observations: undefined,
    showcase_evaluation_observations: undefined,
  });
}
