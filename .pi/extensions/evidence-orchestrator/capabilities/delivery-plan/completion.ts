import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateExecutionEvidence } from '../execution-evidence/manifest';
import { transitionLoopState } from '../../iteration/transition-graph';
import { readState, writeState } from '../../iteration/state-repository';
import type {
  CompletedWorkItem,
  DeliveryIncrementAction,
  WorkflowState,
} from '../../iteration/state';

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireCleanCheckpoint(cwd: string): void {
  const dirty = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd, encoding: 'utf8' },
  ).trim();
  if (dirty) {
    throw new Error(
      'Continuing the delivery iteration requires a human-owned Git checkpoint. Commit the completed slice first; the orchestrator will use that commit as the next Scenario baseline.',
    );
  }
}

function completedItem(
  cwd: string,
  state: WorkflowState,
  now: string,
): CompletedWorkItem {
  const scenario = state.confirmed_scenario;
  const workItem = state.active_work_item;
  const tasking = state.tasking_candidate;
  const pair = state.pair_session;
  const modelDecision = state.model_decisions?.at(-1);
  if (
    !scenario ||
    !workItem ||
    !tasking ||
    !pair ||
    pair.checkpoint !== 'quality_gates_passed' ||
    !state.approved_test_plan_path ||
    !state.approved_test_plan_sha256 ||
    !state.model_expansion_path ||
    !modelDecision ||
    modelDecision.action !== 'confirm'
  ) {
    throw new Error(
      'A delivery decision requires one fully completed Scenario slice.',
    );
  }
  const generated = generateExecutionEvidence(cwd, workItem);
  const manifest = generated.manifest;
  const executionManifestPath = generated.manifestPath;
  const absoluteManifest = join(cwd, executionManifestPath);
  return {
    version: 1,
    story_id: workItem.story_id,
    scenario_id: workItem.scenario_id,
    scenario,
    work_item: workItem,
    tasking,
    pair,
    approved_test_plan_path: state.approved_test_plan_path,
    approved_test_plan_sha256: state.approved_test_plan_sha256,
    model_expansion_path: state.model_expansion_path,
    model_decision_path: modelDecision.artifact_path,
    execution_manifest_path: executionManifestPath,
    execution_manifest_sha256: digest(readFileSync(absoluteManifest)),
    completed_at: manifest.source.completed_at || now,
  };
}

function appendCompleted(
  state: WorkflowState,
  item: CompletedWorkItem,
): CompletedWorkItem[] {
  const prior = state.completed_work_items ?? [];
  if (
    prior.some(
      ({ story_id, scenario_id }) =>
        story_id === item.story_id && scenario_id === item.scenario_id,
    )
  ) {
    return prior;
  }
  return [...prior, item];
}

function clearSlice(state: WorkflowState): Partial<WorkflowState> {
  return {
    ...state,
    scenario_drafts: undefined,
    confirmed_scenario: undefined,
    modeling_stage: undefined,
    modeling_profile_proposal: undefined,
    modeling_profile: undefined,
    model_expansion_path: undefined,
    model_git_baseline: undefined,
    model_change_proposal: undefined,
    model_change_application: undefined,
    model_projection: undefined,
    model_challenges: undefined,
    tasking_stage: undefined,
    tasking_candidate: undefined,
    tasking_gap: undefined,
    approved_test_plan_path: undefined,
    approved_test_plan_sha256: undefined,
    active_work_item: undefined,
    pair_session: undefined,
  };
}

/** Human decision at the boundary between a completed acceptance slice and iteration Showcase. */
export function decideDeliveryIncrement(
  cwd: string,
  action: DeliveryIncrementAction,
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'pair' ||
    state.pair_session?.checkpoint !== 'quality_gates_passed'
  ) {
    throw new Error(
      'A delivery increment decision is available only after all Pair quality gates pass.',
    );
  }
  if (!['continue_story', 'next_story', 'showcase'].includes(action)) {
    throw new Error(`Unsupported delivery increment decision: ${action}.`);
  }
  if (!reason.trim())
    throw new Error('A delivery increment decision requires a reason.');
  if (action !== 'showcase') requireCleanCheckpoint(cwd);

  const item = completedItem(cwd, state, now);
  const completed = appendCompleted(state, item);
  if (action === 'showcase') {
    const transitioned = transitionLoopState(state, { to: 'showcase' }, now);
    return writeState(cwd, {
      ...transitioned,
      completed_work_items: completed,
      showcase_stage: 'setup',
      showcase_q2_observations: undefined,
      showcase_risk_decisions: undefined,
      showcase_product_observations: undefined,
      showcase_evaluation_observations: undefined,
    });
  }

  const cleared = clearSlice(state);
  if (action === 'continue_story') {
    return writeState(cwd, {
      ...cleared,
      loop: 'understand',
      completed_work_items: completed,
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: item.story_id,
        selected_at: now,
      },
      kickoff_candidate: undefined,
    } as WorkflowState);
  }
  return writeState(cwd, {
    ...cleared,
    loop: 'kickoff',
    completed_work_items: completed,
    kickoff_candidate: undefined,
    understand_stage: undefined,
    active_clarification_story: undefined,
  } as WorkflowState);
}
