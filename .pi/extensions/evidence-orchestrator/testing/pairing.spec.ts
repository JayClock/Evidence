import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from '../tests/support';
import {
  isCompletedIteration,
  preparePhaseRun,
} from '../runtime/phase-dispatch';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import {
  readState,
  transitionWorkflowLoop,
  writeState,
} from '../workflow/state-store';
import {
  materializeFocusedCommands,
  materializedProcessSha256,
  readTestProcess,
  testProcessDefinitionSha256,
} from './process-catalog';
import {
  capturePairWorktree,
  completePairDriver,
  executePairAction,
  failPairDriver,
  navigatePair,
  pairDeterministicAction,
  pairDriverMode,
  reviewPairRed,
} from './pairing';

afterEach(cleanupWorkspaces);

function processDefinition() {
  return {
    version: 2,
    id: 'typescript-pair',
    owner: 'web-platform',
    runtime: 'typescript',
    applies_to: {
      capabilities: ['workspace'],
      technical_boundaries: ['react-feature', 'http-server'],
      when: 'A workspace Scenario changes a Web feature.',
    },
    steps: [
      {
        id: 'component-q1',
        purpose: 'Drive component behavior.',
        quadrant: 'Q1',
        functional_contexts: ['workspace'],
        real_boundaries: ['react-feature'],
        replaced_boundaries: [{ boundary: 'http-server', test_double: 'stub' }],
        test_list_template: 'test-list',
        nearest_test: {
          rule: 'Use the nearest test.',
          roots: ['apps/web/tests'],
        },
        focused_command: {
          template: 'node focused.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: { expected_failure: 'Behavior assertion fails.' },
        green: { done_when: 'Behavior assertion passes.' },
        refactor: { done_when: 'Behavior stays green.' },
      },
      {
        id: 'acceptance-q2',
        purpose: 'Confirm the Scenario.',
        quadrant: 'Q2',
        functional_contexts: ['workspace'],
        real_boundaries: ['react-feature'],
        replaced_boundaries: [{ boundary: 'http-server', test_double: 'stub' }],
        test_list_template: 'test-list',
        nearest_test: {
          rule: 'Use the nearest test.',
          roots: ['apps/web/tests'],
        },
        focused_command: {
          template: 'node focused.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: { expected_failure: 'Scenario assertion fails.' },
        green: { done_when: 'Scenario assertion passes.' },
        refactor: { done_when: 'Scenario stays green.' },
      },
    ],
    quality_gates: ['node quality.js'],
  };
}

function preparePair(cwd: string): void {
  initializeGitRepository(cwd);
  const processPath =
    'artifacts/iterations/ITER-0001/03-architecture/selected-test-processes/typescript-pair.json';
  write(cwd, processPath, JSON.stringify(processDefinition()));
  const definition = readTestProcess(`${cwd}/${processPath}`);
  const definitionSha256 = testProcessDefinitionSha256(`${cwd}/${processPath}`);
  const variables = { test_filter: 'pair_behavior' };
  const commands = materializeFocusedCommands(definition, variables).filter(
    ({ step_id }) => step_id === 'acceptance-q2',
  );
  const materializedSha256 = materializedProcessSha256(
    definition.id,
    definitionSha256,
    variables,
    commands,
  );
  const planPath =
    'artifacts/iterations/ITER-0001/04-planning/test-plans/US-001-SC-001-typescript-pair.json';
  write(
    cwd,
    planPath,
    JSON.stringify({
      version: 2,
      story_id: 'US-001',
      scenario_id: 'SC-001',
      process_id: definition.id,
      process_path: processPath,
      definition_sha256: definitionSha256,
      runtime: 'typescript',
      functional_contexts: ['workspace'],
      technical_boundaries: ['react-feature'],
      selected_step_ids: ['acceptance-q2'],
      command_variables: variables,
      focused_commands: commands,
      quality_gates: definition.quality_gates,
      materialized_sha256: materializedSha256,
    }),
  );
  write(cwd, 'artifacts/iterations/ITER-0001/04-planning/test-plan.json', '{}');
  write(
    cwd,
    'artifacts/iterations/ITER-0001/04-planning/test-list.md',
    '# Tests',
  );
  write(
    cwd,
    'artifacts/iterations/ITER-0001/04-planning/task-list.md',
    '# Tasks',
  );
  write(
    cwd,
    'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
    '# Scenario',
  );
  write(
    cwd,
    'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json',
    '{}',
  );
  write(
    cwd,
    'engineering/evidence-orchestrator/definition-of-done.md',
    '# DoD',
  );
  write(
    cwd,
    'focused.js',
    "const fs=require('node:fs');process.exit(fs.existsSync('apps/web/src/feature.ts')?0:1);",
  );
  write(cwd, 'quality.js', 'process.exit(1);');
  const baseline = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  const selection = {
    id: definition.id,
    path: processPath,
    runtime: 'typescript' as const,
    functional_contexts: ['workspace'],
    technical_boundaries: ['react-feature'],
    process_version: 2 as const,
    definition_sha256: definitionSha256,
    selected_step_ids: ['acceptance-q2'],
    command_variables: variables,
    focused_commands: commands,
    materialized_sha256: materializedSha256,
    materialized_plan_path: planPath,
  };
  writeState(cwd, {
    ...DEFAULT_STATE,
    workflow_version: 5,
    loop: 'pair',
    phase: 'coding',
    requirement_source: {
      type: 'github_issue',
      repository: 'owner/repo',
      issue_number: 10,
      url: 'https://example.test/issues/10',
      snapshot_path: 'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      projection_path:
        'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      content_hash: 'sha256:test',
      issue_updated_at: '2026-01-01T00:00:00.000Z',
      fetched_at: '2026-01-01T00:00:00.000Z',
    },
    understand_stage: 'modeling',
    confirmed_scenario: {
      version: 1,
      story_id: 'US-001',
      scenario_id: 'SC-001',
      source_draft_id: 'DRAFT-001',
      title: 'Workspace becomes visible',
      given: ['No visible workspace exists'],
      when: 'The owner creates Alpha',
      then: ['Workspace is visible'],
      business_data: ['name=Alpha'],
      artifact_path:
        'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
      confirmed_by: 'human',
      confirmation_reason: 'Smallest value.',
      confirmed_at: '2026-01-01T00:00:00.000Z',
    },
    modeling_stage: 'challenged',
    modeling_profile: {
      version: 1,
      subject: 'domain',
      method: 'object',
      model_change_required: false,
      reason: 'Existing model.',
      confirmed_by: 'human',
      confirmed_at: '2026-01-01T00:01:00.000Z',
    },
    model_expansion_path:
      'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json',
    model_git_baseline: baseline,
    model_challenges: [
      {
        version: 1,
        requested_outcome: 'pass',
        outcome: 'pass',
        summary: 'Model explains the Scenario.',
        checked_regression_ids: ['REG-001'],
        projection_sha256: 'projection',
        artifact_path: 'challenge.json',
        challenged_by: 'model-challenger',
        challenged_at: '2026-01-01T00:02:00.000Z',
      },
    ],
    tasking_stage: 'approved',
    approved_test_plan_path:
      'artifacts/iterations/ITER-0001/04-planning/test-plan.json',
    active_work_item: {
      story_id: 'US-001',
      scenario_id: 'SC-001',
      git_baseline: baseline,
      test_process: selection,
      test_plan: { version: 2, processes: [selection] },
    },
    tasking_candidate: {
      version: 1,
      draft_id: 'DRAFT-001',
      story_id: 'US-001',
      scenario_id: 'SC-001',
      tests: [
        {
          id: 'TEST-001',
          quadrant: 'Q2',
          intent: 'The owner sees the new workspace.',
          runtime_plan_id: 'RUNTIME-001',
          process_id: definition.id,
          step_id: 'acceptance-q2',
          supported_by: [],
          scenario_outcome: 'Workspace is visible',
          business_data: ['name=Alpha'],
        },
      ],
      tasks: [
        {
          id: 'TASK-001',
          description: 'Implement the visible workspace behavior.',
          test_ids: ['TEST-001'],
          depends_on: [],
        },
      ],
      processes: [selection],
      test_list_path: 'artifacts/iterations/ITER-0001/04-planning/test-list.md',
      task_list_path: 'artifacts/iterations/ITER-0001/04-planning/task-list.md',
      candidate_path:
        'artifacts/iterations/ITER-0001/04-planning/candidate.json',
      test_list_sha256: 'test-list-sha',
      task_list_sha256: 'task-list-sha',
      candidate_sha256: 'candidate-sha',
      proposed_at: '2026-01-01T00:00:00.000Z',
    },
    pair_session: {
      version: 1,
      story_id: 'US-001',
      scenario_id: 'SC-001',
      git_baseline: baseline,
      checkpoint: 'plan_confirmed',
      process_id: definition.id,
      step_id: 'acceptance-q2',
      completed_step_ids: [],
      test_paths: [],
      production_paths: [],
      expected_red: 'The owner sees the new workspace.',
      quality_gate_index: 0,
      feedback: [],
      driver_history: [],
    },
  });
}

function writeFocusedTest(
  cwd: string,
  content = 'expect(workspace).toBeVisible();',
) {
  write(cwd, 'apps/web/tests/workspace.test.ts', content);
}

describe('Navigator-driven Pair', () => {
  it('dispatches at most one Driver or deterministic checkpoint per run', () => {
    const cwd = workspace();
    preparePair(cwd);

    const driver = preparePhaseRun(cwd);
    if (isCompletedIteration(driver)) throw new Error('Unexpected complete.');
    expect(driver.agentName).toBe('test-driver');
    expect(driver.pairAction).toBeUndefined();

    const snapshot = capturePairWorktree(cwd);
    writeFocusedTest(cwd);
    completePairDriver(cwd, 'test', snapshot, 'Added Q2.');
    const redAction = preparePhaseRun(cwd);
    if (isCompletedIteration(redAction))
      throw new Error('Unexpected complete.');
    expect(redAction).toMatchObject({ pairAction: 'run_red' });
    expect(redAction.agentName).toBeUndefined();

    executePairAction(cwd, 'run_red');
    expect(() => preparePhaseRun(cwd)).toThrow(
      'Pair is paused at red_observed',
    );
  });

  it('restores changes and records feedback when a Driver process fails', () => {
    const cwd = workspace();
    preparePair(cwd);
    const snapshot = capturePairWorktree(cwd);
    writeFocusedTest(cwd);

    const outcome = failPairDriver(
      cwd,
      'test',
      snapshot,
      'Agent exited before completing the test.',
    );

    expect(outcome.blocked).toBe(true);
    expect(existsSync(`${cwd}/apps/web/tests/workspace.test.ts`)).toBe(false);
    expect(outcome.state.pair_session?.feedback.at(-1)).toMatchObject({
      action: 'driver_blocked',
      decided_by: 'system',
    });
  });

  it('blocks and restores a Test Driver production-code attempt', () => {
    const cwd = workspace();
    preparePair(cwd);
    const snapshot = capturePairWorktree(cwd);
    write(cwd, 'apps/web/src/feature.ts', 'export const unsafe = true;');

    const outcome = completePairDriver(cwd, 'test', snapshot, 'Wrote test.');

    expect(outcome.blocked).toBe(true);
    expect(existsSync(`${cwd}/apps/web/src/feature.ts`)).toBe(false);
    expect(readState(cwd).pair_session?.checkpoint).toBe('plan_confirmed');
  });

  it('rejects a non-behavior Red and pauses after every checkpoint', () => {
    const cwd = workspace();
    preparePair(cwd);
    const snapshot = capturePairWorktree(cwd);
    writeFocusedTest(cwd);

    const testResult = completePairDriver(cwd, 'test', snapshot, 'Added Q2.');
    expect(testResult.state.pair_session?.checkpoint).toBe('test_written');
    expect(pairDeterministicAction(cwd, testResult.state)).toBe('run_red');

    const red = executePairAction(cwd, 'run_red');
    expect(red.state.pair_session?.checkpoint).toBe('red_observed');
    expect(pairDriverMode(red.state)).toBeUndefined();

    const rejected = reviewPairRed(
      cwd,
      'configuration',
      'The fixture cannot load its configuration.',
    );
    expect(rejected.pair_session).toMatchObject({
      checkpoint: 'plan_confirmed',
      red_observation: {
        accepted: false,
        failure_kind: 'configuration',
      },
    });
  });

  it('freezes confirmed tests during Production Driver and restores all attempted changes', () => {
    const cwd = workspace();
    preparePair(cwd);
    let snapshot = capturePairWorktree(cwd);
    writeFocusedTest(cwd);
    completePairDriver(cwd, 'test', snapshot, 'Added Q2.');
    executePairAction(cwd, 'run_red');
    reviewPairRed(cwd, 'behavior', 'The workspace is not visible yet.');

    snapshot = capturePairWorktree(cwd);
    writeFocusedTest(cwd, 'expect(true).toBe(true);');
    write(cwd, 'apps/web/src/feature.ts', 'export const visible = true;');
    const outcome = completePairDriver(
      cwd,
      'implementation',
      snapshot,
      'Implemented visibility.',
    );

    expect(outcome.blocked).toBe(true);
    expect(
      readFileSync(`${cwd}/apps/web/tests/workspace.test.ts`, 'utf8'),
    ).toContain('toBeVisible');
    expect(existsSync(`${cwd}/apps/web/src/feature.ts`)).toBe(false);
    expect(readState(cwd).pair_session?.checkpoint).toBe('red_observed');
  });

  it('permits Green then Refactor and reports quality-gate failure separately', () => {
    const cwd = workspace();
    preparePair(cwd);
    let snapshot = capturePairWorktree(cwd);
    writeFocusedTest(cwd);
    completePairDriver(cwd, 'test', snapshot, 'Added Q2.');
    executePairAction(cwd, 'run_red');
    reviewPairRed(cwd, 'behavior', 'The expected workspace is absent.');

    snapshot = capturePairWorktree(cwd);
    write(cwd, 'apps/web/src/feature.ts', 'export const visible = true;');
    const implementation = completePairDriver(
      cwd,
      'implementation',
      snapshot,
      'Minimal implementation.',
    );
    expect(implementation.state.pair_session?.checkpoint).toBe(
      'implementation_written',
    );

    const green = executePairAction(cwd, 'run_green');
    expect(green.state.pair_session?.checkpoint).toBe('green_observed');
    expect(() => executePairAction(cwd, 'run_refactor')).toThrow(
      'requires human navigation',
    );

    snapshot = capturePairWorktree(cwd);
    const refactored = completePairDriver(
      cwd,
      'refactor',
      snapshot,
      'No safe structural change was needed.',
    );
    expect(refactored.state.pair_session?.checkpoint).toBe('refactored');
    executePairAction(cwd, 'run_refactor');
    expect(readState(cwd).pair_session).toMatchObject({
      checkpoint: 'refactored',
      completed_step_ids: ['typescript-pair/acceptance-q2'],
    });

    const quality = executePairAction(cwd, 'run_quality_gate');
    expect(quality.state.pair_session).toMatchObject({
      checkpoint: 'quality_gate_failed',
      last_observation: { stage: 'quality_gate', exit_code: 1 },
    });

    write(cwd, 'quality.js', 'process.exit(0);');
    navigatePair(
      cwd,
      'retry_quality',
      'The transient quality environment is restored.',
    );
    const passed = executePairAction(cwd, 'run_quality_gate');
    expect(passed.state.pair_session?.checkpoint).toBe('quality_gates_passed');
    expect(transitionWorkflowLoop(cwd, { to: 'showcase' }).loop).toBe(
      'showcase',
    );
  });

  it('lets Navigator return to test or Tasking without changing the Git baseline', () => {
    const testCwd = workspace();
    preparePair(testCwd);
    const baseline = readState(testCwd).pair_session?.git_baseline;
    const backTest = navigatePair(
      testCwd,
      'back_test',
      'The assertion needs clearer business data.',
    );
    expect(backTest.pair_session).toMatchObject({
      checkpoint: 'plan_confirmed',
      git_baseline: baseline,
    });

    const taskingCwd = workspace();
    preparePair(taskingCwd);
    const backTasking = navigatePair(
      taskingCwd,
      'back_tasking',
      'The selected double hides integration risk.',
    );
    expect(backTasking).toMatchObject({
      loop: 'tasking',
      phase: 'architecture',
      tasking_stage: 'drafting',
    });
    expect(backTasking.pair_session).toBeUndefined();
    expect(backTasking.feedback_history?.at(-1)).toMatchObject({
      target: 'test_strategy',
      decided_by: 'human',
    });
  });
});
