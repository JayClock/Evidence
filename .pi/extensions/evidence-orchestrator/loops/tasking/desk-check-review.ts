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

export type DeskCheckReviewStatus = 'pass' | 'warning' | 'blocked';

export interface DeskCheckReviewCheck {
  id: 'candidate' | 'model' | 'git_baseline' | 'budget_policy';
  status: DeskCheckReviewStatus;
  detail: string;
}

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

export interface DeskCheckReview {
  version: 1;
  iteration_id: string;
  story_id: string;
  scenario_ids: string[];
  draft_id: string;
  candidate_sha256: string;
  subject_sha256: string;
  acceptance: {
    scenarios: Array<{
      scenario_id: string;
      title: string;
      then: string[];
      business_data: string[];
      artifact_path: string;
    }>;
  };
  model: {
    profile: string;
    model_change_required: boolean;
    expansion_path: string;
    decision_path: string;
    challenge_path?: string;
    projection_sha256?: string;
  };
  traceability: {
    scenario_outcome_count: number;
    q1_count: number;
    q2_count: number;
    test_count: number;
    task_count: number;
    every_then_has_q2: boolean;
    every_test_has_one_task: boolean;
  };
  processes: Array<{
    id: string;
    runtime: string;
    process_version: 3;
    selected_step_ids: string[];
    project_ids: string[];
    functional_contexts: string[];
    technical_boundaries: string[];
    focused_command_count: number;
    quality_gate_count: number;
    definition_sha256: string;
    materialized_sha256: string;
    project_catalog_sha256?: string;
    path: string;
  }>;
  commands: {
    focused: string[];
    quality_gates: string[];
  };
  budget_preview?: DeskCheckBudgetPreview;
  checks: DeskCheckReviewCheck[];
  evidence_refs: Array<{ label: string; path: string; sha256?: string }>;
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

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function observedFileSha256(cwd: string, path: string | undefined): string {
  if (!path) return 'missing:path';
  try {
    return digest(readFileSync(join(cwd, path)));
  } catch (error) {
    return `unavailable:${errorMessage(error)}`;
  }
}

function observedProcessFacts(
  cwd: string,
  candidate: TaskingCandidate,
  loadProjectCatalog: ProjectCatalogLoader,
) {
  return [...candidate.processes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((process) => {
      let definitionSha256: string;
      try {
        definitionSha256 = testProcessDefinitionSha256(join(cwd, process.path));
      } catch (error) {
        definitionSha256 = `unavailable:${errorMessage(error)}`;
      }
      let projectCatalogSha256: string | null = null;
      if (process.project_ids.length > 0) {
        try {
          projectCatalogSha256 = loadProjectCatalog(
            cwd,
            process.project_ids,
          ).project_catalog_sha256;
        } catch (error) {
          projectCatalogSha256 = `unavailable:${errorMessage(error)}`;
        }
      }
      let materializedSha256: string;
      try {
        materializedSha256 = verifyProcessMaterialization(
          cwd,
          candidate,
          process,
          loadProjectCatalog,
        ).materialized_sha256;
      } catch (error) {
        materializedSha256 = `unavailable:${errorMessage(error)}`;
      }
      return {
        id: process.id,
        expected_definition_sha256: process.definition_sha256,
        observed_definition_sha256: definitionSha256,
        expected_materialized_sha256: process.materialized_sha256,
        observed_materialized_sha256: materializedSha256,
        expected_project_catalog_sha256: process.project_catalog_sha256 ?? null,
        observed_project_catalog_sha256: projectCatalogSha256,
      };
    });
}

function subjectSha256(
  cwd: string,
  state: WorkflowState,
  candidate: TaskingCandidate,
  loadProjectCatalog: ProjectCatalogLoader,
): string {
  let budgetPolicySha256: string;
  try {
    budgetPolicySha256 = readExecutionBudgetPolicy(cwd).sha256;
  } catch (error) {
    budgetPolicySha256 = `unavailable:${errorMessage(error)}`;
  }
  let gitHead: string;
  let codeWorktreeClean = true;
  try {
    gitHead = createCodingGitBaseline(cwd);
  } catch (error) {
    gitHead = `unavailable:${errorMessage(error)}`;
    codeWorktreeClean = false;
  }
  const decision = state.model_decisions?.at(-1);
  const challenge = state.model_challenges?.at(-1);
  const scenarioFacts = (state.confirmed_scenarios ?? [])
    .map((scenario) => ({
      scenario_id: scenario.scenario_id,
      title: scenario.title,
      given: scenario.given,
      when: scenario.when,
      then: scenario.then,
      business_data: scenario.business_data,
      artifact_path: scenario.artifact_path,
      artifact_sha256: observedFileSha256(cwd, scenario.artifact_path),
    }))
    .sort((left, right) => left.scenario_id.localeCompare(right.scenario_id));
  return digest(
    canonicalJson({
      iteration_id: state.iteration_id,
      loop: 'tasking',
      tasking_stage: 'desk_check',
      candidate_sha256: candidate.candidate_sha256,
      candidate_state_sha256: digest(canonicalJson(candidate)),
      candidate_artifact_sha256: observedFileSha256(
        cwd,
        candidate.candidate_path,
      ),
      test_list_sha256: observedFileSha256(cwd, candidate.test_list_path),
      task_list_sha256: observedFileSha256(cwd, candidate.task_list_path),
      scenario_facts: scenarioFacts,
      modeling_profile: state.modeling_profile ?? null,
      model_expansion_sha256: observedFileSha256(
        cwd,
        state.model_expansion_path,
      ),
      model_decision_state: decision ?? null,
      model_decision_sha256: observedFileSha256(cwd, decision?.artifact_path),
      model_challenge_state: challenge ?? null,
      model_challenge_sha256: observedFileSha256(cwd, challenge?.artifact_path),
      processes: observedProcessFacts(cwd, candidate, loadProjectCatalog),
      budget_policy_sha256: budgetPolicySha256,
      git_head: gitHead,
      code_worktree_clean: codeWorktreeClean,
    }),
  );
}

function evidenceReferences(
  cwd: string,
  state: WorkflowState,
  candidate: TaskingCandidate,
  budget?: DeskCheckBudgetPreview,
): DeskCheckReview['evidence_refs'] {
  const references: DeskCheckReview['evidence_refs'] = [];
  const add = (label: string, path: string | undefined, sha256?: string) => {
    if (!path || references.some((reference) => reference.label === label)) {
      return;
    }
    references.push({
      label,
      path,
      ...(sha256 && /^[a-f0-9]{64}$/.test(sha256) ? { sha256 } : {}),
    });
  };
  add(
    'Tasking candidate',
    candidate.candidate_path,
    observedFileSha256(cwd, candidate.candidate_path),
  );
  add('Test list', candidate.test_list_path, candidate.test_list_sha256);
  add('Task list', candidate.task_list_path, candidate.task_list_sha256);
  for (const scenario of [...(state.confirmed_scenarios ?? [])].sort((a, b) =>
    a.scenario_id.localeCompare(b.scenario_id),
  )) {
    add(
      `Scenario ${scenario.scenario_id}`,
      scenario.artifact_path,
      observedFileSha256(cwd, scenario.artifact_path),
    );
  }
  add(
    'Model expansion',
    state.model_expansion_path,
    observedFileSha256(cwd, state.model_expansion_path),
  );
  const decision = state.model_decisions?.at(-1);
  const challenge = state.model_challenges?.at(-1);
  add(
    'Model decision',
    decision?.artifact_path,
    observedFileSha256(cwd, decision?.artifact_path),
  );
  add(
    'Model challenge',
    challenge?.artifact_path,
    observedFileSha256(cwd, challenge?.artifact_path),
  );
  for (const process of [...candidate.processes].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    add(`Process ${process.id}`, process.path, process.definition_sha256);
    add(
      `Project catalog ${process.id}`,
      process.project_catalog_path,
      process.project_catalog_sha256,
    );
  }
  add(
    'Execution budget policy',
    budget?.policy_path ??
      'engineering/evidence-orchestrator/execution-budget.json',
    budget?.policy_sha256,
  );
  return references;
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

/** Build a UI-neutral, read-only snapshot of the pending Desk Check authority. */
export function inspectDeskCheck(
  cwd: string,
  options: DeskCheckReviewOptions = {},
): DeskCheckReview {
  const state = options.state ?? readState(cwd);
  const candidate = assertReviewState(state);
  const loadProjectCatalog = options.loadProjectCatalog ?? readNxProjectCatalog;
  const candidateTraceability = traceability(candidate, state);
  const checks: DeskCheckReviewCheck[] = [];

  try {
    verifyCandidate(cwd, state, candidate, loadProjectCatalog);
    checks.push({
      id: 'candidate',
      status: 'pass',
      detail: `${candidate.tests.length} TEST(s) map to ${candidate.tasks.length} ordered TASK(s), with every Scenario outcome covered by Q2.`,
    });
  } catch (error) {
    checks.push({
      id: 'candidate',
      status: 'blocked',
      detail: errorMessage(error),
    });
  }

  try {
    verifyModelDecision(cwd, state);
    checks.push({
      id: 'model',
      status: 'pass',
      detail:
        state.modeling_profile?.method === 'none'
          ? 'The deterministic no-model-impact decision is intact.'
          : 'The human-confirmed model decision and reviewed evidence are intact.',
    });
  } catch (error) {
    checks.push({
      id: 'model',
      status: 'blocked',
      detail: errorMessage(error),
    });
  }

  try {
    const baseline = verifyGitBaseline(cwd, state);
    checks.push({
      id: 'git_baseline',
      status: 'pass',
      detail: `Coding paths are clean on Git ${baseline.slice(0, 12)}, matching the confirmed modeling baseline.`,
    });
  } catch (error) {
    checks.push({
      id: 'git_baseline',
      status: 'blocked',
      detail: errorMessage(error),
    });
  }

  let preview: DeskCheckBudgetPreview | undefined;
  try {
    const snapshot = readExecutionBudgetPolicy(cwd);
    preview = budgetPreview(snapshot, candidate);
    checks.push({
      id: 'budget_policy',
      status: preview.mode === 'shadow' ? 'warning' : 'pass',
      detail:
        preview.mode === 'shadow'
          ? 'Execution budget policy is valid, but one or more hard limits are shadow-only (null).'
          : 'Execution budget policy is valid and every Pair hard limit is enforced.',
    });
  } catch (error) {
    checks.push({
      id: 'budget_policy',
      status: 'blocked',
      detail: errorMessage(error),
    });
  }

  const processes = [...candidate.processes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((process) => ({
      id: process.id,
      runtime: process.runtime,
      process_version: process.process_version,
      selected_step_ids: [...process.selected_step_ids],
      project_ids: [...process.project_ids],
      functional_contexts: [...process.functional_contexts],
      technical_boundaries: [...process.technical_boundaries],
      focused_command_count: process.focused_commands.length,
      quality_gate_count: process.quality_gate_commands.length,
      definition_sha256: process.definition_sha256,
      materialized_sha256: process.materialized_sha256,
      ...(process.project_catalog_sha256
        ? { project_catalog_sha256: process.project_catalog_sha256 }
        : {}),
      path: process.path,
    }));
  const orderedProcesses = [...candidate.processes].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const decision = state.model_decisions?.at(-1);
  const challenge = state.model_challenges?.at(-1);

  return {
    version: 1,
    iteration_id: state.iteration_id,
    story_id: candidate.story_id,
    scenario_ids: [...candidate.scenario_ids],
    draft_id: candidate.draft_id,
    candidate_sha256: candidate.candidate_sha256,
    subject_sha256: subjectSha256(cwd, state, candidate, loadProjectCatalog),
    acceptance: {
      scenarios: [...(state.confirmed_scenarios ?? [])]
        .sort((left, right) =>
          left.scenario_id.localeCompare(right.scenario_id),
        )
        .map((scenario) => ({
          scenario_id: scenario.scenario_id,
          title: scenario.title,
          then: [...scenario.then],
          business_data: [...scenario.business_data],
          artifact_path: scenario.artifact_path,
        })),
    },
    model: {
      profile: `${state.modeling_profile?.subject ?? 'unknown'}/${state.modeling_profile?.method ?? 'unknown'}`,
      model_change_required:
        state.modeling_profile?.model_change_required ?? false,
      expansion_path: state.model_expansion_path ?? 'missing',
      decision_path:
        decision?.artifact_path ?? state.model_expansion_path ?? 'missing',
      ...(challenge?.artifact_path
        ? { challenge_path: challenge.artifact_path }
        : {}),
      ...(state.model_projection?.model_sha256
        ? { projection_sha256: state.model_projection.model_sha256 }
        : {}),
    },
    traceability: candidateTraceability,
    processes,
    commands: {
      focused: orderedProcesses.flatMap((process) =>
        process.focused_commands.map(({ command }) => command),
      ),
      quality_gates: orderedProcesses.flatMap((process) =>
        process.quality_gate_commands.map(({ command }) => command),
      ),
    },
    ...(preview ? { budget_preview: preview } : {}),
    checks,
    evidence_refs: evidenceReferences(cwd, state, candidate, preview),
  };
}
