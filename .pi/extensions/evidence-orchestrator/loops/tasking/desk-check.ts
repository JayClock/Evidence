import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCodingGitBaseline } from '../../capabilities/worktree-protection/baseline';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { transitionLoopState } from '../../iteration/transition-graph';
import { readState, writeState } from '../../iteration/state-repository';
import type {
  DeskCheckAction,
  DeskCheckDecision,
  TaskingCandidate,
  TestProcessSelection,
  WorkflowState,
} from '../../iteration/state';
import {
  readTestProcess,
  testProcessDefinitionSha256,
} from '../../capabilities/test-process/catalog';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function immutableWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, 'utf8') !== content) {
    throw new Error(`Approved test-plan artifact is immutable: ${path}.`);
  }
  if (!existsSync(path)) writeFileSync(path, content);
}

function verifyCandidate(cwd: string, candidate: TaskingCandidate): void {
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
      !process.definition_sha256 ||
      testProcessDefinitionSha256(join(cwd, process.path)) !==
        process.definition_sha256
    ) {
      throw new Error(
        `Test process definition drifted before Desk Check: ${process.id}.`,
      );
    }
  }
}

function lockApprovedProcesses(
  cwd: string,
  state: WorkflowState,
  candidate: TaskingCandidate,
): TestProcessSelection[] {
  return candidate.processes.map((process) => {
    const source = join(cwd, process.path);
    const definition = readTestProcess(source);
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
    const selectedPath = artifactRelativePath(state, definitionRelative);
    const lockedBase: TestProcessSelection = {
      ...process,
      path: selectedPath,
    };
    const plan = {
      version: 2,
      story_id: candidate.story_id,
      scenario_id: candidate.scenario_id,
      process_id: lockedBase.id,
      process_path: lockedBase.path,
      definition_sha256: lockedBase.definition_sha256,
      runtime: lockedBase.runtime,
      functional_contexts: lockedBase.functional_contexts,
      technical_boundaries: lockedBase.technical_boundaries,
      selected_step_ids: lockedBase.selected_step_ids,
      command_variables: lockedBase.command_variables,
      focused_commands: lockedBase.focused_commands,
      quality_gates: definition.quality_gates,
      materialized_sha256: lockedBase.materialized_sha256,
    };
    const planContent = `${JSON.stringify(plan, null, 2)}\n`;
    const firstPlanRelative = `artifacts/04-planning/test-plans/${candidate.story_id}-${candidate.scenario_id}-${process.id}.json`;
    const firstPlanPath = artifactPath(cwd, state, firstPlanRelative);
    const planRelative =
      existsSync(firstPlanPath) &&
      readFileSync(firstPlanPath, 'utf8') !== planContent
        ? `artifacts/04-planning/test-plans/${candidate.story_id}-${candidate.scenario_id}-${candidate.draft_id}-${process.id}.json`
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
  reason: string,
  now: string,
): DeskCheckDecision {
  const sequence = (state.desk_check_decisions?.length ?? 0) + 1;
  return {
    action,
    reason,
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
  reason: string,
  now = new Date().toISOString(),
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
  const normalizedReason = required(reason, 'Desk Check reason');
  const decision = decisionRecord(state, action, normalizedReason, now);
  const decisions = [...(state.desk_check_decisions ?? []), decision];

  if (action === 'approve') {
    verifyCandidate(cwd, state.tasking_candidate);
    const baseline = createCodingGitBaseline(cwd);
    const processes = lockApprovedProcesses(
      cwd,
      state,
      state.tasking_candidate,
    );
    const firstApprovedRelative = 'artifacts/04-planning/test-plan.json';
    const approvedRelative = existsSync(
      artifactPath(cwd, state, firstApprovedRelative),
    )
      ? `artifacts/04-planning/test-plans/${state.tasking_candidate.story_id}-${state.tasking_candidate.scenario_id}-${state.tasking_candidate.draft_id}.approved.json`
      : firstApprovedRelative;
    const approvedPath = artifactRelativePath(state, approvedRelative);
    const approvedPlan = {
      version: 2,
      story_id: state.tasking_candidate.story_id,
      scenario_id: state.tasking_candidate.scenario_id,
      approved_by: 'human',
      approved_at: now,
      approval_reason: normalizedReason,
      candidate_sha256: state.tasking_candidate.candidate_sha256,
      test_list_path: state.tasking_candidate.test_list_path,
      task_list_path: state.tasking_candidate.task_list_path,
      tests: state.tasking_candidate.tests,
      tasks: state.tasking_candidate.tasks,
      processes: processes.map((process) => ({
        ...process,
        quality_gates: readTestProcess(join(cwd, process.path)).quality_gates,
      })),
    };
    const approvedPlanContent = `${JSON.stringify(approvedPlan, null, 2)}\n`;
    immutableWrite(
      artifactPath(cwd, state, approvedRelative),
      approvedPlanContent,
    );
    persistDecision(cwd, decision);
    const firstProcess = processes[0];
    const firstStepId =
      firstProcess?.selected_step_ids?.[0] ??
      firstProcess?.focused_commands?.[0]?.step_id;
    if (!firstProcess || !firstStepId) {
      throw new Error('Approved Tasking has no first Pair process step.');
    }
    const expectedRed = state.tasking_candidate.tests
      .filter(
        ({ process_id, step_id }) =>
          process_id === firstProcess.id && step_id === firstStepId,
      )
      .map(({ intent }) => intent)
      .join('；');
    if (!expectedRed) {
      throw new Error('Approved Tasking has no expected Red behavior.');
    }
    const approved = {
      ...state,
      tasking_stage: 'approved' as const,
      tasking_gap: undefined,
      desk_check_decisions: decisions,
      approved_test_plan_path: approvedPath,
      approved_test_plan_sha256: digest(approvedPlanContent),
      active_work_item: {
        story_id: state.tasking_candidate.story_id,
        scenario_id: state.tasking_candidate.scenario_id,
        git_baseline: baseline,
        test_plan: {
          version: 2 as const,
          processes,
        },
      },
      pair_session: {
        version: 1 as const,
        story_id: state.tasking_candidate.story_id,
        scenario_id: state.tasking_candidate.scenario_id,
        git_baseline: baseline,
        checkpoint: 'plan_confirmed' as const,
        process_id: firstProcess.id,
        step_id: firstStepId,
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
    confirmed_scenario: undefined,
    modeling_stage: undefined,
    modeling_profile_proposal: undefined,
    modeling_profile: undefined,
    model_expansion_path: undefined,
    model_git_baseline: undefined,
    model_change_proposal: undefined,
    model_change_application: undefined,
    model_projection: undefined,
    tasking_stage: undefined,
    tasking_candidate: undefined,
    tasking_gap: undefined,
    approved_test_plan_path: undefined,
    approved_test_plan_sha256: undefined,
    desk_check_decisions: decisions,
    active_work_item: undefined,
  });
}
