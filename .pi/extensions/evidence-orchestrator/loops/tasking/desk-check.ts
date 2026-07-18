import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createExecutionBudgetEnvelope } from '../../capabilities/execution-budget/policy';
import {
  readNxProjectCatalog,
  serializeNxProjectCatalog,
} from '../../capabilities/test-process/project-catalog';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { readState, writeState } from '../../iteration/state-repository';
import type {
  DeskCheckAction,
  DeskCheckDecision,
  TaskingCandidate,
  TestProcessSelection,
  WorkflowState,
} from '../../iteration/state';
import { transitionLoopState } from '../../iteration/transition-graph';
import { applyModelChangeProposal } from '../understand/public';
import type { ProjectCatalogLoader } from './desk-check-review';
import { assertDeskCheckApprovalReady } from './public';

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

function lockApprovedProcesses(
  cwd: string,
  state: WorkflowState,
  candidate: TaskingCandidate,
  projectCatalogs: ReturnType<
    typeof assertDeskCheckApprovalReady
  >['project_catalogs'],
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
    const catalog = projectCatalogs[process.id];
    if (process.project_ids.length > 0 && !catalog) {
      throw new Error(
        `Desk Check preflight did not retain the Nx project catalog: ${process.id}.`,
      );
    }
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
    const preflight = assertDeskCheckApprovalReady(cwd, {
      state,
      loadProjectCatalog,
    });
    const baseline = preflight.git_baseline;
    const processes = lockApprovedProcesses(
      cwd,
      state,
      state.tasking_candidate,
      preflight.project_catalogs,
    );
    const executionBudget = createExecutionBudgetEnvelope(
      preflight.budget_policy,
      {
        testCount: state.tasking_candidate.tests.length,
        selectedProcessStepCount: processes.reduce(
          (count, process) => count + process.selected_step_ids.length,
          0,
        ),
        approvedAt: now,
      },
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
      execution_budget: executionBudget,
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
        execution_budget: executionBudget,
        quality_gate_index: 0,
        feedback: [],
        driver_history: [],
        failure_fingerprints: [],
        pair_progress: {
          high_water: {
            completed_test_count: 0,
            completed_step_count: 0,
            quality_gate_index: 0,
            current_work_unit_index: 0,
            checkpoint_rank: 0,
          },
          no_progress_checkpoints: 0,
          recent_span_ids: [],
          updated_at: now,
        },
        automation_exception_history: [],
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
