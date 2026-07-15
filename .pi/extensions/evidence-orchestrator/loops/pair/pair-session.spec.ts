import { createHash } from 'node:crypto';
import {
  decideKnowledgeResponse,
  proposeKnowledgeResponse,
} from '../respond/response-cycle';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from '../../test-support/support';
import {
  isCompletedIteration,
  prepareActivityRun,
} from '../../adapters/pi/activity/dispatch';
import { DEFAULT_STATE } from '../../iteration/default-state';
import {
  readState,
  transitionWorkflowLoop,
  writeState,
} from '../../iteration/state-repository';
import {
  generateExecutionEvidence,
  validateExecutionEvidence,
} from '../../capabilities/execution-evidence/manifest';
import {
  captureShowcaseReviewer,
  completeShowcaseReviewer,
  decideShowcase,
  enterShowcase,
  executeShowcaseQ2,
  prepareShowcaseReview,
  recordShowcaseReview,
  recordShowcaseRisk,
  validateShowcaseEvidence,
} from '../showcase/showcase-session';
import {
  materializeFocusedCommands,
  materializedProcessSha256,
  readTestProcess,
  testProcessDefinitionSha256,
} from '../../capabilities/test-process/catalog';
import {
  capturePairWorktree,
  completePairDriver,
  executePairAction,
  failPairDriver,
  navigatePair,
  pairDeterministicAction,
  pairDriverMode,
  reviewPairRed,
} from './pair-session';

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
  write(cwd, 'docs/knowledge-governance.md', '# Knowledge governance');
  write(
    cwd,
    'focused.js',
    "const fs=require('node:fs');const code=fs.existsSync('apps/web/src/feature.ts')?fs.readFileSync('apps/web/src/feature.ts','utf8'):'';const q1=!fs.existsSync('apps/web/tests/component.test.ts')||code.includes('q1');const q2=!fs.existsSync('apps/web/tests/workspace.test.ts')||code.includes('q2');process.exit(q1&&q2?0:1);",
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
  const taskingTest = {
    id: 'TEST-001',
    quadrant: 'Q2' as const,
    intent: 'The owner sees the new workspace.',
    runtime_plan_id: 'RUNTIME-001',
    process_id: definition.id,
    step_id: 'acceptance-q2',
    supported_by: [] as string[],
    scenario_outcome: 'Workspace is visible',
    business_data: ['name=Alpha'],
  };
  const approvedPlanContent = JSON.stringify({
    version: 2,
    story_id: 'US-001',
    scenario_id: 'SC-001',
    tests: [taskingTest],
    processes: [{ ...selection, quality_gates: definition.quality_gates }],
  });
  write(
    cwd,
    'artifacts/iterations/ITER-0001/04-planning/test-plan.json',
    approvedPlanContent,
  );
  writeState(cwd, {
    ...DEFAULT_STATE,
    loop: 'pair',
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
    approved_test_plan_sha256: createHash('sha256')
      .update(approvedPlanContent)
      .digest('hex'),
    active_work_item: {
      story_id: 'US-001',
      scenario_id: 'SC-001',
      git_baseline: baseline,
      test_plan: { version: 2, processes: [selection] },
    },
    tasking_candidate: {
      version: 1,
      draft_id: 'DRAFT-001',
      story_id: 'US-001',
      scenario_id: 'SC-001',
      tests: [taskingTest],
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
      accepted_reds: [],
      quality_gate_index: 0,
      feedback: [],
      driver_history: [],
    },
  });
}

function addWebQ1Step(cwd: string): void {
  const state = readState(cwd);
  const workItem = state.active_work_item;
  const candidate = state.tasking_candidate;
  const current = workItem?.test_plan?.processes[0];
  if (
    !workItem?.test_plan ||
    !candidate ||
    !current?.command_variables ||
    !current.materialized_plan_path ||
    !state.approved_test_plan_path
  ) {
    throw new Error('Pair fixture has no Web process.');
  }
  const definition = readTestProcess(`${cwd}/${current.path}`);
  const commands = materializeFocusedCommands(
    definition,
    current.command_variables,
  );
  const selectedStepIds = ['component-q1', 'acceptance-q2'];
  const materializedSha256 = materializedProcessSha256(
    current.id,
    current.definition_sha256 ?? '',
    current.command_variables,
    commands,
  );
  const selection = {
    ...current,
    selected_step_ids: selectedStepIds,
    focused_commands: commands,
    materialized_sha256: materializedSha256,
  };
  write(
    cwd,
    current.materialized_plan_path,
    JSON.stringify({
      version: 2,
      story_id: 'US-001',
      scenario_id: 'SC-001',
      process_id: selection.id,
      process_path: selection.path,
      definition_sha256: selection.definition_sha256,
      runtime: selection.runtime,
      functional_contexts: selection.functional_contexts,
      technical_boundaries: selection.technical_boundaries,
      selected_step_ids: selectedStepIds,
      command_variables: selection.command_variables,
      focused_commands: commands,
      quality_gates: definition.quality_gates,
      materialized_sha256: materializedSha256,
    }),
  );
  const tests = [
    {
      id: 'TEST-Q1',
      quadrant: 'Q1' as const,
      intent: 'Workspace visibility is exposed by the feature.',
      runtime_plan_id: 'RUNTIME-001',
      process_id: selection.id,
      step_id: 'component-q1',
      supported_by: [] as string[],
      business_data: ['name=Alpha'],
    },
    ...candidate.tests.map((test) =>
      test.quadrant === 'Q2' ? { ...test, supported_by: ['TEST-Q1'] } : test,
    ),
  ];
  const selections = [selection, ...workItem.test_plan.processes.slice(1)];
  const approvedPlanContent = JSON.stringify({
    version: 2,
    story_id: workItem.story_id,
    scenario_id: workItem.scenario_id,
    tests,
    processes: selections.map((process) => ({
      ...process,
      quality_gates: readTestProcess(`${cwd}/${process.path}`).quality_gates,
    })),
  });
  write(cwd, state.approved_test_plan_path, approvedPlanContent);
  writeState(cwd, {
    ...state,
    approved_test_plan_sha256: createHash('sha256')
      .update(approvedPlanContent)
      .digest('hex'),
    active_work_item: {
      ...workItem,
      test_plan: {
        ...workItem.test_plan,
        processes: selections,
      },
    },
    tasking_candidate: {
      ...candidate,
      tests,
      processes: [selection, ...candidate.processes.slice(1)],
    },
    pair_session: state.pair_session
      ? {
          ...state.pair_session,
          process_id: selection.id,
          step_id: 'component-q1',
          expected_red: 'Workspace visibility is exposed by the feature.',
        }
      : undefined,
  });
}

function addTauriProcess(cwd: string): void {
  const source = processDefinition();
  const tauri = {
    ...source,
    id: 'tauri-pair',
    owner: 'desktop-platform',
    runtime: 'tauri',
    applies_to: {
      capabilities: ['workspace'],
      technical_boundaries: ['tauri-shell', 'webview'],
      when: 'A workspace Scenario changes the desktop shell.',
    },
    steps: source.steps.map((step) => ({
      ...step,
      real_boundaries: ['tauri-shell'],
      replaced_boundaries: [
        { boundary: 'webview', test_double: 'stub' as const },
      ],
      nearest_test: {
        rule: 'Use the nearest desktop test.',
        roots: ['apps/desktop/tests'],
      },
      focused_command: {
        template: 'node desktop-focused.js {{test_filter}}',
        allowed_variables: ['test_filter'],
      },
    })),
    quality_gates: ['node desktop-quality.js'],
  };
  const processPath =
    'artifacts/iterations/ITER-0001/03-architecture/selected-test-processes/tauri-pair.json';
  write(cwd, processPath, JSON.stringify(tauri));
  const definition = readTestProcess(`${cwd}/${processPath}`);
  const definitionSha256 = testProcessDefinitionSha256(`${cwd}/${processPath}`);
  const variables = { test_filter: 'desktop_behavior' };
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
    'artifacts/iterations/ITER-0001/04-planning/test-plans/US-001-SC-001-tauri-pair.json';
  const selection = {
    id: definition.id,
    path: processPath,
    runtime: 'tauri' as const,
    functional_contexts: ['workspace'],
    technical_boundaries: ['tauri-shell'],
    process_version: 2 as const,
    definition_sha256: definitionSha256,
    selected_step_ids: ['acceptance-q2'],
    command_variables: variables,
    focused_commands: commands,
    materialized_sha256: materializedSha256,
    materialized_plan_path: planPath,
  };
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
      runtime: 'tauri',
      functional_contexts: ['workspace'],
      technical_boundaries: ['tauri-shell'],
      selected_step_ids: ['acceptance-q2'],
      command_variables: variables,
      focused_commands: commands,
      quality_gates: definition.quality_gates,
      materialized_sha256: materializedSha256,
    }),
  );
  write(
    cwd,
    'desktop-focused.js',
    "const fs=require('node:fs');process.exit(fs.existsSync('apps/desktop/src/feature.rs')?0:1);",
  );
  const state = readState(cwd);
  const workItem = state.active_work_item;
  const candidate = state.tasking_candidate;
  if (!workItem?.test_plan || !candidate || !state.approved_test_plan_path) {
    throw new Error('Pair fixture has no approved plan.');
  }
  const tests = [
    ...candidate.tests,
    {
      id: 'TEST-002',
      quadrant: 'Q2' as const,
      intent: 'The desktop shell opens the visible workspace.',
      runtime_plan_id: 'RUNTIME-002',
      process_id: definition.id,
      step_id: 'acceptance-q2',
      supported_by: ['TEST-Q1'],
      scenario_outcome: 'Workspace is visible',
      business_data: ['name=Alpha'],
    },
  ];
  const selections = [...workItem.test_plan.processes, selection];
  const approvedPlanContent = JSON.stringify({
    version: 2,
    story_id: workItem.story_id,
    scenario_id: workItem.scenario_id,
    tests,
    processes: selections.map((process) => ({
      ...process,
      quality_gates: readTestProcess(`${cwd}/${process.path}`).quality_gates,
    })),
  });
  write(cwd, state.approved_test_plan_path, approvedPlanContent);
  writeState(cwd, {
    ...state,
    approved_test_plan_sha256: createHash('sha256')
      .update(approvedPlanContent)
      .digest('hex'),
    active_work_item: {
      ...workItem,
      test_plan: {
        ...workItem.test_plan,
        processes: selections,
      },
    },
    tasking_candidate: {
      ...candidate,
      tests,
      processes: [...candidate.processes, selection],
    },
  });
}

function writeFocusedTest(
  cwd: string,
  content = 'expect(workspace).toBeVisible();',
) {
  write(cwd, 'apps/web/tests/workspace.test.ts', content);
}

function completePairSuccessfully(cwd: string): void {
  write(cwd, 'quality.js', 'process.exit(0);');
  write(cwd, 'desktop-quality.js', 'process.exit(0);');
  for (let guard = 0; guard < 30; guard += 1) {
    const session = readState(cwd).pair_session;
    if (!session) throw new Error('Missing Pair session.');
    if (session.checkpoint === 'quality_gates_passed') return;
    const desktop = session.process_id === 'tauri-pair';
    if (session.checkpoint === 'plan_confirmed') {
      const snapshot = capturePairWorktree(cwd);
      write(
        cwd,
        desktop
          ? 'apps/desktop/tests/shell.test.ts'
          : session.step_id === 'component-q1'
            ? 'apps/web/tests/component.test.ts'
            : 'apps/web/tests/workspace.test.ts',
        desktop
          ? 'expect(shell).toOpen();'
          : session.step_id === 'component-q1'
            ? 'expect(component).toExposeWorkspace();'
            : 'expect(workspace).toBeVisible();',
      );
      completePairDriver(cwd, 'test', snapshot, 'Added focused test.');
      continue;
    }
    if (session.checkpoint === 'test_written') {
      executePairAction(cwd, 'run_red');
      continue;
    }
    if (
      session.checkpoint === 'red_observed' &&
      session.red_observation?.accepted !== true
    ) {
      reviewPairRed(cwd, 'behavior', 'The expected behavior is absent.');
      continue;
    }
    if (session.checkpoint === 'red_observed') {
      const snapshot = capturePairWorktree(cwd);
      const productionPath = desktop
        ? 'apps/desktop/src/feature.rs'
        : 'apps/web/src/feature.ts';
      const existing = existsSync(`${cwd}/${productionPath}`)
        ? readFileSync(`${cwd}/${productionPath}`, 'utf8')
        : '';
      write(
        cwd,
        productionPath,
        desktop
          ? 'pub fn open() {}'
          : `${existing}\nexport const ${session.step_id === 'component-q1' ? 'q1' : 'q2'} = true;`,
      );
      completePairDriver(cwd, 'implementation', snapshot, 'Minimal Green.');
      continue;
    }
    if (session.checkpoint === 'implementation_written') {
      executePairAction(cwd, 'run_green');
      continue;
    }
    if (session.checkpoint === 'green_observed') {
      const snapshot = capturePairWorktree(cwd);
      completePairDriver(cwd, 'refactor', snapshot, 'No-op Refactor.');
      continue;
    }
    if (session.checkpoint === 'refactored') {
      executePairAction(
        cwd,
        pairDeterministicAction(cwd, readState(cwd)) ?? 'run_quality_gate',
      );
      continue;
    }
    throw new Error(`Unexpected Pair checkpoint: ${session.checkpoint}.`);
  }
  throw new Error('Pair completion exceeded its checkpoint guard.');
}

function prepareShowcaseForReview(cwd: string): void {
  preparePair(cwd);
  completePairSuccessfully(cwd);
  enterShowcase(cwd);
  executeShowcaseQ2(cwd);
  recordShowcaseRisk(
    cwd,
    'Q3',
    'not_required',
    [],
    'No exploratory or usability risk is material for this Scenario.',
  );
  recordShowcaseRisk(
    cwd,
    'Q4',
    'not_required',
    [],
    'No material non-functional risk is introduced by this Scenario.',
  );
  prepareShowcaseReview(cwd);
}

describe('Navigator-driven Pair', () => {
  it('dispatches at most one Driver or deterministic checkpoint per run', () => {
    const cwd = workspace();
    preparePair(cwd);

    const driver = prepareActivityRun(cwd);
    if (isCompletedIteration(driver)) throw new Error('Unexpected complete.');
    expect(driver.agentName).toBe('test-driver');
    expect(driver.task).toContain('.pi/skills/evidence-pairing/SKILL.md');
    expect(driver.pairAction).toBeUndefined();

    const snapshot = capturePairWorktree(cwd);
    writeFocusedTest(cwd);
    completePairDriver(cwd, 'test', snapshot, 'Added Q2.');
    const redAction = prepareActivityRun(cwd);
    if (isCompletedIteration(redAction))
      throw new Error('Unexpected complete.');
    expect(redAction).toMatchObject({ pairAction: 'run_red' });
    expect(redAction.agentName).toBeUndefined();

    executePairAction(cwd, 'run_red');
    expect(() => prepareActivityRun(cwd)).toThrow(
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
    write(cwd, 'apps/web/src/feature.ts', 'export const q2 = true;');
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
    write(cwd, 'apps/web/src/feature.ts', 'export const q2 = true;');
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

  it('replays byte-stable generated evidence and detects command tampering', () => {
    const cwd = workspace();
    preparePair(cwd);
    addWebQ1Step(cwd);
    completePairSuccessfully(cwd);

    const first = generateExecutionEvidence(cwd);
    const replay = generateExecutionEvidence(cwd);
    expect(replay.manifestContent).toBe(first.manifestContent);
    expect(replay.summaryContent).toBe(first.summaryContent);
    expect(validateExecutionEvidence(cwd)).toEqual(first.manifest);

    const approvedPath = readState(cwd).approved_test_plan_path ?? '';
    const approvedPlan = readFileSync(`${cwd}/${approvedPath}`, 'utf8');
    write(cwd, approvedPath, `${approvedPlan} `);
    expect(() => validateExecutionEvidence(cwd)).toThrow(
      'Approved aggregate test plan hash drifted',
    );
    write(cwd, approvedPath, approvedPlan);

    const planPath =
      readState(cwd).active_work_item?.test_plan?.processes[0]
        ?.materialized_plan_path ?? '';
    const lockedPlan = readFileSync(`${cwd}/${planPath}`, 'utf8');
    write(
      cwd,
      planPath,
      lockedPlan.replace('node focused.js', 'node drift.js'),
    );
    expect(() => validateExecutionEvidence(cwd)).toThrow(
      'Materialized test plan drifted',
    );
    write(cwd, planPath, lockedPlan);

    const codePath = first.manifest.changed_paths.production[0] ?? '';
    const observedCode = readFileSync(`${cwd}/${codePath}`, 'utf8');
    write(cwd, codePath, `${observedCode}\n// after quality gates`);
    expect(() => validateExecutionEvidence(cwd)).toThrow(
      'Generated execution manifest is missing or stale',
    );
    write(cwd, codePath, observedCode);
    expect(validateExecutionEvidence(cwd)).toEqual(first.manifest);

    const logPath = `${cwd}/${first.manifest.source.execution_log}`;
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    const firstRecord = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    firstRecord.command = 'echo tampered';
    lines[0] = JSON.stringify(firstRecord);
    write(cwd, first.manifest.source.execution_log, `${lines.join('\n')}\n`);
    expect(() => validateExecutionEvidence(cwd)).toThrow('hash chain failed');
  });

  it('rejects empty, partial, and deleted execution logs', () => {
    const emptyCwd = workspace();
    preparePair(emptyCwd);
    expect(() => generateExecutionEvidence(emptyCwd)).toThrow(
      'Execution log is empty',
    );

    const partialCwd = workspace();
    preparePair(partialCwd);
    const snapshot = capturePairWorktree(partialCwd);
    writeFocusedTest(partialCwd);
    completePairDriver(partialCwd, 'test', snapshot, 'Added Q2.');
    executePairAction(partialCwd, 'run_red');
    reviewPairRed(partialCwd, 'behavior', 'Expected behavior is absent.');
    expect(() => generateExecutionEvidence(partialCwd)).toThrow('has no green');

    const deletedCwd = workspace();
    preparePair(deletedCwd);
    addWebQ1Step(deletedCwd);
    completePairSuccessfully(deletedCwd);
    const generated = generateExecutionEvidence(deletedCwd);
    const log = readFileSync(
      `${deletedCwd}/${generated.manifest.source.execution_log}`,
      'utf8',
    )
      .trim()
      .split('\n');
    log.splice(1, 1);
    write(
      deletedCwd,
      generated.manifest.source.execution_log,
      `${log.join('\n')}\n`,
    );
    expect(() => validateExecutionEvidence(deletedCwd)).toThrow(
      /sequence drifted|hash chain failed/,
    );
  });

  it('generates complete traceability for a multi-runtime process plan', () => {
    const cwd = workspace();
    preparePair(cwd);
    addWebQ1Step(cwd);
    addTauriProcess(cwd);
    completePairSuccessfully(cwd);

    const manifest = validateExecutionEvidence(cwd);

    expect(manifest.processes.map(({ runtime }) => runtime)).toEqual([
      'typescript',
      'tauri',
    ]);
    expect(manifest.processes.map(({ steps }) => steps.length)).toEqual([2, 1]);
    expect(manifest.traceability.q1).toHaveLength(1);
    expect(manifest.traceability.q2).toHaveLength(2);
    expect(manifest.traceability.functional_contexts).toEqual(['workspace']);
    expect(manifest.processes[0]?.steps[0]?.replaced_boundaries).toContainEqual(
      { boundary: 'http-server', test_double: 'stub' },
    );
    expect(
      manifest.processes.flatMap(({ steps }) =>
        steps.flatMap(({ changed_paths }) => changed_paths.production),
      ),
    ).toEqual(
      expect.arrayContaining([
        'apps/web/src/feature.ts',
        'apps/desktop/src/feature.rs',
      ]),
    );
    expect(manifest.changed_paths.tests).toEqual(
      expect.arrayContaining([
        'apps/web/tests/workspace.test.ts',
        'apps/desktop/tests/shell.test.ts',
      ]),
    );
    expect(manifest.changed_paths.production).toEqual(
      expect.arrayContaining([
        'apps/web/src/feature.ts',
        'apps/desktop/src/feature.rs',
      ]),
    );
  });

  it('blocks Showcase acceptance before selected Q2 is observed', () => {
    const cwd = workspace();
    preparePair(cwd);
    completePairSuccessfully(cwd);
    enterShowcase(cwd);

    expect(() =>
      decideShowcase(
        cwd,
        'accept',
        'Commands were green during Pair, so accept without Showcase.',
      ),
    ).toThrow('passed selected Q2 observation');
  });

  it('showcases selected Q2, records Q3/Q4, and requires human acceptance', () => {
    const cwd = workspace();
    preparePair(cwd);
    completePairSuccessfully(cwd);

    const prepared = prepareActivityRun(cwd);
    if (isCompletedIteration(prepared)) throw new Error('Unexpected complete.');
    expect(prepared).toMatchObject({
      showcaseAction: 'run_q2',
      state: { loop: 'showcase', showcase_stage: 'setup' },
    });
    const observed = executeShowcaseQ2(cwd, '2026-01-02T00:00:00.000Z');
    expect(observed.output).toContain('Given: No visible workspace exists');
    expect(observed.output).toContain('When: The owner creates Alpha');
    expect(observed.output).toContain('Then: Workspace is visible');
    expect(observed.records).toHaveLength(1);
    expect(observed.records[0]).toMatchObject({
      stage: 'showcase',
      invocation: 'showcase-controller',
      exit_code: 0,
    });
    expect(() => prepareActivityRun(cwd)).toThrow('Q3 and Q4 risk decisions');

    recordShowcaseRisk(
      cwd,
      'Q3',
      'not_required',
      [],
      'The deterministic behavior has no exploratory interaction risk.',
    );
    recordShowcaseRisk(
      cwd,
      'Q4',
      'required',
      ['performance', 'security'],
      'Production rollout still needs non-functional evaluation.',
    );
    const reviewerPreparation = prepareActivityRun(cwd);
    if (isCompletedIteration(reviewerPreparation)) {
      throw new Error('Unexpected complete.');
    }
    expect(reviewerPreparation).toMatchObject({
      agentName: 'showcase-reviewer',
      state: { showcase_stage: 'reviewing' },
    });
    expect(reviewerPreparation.task).toContain('observed facts');
    expect(reviewerPreparation.task).toContain('unresolved assumptions');
    const review = recordShowcaseReview(cwd, {
      observedFacts: ['The selected Q2 command exited with zero.'],
      productDomainFeedback: [],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [
        'Production performance and security remain to be evaluated.',
      ],
      recommendation: 'accept',
    });
    const accepted = decideShowcase(
      cwd,
      'accept',
      'The Scenario value was observed and residual risks are explicit.',
    );

    expect(review.reviewed_by).toBe('showcase-reviewer');
    expect(accepted).toMatchObject({
      loop: 'respond',
      showcase_stage: 'accepted',
    });
    expect(accepted.showcase_decisions?.at(-1)).toMatchObject({
      action: 'accept',
      decided_by: 'human',
    });
    expect(
      readFileSync(
        `${cwd}/artifacts/iterations/ITER-0001/06-review/showcase-risks.jsonl`,
        'utf8',
      )
        .trim()
        .split('\n'),
    ).toHaveLength(2);
    expect(
      readFileSync(
        `${cwd}/artifacts/iterations/ITER-0001/06-review/showcase-decisions.jsonl`,
        'utf8',
      ),
    ).toContain('"action":"accept"');
    expect(validateExecutionEvidence(cwd).showcase.status).toBe('passed');
    expect(() => validateShowcaseEvidence(cwd)).not.toThrow();

    const respondPreparation = prepareActivityRun(cwd);
    if (isCompletedIteration(respondPreparation)) {
      throw new Error('Unexpected complete.');
    }
    expect(respondPreparation).toMatchObject({
      agentName: 'respond-learner',
      state: { loop: 'respond', respond_stage: 'drafting' },
    });
    const manifestPath =
      'artifacts/iterations/ITER-0001/05-code/US-001/SC-001.manifest.json';
    const response = proposeKnowledgeResponse(cwd, {
      promotions: [],
      noPromotionReason:
        'The Scenario validated existing behavior but introduced no reusable working knowledge.',
      observedOutcomes: ['The selected Q2 behavior passed in Showcase.'],
      residualRisks: ['Performance and security evaluation remain explicit.'],
      nextProbe: {
        question:
          'How should the declared performance and security activities be evaluated in production-like conditions?',
        why_now: 'Q4 remains required after the accepted behavior Showcase.',
        evidence_refs: [review.artifact_path, manifestPath],
        first_action:
          'Design one bounded production-like performance and security probe.',
      },
    });
    expect(response.promotions).toEqual([]);
    expect(() => prepareActivityRun(cwd)).toThrow('/evidence-respond');
    const completed = decideKnowledgeResponse(
      cwd,
      'approve',
      'The empty promotion decision and next Probe are evidence-based.',
    );
    expect(completed).toMatchObject({
      loop: 'complete',
      respond_stage: 'complete',
      knowledge_promotion_path:
        'artifacts/iterations/ITER-0001/07-learning/knowledge-promotion.json',
    });
    expect(completed.next_probe?.question).toContain(
      'performance and security',
    );
  });

  it('routes technical and domain Showcase feedback to their owning loops', () => {
    const technicalCwd = workspace();
    prepareShowcaseForReview(technicalCwd);
    recordShowcaseReview(technicalCwd, {
      observedFacts: ['Q2 passed on the approved Git baseline.'],
      productDomainFeedback: [],
      technicalQualityFeedback: ['The implementation needs revision.'],
      unresolvedAssumptions: [],
      recommendation: 'revise',
    });
    const pair = decideShowcase(
      technicalCwd,
      'revise',
      'The implementation does not meet the technical quality bar.',
      'implementation',
    );
    expect(pair).toMatchObject({
      loop: 'pair',
      pair_session: { checkpoint: 'red_observed', quality_gate_index: 0 },
    });
    expect(pair.feedback_history?.at(-1)).toMatchObject({
      target: 'implementation',
      from_loop: 'showcase',
      to_loop: 'pair',
      decided_by: 'human',
    });
    completePairSuccessfully(technicalCwd);
    expect(readState(technicalCwd).pair_session?.checkpoint).toBe(
      'quality_gates_passed',
    );
    expect(() => validateExecutionEvidence(technicalCwd)).not.toThrow();

    const domainCwd = workspace();
    prepareShowcaseForReview(domainCwd);
    recordShowcaseReview(domainCwd, {
      observedFacts: ['Q2 passed as currently specified.'],
      productDomainFeedback: ['The Scenario meaning is incomplete.'],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'revise',
    });
    const understand = decideShowcase(
      domainCwd,
      'revise',
      'The observable result reflects a domain misunderstanding.',
      'scenario',
    );
    expect(understand).toMatchObject({
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: { story_id: 'US-001' },
    });
    expect(understand.confirmed_scenario).toBeUndefined();
    expect(understand.feedback_history?.at(-1)?.target).toBe('scenario');
  });

  it('blocks Review when model, tests, and implementation do not share a baseline', () => {
    const cwd = workspace();
    prepareShowcaseForReview(cwd);
    const state = readState(cwd);
    writeState(cwd, { ...state, model_git_baseline: 'drifted-baseline' });

    expect(() =>
      recordShowcaseReview(cwd, {
        observedFacts: ['Q2 passed.'],
        productDomainFeedback: [],
        technicalQualityFeedback: [],
        unresolvedAssumptions: [],
        recommendation: 'accept',
      }),
    ).toThrow('do not share the Scenario Git baseline');
  });

  it('blocks Respond when accepted model and code baselines diverge', () => {
    const cwd = workspace();
    prepareShowcaseForReview(cwd);
    recordShowcaseReview(cwd, {
      observedFacts: ['Q2 passed.'],
      productDomainFeedback: [],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'accept',
    });
    decideShowcase(cwd, 'accept', 'The observed Scenario is accepted.');
    const state = readState(cwd);
    writeState(cwd, { ...state, model_git_baseline: 'diverged-baseline' });

    expect(() =>
      proposeKnowledgeResponse(cwd, {
        promotions: [],
        noPromotionReason: 'No reusable knowledge was introduced.',
        observedOutcomes: ['Q2 passed.'],
        residualRisks: [],
        nextProbe: {
          question: 'Which risk should the next bounded Probe evaluate?',
          why_now: 'One uncertainty remains.',
          evidence_refs: [state.showcase_reviews?.at(-1)?.artifact_path ?? ''],
          first_action: 'Select one measurable risk.',
        },
      }),
    ).toThrow('do not share the accepted Scenario Git baseline');
  });

  it('allows only the structured Reviewer report and state transition', () => {
    const cwd = workspace();
    prepareShowcaseForReview(cwd);
    const snapshot = captureShowcaseReviewer(cwd);
    const review = recordShowcaseReview(cwd, {
      observedFacts: ['Q2 passed on the approved baseline.'],
      productDomainFeedback: [],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'accept',
    });

    const completion = completeShowcaseReviewer(
      cwd,
      snapshot,
      0,
      'Structured review recorded.',
    );

    expect(completion.blocked).toBe(false);
    expect(completion.state.showcase_stage).toBe('decision');
    expect(existsSync(`${cwd}/${review.artifact_path}`)).toBe(true);
    expect(existsSync(`${cwd}/${review.summary_path}`)).toBe(true);
  });

  it('restores Reviewer writes and preserves a failed read-only audit', () => {
    const cwd = workspace();
    prepareShowcaseForReview(cwd);
    const snapshot = captureShowcaseReviewer(cwd);
    const before = readFileSync(`${cwd}/apps/web/src/feature.ts`, 'utf8');
    const review = recordShowcaseReview(cwd, {
      observedFacts: ['Q2 passed.'],
      productDomainFeedback: [],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'accept',
    });
    write(cwd, 'apps/web/src/feature.ts', `${before}\n// reviewer mutation`);

    const completion = completeShowcaseReviewer(
      cwd,
      snapshot,
      0,
      'Review attempted a production edit.',
      '2026-01-02T00:00:00.000Z',
    );

    expect(completion.blocked).toBe(true);
    expect(readFileSync(`${cwd}/apps/web/src/feature.ts`, 'utf8')).toBe(before);
    expect(existsSync(`${cwd}/${review.artifact_path}`)).toBe(false);
    expect(readState(cwd)).toMatchObject({
      showcase_stage: 'reviewing',
      showcase_review_failures: [
        expect.objectContaining({
          reason: expect.stringContaining('read-only boundary'),
        }),
      ],
    });
  });

  it('rejects the iteration while preserving Showcase facts and feedback', () => {
    const cwd = workspace();
    prepareShowcaseForReview(cwd);
    recordShowcaseReview(cwd, {
      observedFacts: ['The selected Q2 command passed.'],
      productDomainFeedback: ['The delivered value is unacceptable.'],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'revise',
    });
    const rejected = decideShowcase(
      cwd,
      'reject',
      'The demonstrated behavior must not be released.',
    );

    expect(rejected).toMatchObject({
      loop: 'showcase',
      showcase_stage: 'rejected',
      halted: {
        loop: 'showcase',
        reason: 'The demonstrated behavior must not be released.',
        recorded_at: expect.any(String),
      },
    });
    expect(rejected.showcase_q2_observations).toHaveLength(1);
    expect(rejected.showcase_reviews).toHaveLength(1);
    expect(rejected.showcase_decisions?.at(-1)?.action).toBe('reject');
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
      tasking_stage: 'drafting',
    });
    expect(backTasking.pair_session).toBeUndefined();
    expect(backTasking.feedback_history?.at(-1)).toMatchObject({
      target: 'test_strategy',
      decided_by: 'human',
    });
  });
});
