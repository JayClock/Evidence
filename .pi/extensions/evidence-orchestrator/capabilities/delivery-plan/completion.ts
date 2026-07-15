import { createHash } from 'node:crypto';
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

function completedItem(
  cwd: string,
  state: WorkflowState,
  now: string,
): CompletedWorkItem {
  const scenarios =
    state.confirmed_scenarios ??
    (state.confirmed_scenario ? [state.confirmed_scenario] : []);
  const scenario = scenarios[0];
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
    scenario_id: workItem.scenario_id,
    scenarios,
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

/** Human decision at the boundary between a completed Story and its iteration Showcase. */
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
  if (action !== 'showcase') {
    throw new Error(`Unsupported Story completion decision: ${action}.`);
  }
  if (!reason.trim())
    throw new Error('A Story completion decision requires a reason.');

  const item = completedItem(cwd, state, now);
  const completed = appendCompleted(state, item);
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
