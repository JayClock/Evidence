import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createExecutionBudgetEnvelope,
  executionBudgetEnvelopeMode,
  readExecutionBudgetPolicy,
  type ExecutionBudgetPolicySnapshot,
} from '../../capabilities/execution-budget/policy';
import { verifyNoModelImpactEvidence } from '../../capabilities/modeling-evidence/no-model-impact';
import {
  materializeFocusedCommands,
  materializeQualityGates,
  materializedProcessSha256,
  readTestProcess,
  testProcessDefinitionSha256,
} from '../../capabilities/test-process/catalog';
import {
  assertProjectHasTarget,
  assertTestProject,
  nxProject,
  readNxProjectCatalog,
  type NxProjectCatalog,
} from '../../capabilities/test-process/project-catalog';
import { createCodingGitBaseline } from '../../capabilities/worktree-protection/baseline';
import { readState } from '../../iteration/state-repository';
import type {
  TaskingCandidate,
  TestProcessSelection,
  WorkflowState,
} from '../../iteration/state';

export type ProjectCatalogLoader = typeof readNxProjectCatalog;

export interface DeskCheckBudgetPreview {
  policy_path: string;
  policy_sha256: string;
  mode: 'shadow' | 'enforced';
  expected_pair_agent_calls: number;
  max_pair_agent_calls: number | null;
  emergency_max_checkpoints: number;
  max_retries_per_failure_fingerprint: number;
  max_no_progress_checkpoints: number | null;
  activity_timeout_ms: number;
  command_timeout_ms: number;
  max_duration_ms: number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  max_reported_cost_usd: number | null;
}

export interface DeskCheckApprovalPreflight {
  git_baseline: string;
  budget_policy: ExecutionBudgetPolicySnapshot;
  budget_preview: DeskCheckBudgetPreview;
  project_catalogs: Readonly<Record<string, NxProjectCatalog>>;
}

export interface DeskCheckReviewOptions {
  loadProjectCatalog?: ProjectCatalogLoader;
  state?: WorkflowState;
}

interface VerifiedProcessMaterialization {
  catalog?: NxProjectCatalog;
  materialized_sha256: string;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertReviewState(state: WorkflowState): TaskingCandidate {
  if (
    state.loop !== 'tasking' ||
    state.tasking_stage !== 'desk_check' ||
    !state.tasking_candidate
  ) {
    throw new Error('A Tasking candidate must await Desk Check.');
  }
  return state.tasking_candidate;
}

function verifyModelDecision(cwd: string, state: WorkflowState): void {
  if (state.modeling_profile?.method === 'none') {
    verifyNoModelImpactEvidence(cwd, state);
    return;
  }
  const decision = state.model_decisions?.at(-1);
  if (!decision || decision.action !== 'confirm') {
    throw new Error('Tasking has no human-confirmed model decision.');
  }
  const path = join(cwd, decision.artifact_path);
  if (!existsSync(path)) {
    throw new Error(
      `Human model decision is missing: ${decision.artifact_path}.`,
    );
  }
  const challenge = state.model_challenges?.at(-1);
  const challengePath = join(cwd, decision.challenge_artifact_path);
  const expansionPath = state.model_expansion_path
    ? join(cwd, state.model_expansion_path)
    : undefined;
  const persisted = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const persistedChallenge = existsSync(challengePath)
    ? (JSON.parse(readFileSync(challengePath, 'utf8')) as unknown)
    : undefined;
  if (
    !challenge ||
    !expansionPath ||
    !existsSync(expansionPath) ||
    digest(readFileSync(expansionPath)) !== decision.model_expansion_sha256 ||
    challenge.artifact_path !== decision.challenge_artifact_path ||
    JSON.stringify(persistedChallenge) !== JSON.stringify(challenge) ||
    digest(readFileSync(challengePath)) !==
      decision.challenge_artifact_sha256 ||
    state.model_projection?.model_sha256 !== decision.projection_sha256 ||
    JSON.stringify(persisted) !== JSON.stringify(decision)
  ) {
    throw new Error(
      'The human model decision or its reviewed evidence drifted before Desk Check.',
    );
  }
}

function currentProjectCatalog(
  cwd: string,
  process: TestProcessSelection,
  loadProjectCatalog: ProjectCatalogLoader,
): NxProjectCatalog | undefined {
  if (process.project_ids.length === 0) {
    if (process.project_catalog_sha256) {
      throw new Error(
        `Non-Nx process has a project catalog hash: ${process.id}.`,
      );
    }
    return undefined;
  }
  const catalog = loadProjectCatalog(cwd, process.project_ids);
  if (
    !process.project_catalog_sha256 ||
    catalog.project_catalog_sha256 !== process.project_catalog_sha256
  ) {
    throw new Error(
      `Nx project catalog drifted before Desk Check: ${process.id}.`,
    );
  }
  return catalog;
}

function verifyProcessMaterialization(
  cwd: string,
  candidate: TaskingCandidate,
  process: TestProcessSelection,
  loadProjectCatalog: ProjectCatalogLoader,
): VerifiedProcessMaterialization {
  const definition = readTestProcess(join(cwd, process.path));
  const catalog = currentProjectCatalog(cwd, process, loadProjectCatalog);
  const tests = candidate.tests.filter(
    ({ process_id }) => process_id === process.id,
  );
  const bindings = tests.map((test) => {
    const variables = process.command_variables_by_test[test.id];
    if (!variables) {
      throw new Error(`${test.id} has no locked focused-command variables.`);
    }
    const step = definition.steps.find(({ id }) => id === test.step_id);
    if (!step) throw new Error(`${test.id} references a missing process step.`);
    if (test.project_id) {
      if (!catalog || variables.project !== test.project_id) {
        throw new Error(`${test.id} Nx project binding drifted.`);
      }
      assertTestProject(catalog, test.project_id, step.nearest_test.roots);
    } else if (variables.project !== undefined) {
      throw new Error(`${test.id} unexpectedly materialized an Nx project.`);
    }
    return { test_id: test.id, step_id: test.step_id, variables };
  });
  const focusedCommands = materializeFocusedCommands(definition, bindings);
  const testProjectIds = tests.flatMap(({ project_id }) =>
    project_id ? [project_id] : [],
  );
  if (catalog) {
    for (const gate of definition.quality_gates) {
      if (gate.scope === 'process') continue;
      const target = gate.required_target;
      if (!target) throw new Error(`${process.id} quality gate has no target.`);
      const projectIds =
        gate.scope === 'test_projects'
          ? [...new Set(testProjectIds)]
          : process.project_ids;
      for (const projectId of projectIds) {
        assertProjectHasTarget(nxProject(catalog, projectId), target);
      }
    }
  }
  const qualityGateCommands = materializeQualityGates(
    definition,
    process.project_ids,
    testProjectIds,
  );
  const materializedSha256 = materializedProcessSha256({
    processId: process.id,
    definitionSha256: process.definition_sha256,
    projectIds: process.project_ids,
    projectCatalogSha256: process.project_catalog_sha256,
    commandVariablesByTest: process.command_variables_by_test,
    focusedCommands,
    qualityGateCommands,
  });
  if (
    process.process_version !== 3 ||
    JSON.stringify(focusedCommands) !==
      JSON.stringify(process.focused_commands) ||
    JSON.stringify(qualityGateCommands) !==
      JSON.stringify(process.quality_gate_commands) ||
    materializedSha256 !== process.materialized_sha256
  ) {
    throw new Error(
      `Test process materialization drifted before Desk Check: ${process.id}.`,
    );
  }
  return { catalog, materialized_sha256: materializedSha256 };
}

function traceability(candidate: TaskingCandidate, state: WorkflowState) {
  const scenarioOutcomes = (state.confirmed_scenarios ?? []).flatMap(
    (scenario) =>
      scenario.then.map((outcome) => `${scenario.scenario_id}\u0000${outcome}`),
  );
  const coveredOutcomes = new Set(
    candidate.tests
      .filter(({ quadrant }) => quadrant === 'Q2')
      .flatMap((test) =>
        test.scenario_outcome
          ? test.scenario_ids.map(
              (scenarioId) => `${scenarioId}\u0000${test.scenario_outcome}`,
            )
          : [],
      ),
  );
  const taskMembership = new Map<string, number>();
  for (const task of candidate.tasks) {
    for (const testId of task.test_ids) {
      taskMembership.set(testId, (taskMembership.get(testId) ?? 0) + 1);
    }
  }
  return {
    scenario_outcome_count: scenarioOutcomes.length,
    q1_count: candidate.tests.filter(({ quadrant }) => quadrant === 'Q1')
      .length,
    q2_count: candidate.tests.filter(({ quadrant }) => quadrant === 'Q2')
      .length,
    test_count: candidate.tests.length,
    task_count: candidate.tasks.length,
    every_then_has_q2: scenarioOutcomes.every((outcome) =>
      coveredOutcomes.has(outcome),
    ),
    every_test_has_one_task: candidate.tests.every(
      ({ id }) => taskMembership.get(id) === 1,
    ),
  };
}

function verifyCandidate(
  cwd: string,
  state: WorkflowState,
  candidate: TaskingCandidate,
  loadProjectCatalog: ProjectCatalogLoader,
): Record<string, NxProjectCatalog> {
  const testList = readFileSync(join(cwd, candidate.test_list_path), 'utf8');
  const taskList = readFileSync(join(cwd, candidate.task_list_path), 'utf8');
  if (
    digest(testList) !== candidate.test_list_sha256 ||
    digest(taskList) !== candidate.task_list_sha256
  ) {
    throw new Error(
      'The human-edited test/task list must be regenerated before approval.',
    );
  }
  const document = JSON.parse(
    readFileSync(join(cwd, candidate.candidate_path), 'utf8'),
  ) as TaskingCandidate;
  const { candidate_sha256: ignored, ...base } = document;
  void ignored;
  if (
    document.candidate_sha256 !== digest(JSON.stringify(base)) ||
    JSON.stringify(document) !== JSON.stringify(candidate)
  ) {
    throw new Error('The Tasking candidate changed after generation.');
  }
  const candidateTraceability = traceability(candidate, state);
  if (
    !candidateTraceability.every_then_has_q2 ||
    !candidateTraceability.every_test_has_one_task
  ) {
    throw new Error(
      'The Tasking candidate no longer has complete Scenario and TASK traceability.',
    );
  }
  const projectCatalogs: Record<string, NxProjectCatalog> = {};
  for (const process of candidate.processes) {
    if (
      process.process_version !== 3 ||
      !process.definition_sha256 ||
      testProcessDefinitionSha256(join(cwd, process.path)) !==
        process.definition_sha256
    ) {
      throw new Error(
        `Test process definition drifted before Desk Check: ${process.id}.`,
      );
    }
    const materialized = verifyProcessMaterialization(
      cwd,
      candidate,
      process,
      loadProjectCatalog,
    );
    if (materialized.catalog) {
      projectCatalogs[process.id] = materialized.catalog;
    }
  }
  return projectCatalogs;
}

function verifyGitBaseline(cwd: string, state: WorkflowState): string {
  const baseline = createCodingGitBaseline(cwd);
  const modelingConfirmed =
    state.modeling_profile?.method === 'none'
      ? state.modeling_profile.model_change_required === false &&
        !state.model_change_proposal
      : state.model_decisions?.at(-1)?.action === 'confirm';
  if (
    state.model_git_baseline !== baseline ||
    !modelingConfirmed ||
    state.modeling_profile?.model_change_required !==
      Boolean(state.model_change_proposal)
  ) {
    throw new Error(
      'Desk Check approval requires confirmed modeling evidence on the same Git baseline.',
    );
  }
  return baseline;
}

function budgetPreview(
  snapshot: ExecutionBudgetPolicySnapshot,
  candidate: TaskingCandidate,
): DeskCheckBudgetPreview {
  const envelope = createExecutionBudgetEnvelope(snapshot, {
    testCount: candidate.tests.length,
    selectedProcessStepCount: candidate.processes.reduce(
      (count, process) => count + process.selected_step_ids.length,
      0,
    ),
    approvedAt: '1970-01-01T00:00:00.000Z',
  });
  return {
    policy_path: envelope.policy_path,
    policy_sha256: envelope.policy_sha256,
    mode: executionBudgetEnvelopeMode(envelope),
    expected_pair_agent_calls: envelope.expected_pair_agent_calls,
    max_pair_agent_calls: envelope.max_pair_agent_calls,
    emergency_max_checkpoints: envelope.emergency_max_checkpoints,
    max_retries_per_failure_fingerprint:
      envelope.max_retries_per_failure_fingerprint,
    max_no_progress_checkpoints: envelope.max_no_progress_checkpoints,
    activity_timeout_ms: envelope.activity_timeout_ms,
    command_timeout_ms: envelope.command_timeout_ms,
    max_duration_ms: envelope.max_duration_ms,
    max_input_tokens: envelope.max_input_tokens,
    max_output_tokens: envelope.max_output_tokens,
    max_reported_cost_usd: envelope.max_reported_cost_usd,
  };
}

/** Run every approval guard and return only values safe for the write phase. */
export function assertDeskCheckApprovalReady(
  cwd: string,
  options: DeskCheckReviewOptions = {},
): DeskCheckApprovalPreflight {
  const state = options.state ?? readState(cwd);
  const candidate = assertReviewState(state);
  const loadProjectCatalog = options.loadProjectCatalog ?? readNxProjectCatalog;
  const projectCatalogs = verifyCandidate(
    cwd,
    state,
    candidate,
    loadProjectCatalog,
  );
  verifyModelDecision(cwd, state);
  const gitBaseline = verifyGitBaseline(cwd, state);
  const budgetPolicy = readExecutionBudgetPolicy(cwd);
  return {
    git_baseline: gitBaseline,
    budget_policy: budgetPolicy,
    budget_preview: budgetPreview(budgetPolicy, candidate),
    project_catalogs: Object.freeze(projectCatalogs),
  };
}
