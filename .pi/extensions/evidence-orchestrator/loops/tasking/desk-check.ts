import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { verifyNoModelImpactEvidence } from '../../capabilities/modeling-evidence/no-model-impact';
import { createCodingGitBaseline } from '../../capabilities/worktree-protection/baseline';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { transitionLoopState } from '../../iteration/transition-graph';
import { applyModelChangeProposal } from '../understand/public';
import { readState, writeState } from '../../iteration/state-repository';
import type {
  DeskCheckAction,
  DeskCheckDecision,
  TaskingCandidate,
  TestProcessSelection,
  WorkflowState,
} from '../../iteration/state';
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
  serializeNxProjectCatalog,
  type NxProjectCatalog,
} from '../../capabilities/test-process/project-catalog';

type ProjectCatalogLoader = typeof readNxProjectCatalog;

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function immutableWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, 'utf8') !== content) {
    throw new Error(`Approved test-plan artifact is immutable: ${path}.`);
  }
  if (!existsSync(path)) writeFileSync(path, content);
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
): void {
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
}

function verifyCandidate(
  cwd: string,
  candidate: TaskingCandidate,
  loadProjectCatalog: ProjectCatalogLoader,
): void {
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
    verifyProcessMaterialization(cwd, candidate, process, loadProjectCatalog);
  }
}

function lockApprovedProcesses(
  cwd: string,
  state: WorkflowState,
  candidate: TaskingCandidate,
  loadProjectCatalog: ProjectCatalogLoader,
): TestProcessSelection[] {
  return candidate.processes.map((process) => {
    const source = join(cwd, process.path);
    const firstDefinitionRelative = `artifacts/03-architecture/selected-test-processes/${process.id}.json`;
    const firstDefinitionPath = artifactPath(
      cwd,
      state,
      firstDefinitionRelative,
    );
    const definitionContent = readFileSync(source, 'utf8');
    const definitionRelative =
      existsSync(firstDefinitionPath) &&
      readFileSync(firstDefinitionPath, 'utf8') !== definitionContent
        ? `artifacts/03-architecture/selected-test-processes/${process.id}-${candidate.draft_id}.json`
        : firstDefinitionRelative;
    immutableWrite(
      artifactPath(cwd, state, definitionRelative),
      definitionContent,
    );
    const catalog = currentProjectCatalog(cwd, process, loadProjectCatalog);
    let projectCatalogPath: string | undefined;
    if (catalog) {
      const catalogRelative = `artifacts/03-architecture/project-catalogs/${process.id}-${catalog.project_catalog_sha256}.json`;
      immutableWrite(
        artifactPath(cwd, state, catalogRelative),
        serializeNxProjectCatalog(catalog),
      );
      projectCatalogPath = artifactRelativePath(state, catalogRelative);
    }
    const lockedBase: TestProcessSelection = {
      ...process,
      path: artifactRelativePath(state, definitionRelative),
      ...(projectCatalogPath
        ? { project_catalog_path: projectCatalogPath }
        : {}),
    };
    const plan = {
      version: 3,
      story_id: candidate.story_id,
      scenario_ids: candidate.scenario_ids,
      process_id: lockedBase.id,
      process_path: lockedBase.path,
      definition_sha256: lockedBase.definition_sha256,
      runtime: lockedBase.runtime,
      functional_contexts: lockedBase.functional_contexts,
      technical_boundaries: lockedBase.technical_boundaries,
      selected_step_ids: lockedBase.selected_step_ids,
      project_ids: lockedBase.project_ids,
      ...(lockedBase.project_catalog_sha256
        ? {
            project_catalog_sha256: lockedBase.project_catalog_sha256,
            project_catalog_path: lockedBase.project_catalog_path,
          }
        : {}),
      command_variables_by_test: lockedBase.command_variables_by_test,
      focused_commands: lockedBase.focused_commands,
      quality_gate_commands: lockedBase.quality_gate_commands,
      materialized_sha256: lockedBase.materialized_sha256,
    };
    const planContent = `${JSON.stringify(plan, null, 2)}\n`;
    const firstPlanRelative = `artifacts/04-planning/test-plans/${candidate.story_id}-${process.id}.json`;
    const firstPlanPath = artifactPath(cwd, state, firstPlanRelative);
    const planRelative =
      existsSync(firstPlanPath) &&
      readFileSync(firstPlanPath, 'utf8') !== planContent
        ? `artifacts/04-planning/test-plans/${candidate.story_id}-${candidate.draft_id}-${process.id}.json`
        : firstPlanRelative;
    const locked: TestProcessSelection = {
      ...lockedBase,
      materialized_plan_path: artifactRelativePath(state, planRelative),
    };
    immutableWrite(artifactPath(cwd, state, planRelative), planContent);
    return locked;
  });
}

function decisionRecord(
  state: WorkflowState,
  action: DeskCheckAction,
  reason: string | undefined,
  now: string,
): DeskCheckDecision {
  const sequence = (state.desk_check_decisions?.length ?? 0) + 1;
  return {
    action,
    ...(reason ? { reason } : {}),
    ...(state.tasking_candidate
      ? {
          draft_id: state.tasking_candidate.draft_id,
          candidate_sha256: state.tasking_candidate.candidate_sha256,
        }
      : {}),
    decided_by: 'human',
    artifact_path: artifactRelativePath(
      state,
      `artifacts/04-planning/desk-checks/DESK-${String(sequence).padStart(3, '0')}.json`,
    ),
    decided_at: now,
  };
}

function persistDecision(cwd: string, decision: DeskCheckDecision): void {
  immutableWrite(
    join(cwd, decision.artifact_path),
    `${JSON.stringify(decision, null, 2)}\n`,
  );
}

/** Apply the sole human Desk Check decision and route its knowledge feedback. */
export function decideTasking(
  cwd: string,
  action: DeskCheckAction,
  reason?: string,
  now = new Date().toISOString(),
  loadProjectCatalog: ProjectCatalogLoader = readNxProjectCatalog,
): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'tasking' ||
    state.tasking_stage !== 'desk_check' ||
    !state.tasking_candidate
  ) {
    throw new Error('A Tasking candidate must await Desk Check.');
  }
  if (
    ![
      'approve',
      'revise',
      'architecture_gap',
      'process_gap',
      'scenario_gap',
    ].includes(action)
  ) {
    throw new Error(`Unsupported Desk Check action: ${action}.`);
  }
  const normalizedReason = reason?.trim() || undefined;
  if (action !== 'approve' && !normalizedReason) {
    throw new Error(`Desk Check ${action} requires a reason.`);
  }
  const decision = decisionRecord(state, action, normalizedReason, now);
  const decisions = [...(state.desk_check_decisions ?? []), decision];

  if (action === 'approve') {
    verifyCandidate(cwd, state.tasking_candidate, loadProjectCatalog);
    verifyModelDecision(cwd, state);
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
    const processes = lockApprovedProcesses(
      cwd,
      state,
      state.tasking_candidate,
      loadProjectCatalog,
    );
    const firstApprovedRelative = 'artifacts/04-planning/test-plan.json';
    const approvedRelative = existsSync(
      artifactPath(cwd, state, firstApprovedRelative),
    )
      ? `artifacts/04-planning/test-plans/${state.tasking_candidate.story_id}-${state.tasking_candidate.draft_id}.approved.json`
      : firstApprovedRelative;
    const approvedPath = artifactRelativePath(state, approvedRelative);
    const approvedPlan = {
      version: 2,
      story_id: state.tasking_candidate.story_id,
      scenario_ids: state.tasking_candidate.scenario_ids,
      approved_by: 'human',
      approved_at: now,
      ...(normalizedReason ? { approval_reason: normalizedReason } : {}),
      candidate_sha256: state.tasking_candidate.candidate_sha256,
      test_list_path: state.tasking_candidate.test_list_path,
      task_list_path: state.tasking_candidate.task_list_path,
      tests: state.tasking_candidate.tests,
      tasks: state.tasking_candidate.tasks,
      processes,
    };
    const approvedPlanContent = `${JSON.stringify(approvedPlan, null, 2)}\n`;
    immutableWrite(
      artifactPath(cwd, state, approvedRelative),
      approvedPlanContent,
    );
    const stateWithAppliedModel = state.model_change_proposal
      ? applyModelChangeProposal(cwd, now)
      : state;
    persistDecision(cwd, decision);
    const firstTask = state.tasking_candidate.tasks[0];
    const firstTest = state.tasking_candidate.tests.find(
      ({ id }) => id === firstTask?.test_ids[0],
    );
    const firstProcess = processes.find(
      ({ id }) => id === firstTest?.process_id,
    );
    if (!firstTask || !firstTest || !firstProcess) {
      throw new Error('Approved Tasking has no first TASK/TEST Pair unit.');
    }
    const expectedRed = firstTest.intent;
    const approved = {
      ...stateWithAppliedModel,
      tasking_stage: 'approved' as const,
      tasking_gap: undefined,
      desk_check_decisions: decisions,
      approved_test_plan_path: approvedPath,
      approved_test_plan_sha256: digest(approvedPlanContent),
      active_work_item: {
        story_id: state.tasking_candidate.story_id,
        scenario_ids: state.tasking_candidate.scenario_ids,
        git_baseline: baseline,
        test_plan: {
          version: 2 as const,
          processes,
        },
      },
      pair_session: {
        version: 2 as const,
        story_id: state.tasking_candidate.story_id,
        scenario_ids: state.tasking_candidate.scenario_ids,
        git_baseline: baseline,
        checkpoint: 'plan_confirmed' as const,
        task_id: firstTask.id,
        test_id: firstTest.id,
        process_id: firstProcess.id,
        step_id: firstTest.step_id,
        completed_task_ids: [],
        completed_test_ids: [],
        completed_step_ids: [],
        test_paths: [],
        production_paths: [],
        expected_red: expectedRed,
        accepted_reds: [],
        quality_gate_index: 0,
        feedback: [],
        driver_history: [],
      },
    };
    return writeState(cwd, transitionLoopState(approved, { to: 'pair' }, now));
  }

  persistDecision(cwd, decision);
  if (!normalizedReason) {
    throw new Error(`Desk Check ${action} requires a reason.`);
  }
  if (action === 'revise') {
    return writeState(cwd, {
      ...state,
      tasking_stage: 'drafting',
      tasking_candidate: undefined,
      tasking_gap: undefined,
      desk_check_decisions: decisions,
    });
  }
  if (action === 'architecture_gap' || action === 'process_gap') {
    const routed = transitionLoopState(
      state,
      {
        to: 'tasking',
        feedback: {
          target:
            action === 'architecture_gap' ? 'architecture' : 'test_process',
          reason: normalizedReason,
          decided_by: 'human',
        },
      },
      now,
    );
    return writeState(cwd, {
      ...routed,
      tasking_stage: 'knowledge_gap',
      tasking_candidate: undefined,
      tasking_gap: {
        kind: action,
        reason: normalizedReason,
        recorded_at: now,
      },
      desk_check_decisions: decisions,
    });
  }

  const storyId = state.tasking_candidate.story_id;
  const routed = transitionLoopState(
    state,
    {
      to: 'understand',
      feedback: {
        target: 'scenario',
        reason: normalizedReason,
        decided_by: 'human',
      },
    },
    now,
  );
  return writeState(cwd, {
    ...routed,
    understand_stage: 'tqa',
    active_clarification_story: { story_id: storyId, selected_at: now },
    scenario_drafts: undefined,
    confirmed_scenarios: undefined,
    modeling_stage: undefined,
    modeling_profile_proposal: undefined,
    modeling_profile: undefined,
    model_expansion_path: undefined,
    model_git_baseline: undefined,
    model_change_proposal: undefined,
    model_change_application: undefined,
    model_projection: undefined,
    model_challenges: undefined,
    model_decisions: undefined,
    tasking_stage: undefined,
    tasking_candidate: undefined,
    tasking_gap: undefined,
    approved_test_plan_path: undefined,
    approved_test_plan_sha256: undefined,
    desk_check_decisions: decisions,
    active_work_item: undefined,
  });
}
