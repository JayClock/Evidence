import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { executeTestStep } from '../testing/execution-recorder';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import {
  readState,
  selectTestProcess,
  selectWorkItem,
  writeState,
} from '../workflow/state-store';
import { validateWorkflow } from '../validation/workflow-validator';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
  writeIterationArtifact,
} from './support';

afterEach(cleanupWorkspaces);

function processDefinition(id: string, runtime: 'rust' | 'typescript') {
  return JSON.stringify({
    version: 1,
    id,
    applies_to: {
      runtime,
      functional_contexts: [`${runtime}-context`],
    },
    steps: [
      {
        id: `${id}-q1`,
        quadrant: 'Q1',
        functional_context: `${runtime}-context`,
        test_double: 'fake',
        task: 'Test the component behavior first.',
      },
      {
        id: `${id}-q2`,
        quadrant: 'Q2',
        functional_context: `${runtime}-context`,
        test_double: 'real',
        task: 'Verify the scenario behavior.',
      },
    ],
    quality_gates: ['node -e "process.exit(0)"'],
  });
}

function processDefinitionV2() {
  return JSON.stringify({
    version: 2,
    id: 'web-v2',
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
        test_list_template: 'evidence-test-list-v1',
        nearest_test: { rule: 'Use the nearest test.', roots: ['src'] },
        focused_command: {
          template: 'node focused-test.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: { expected_failure: 'The assertion fails.' },
        green: { done_when: 'The assertion passes.' },
        refactor: { done_when: 'The assertion remains green.' },
      },
      {
        id: 'acceptance-q2',
        purpose: 'Confirm route behavior.',
        quadrant: 'Q2',
        functional_contexts: ['workspace'],
        real_boundaries: ['react-feature'],
        replaced_boundaries: [{ boundary: 'http-server', test_double: 'stub' }],
        test_list_template: 'evidence-test-list-v1',
        nearest_test: { rule: 'Use the nearest test.', roots: ['src'] },
        focused_command: {
          template: 'node focused-test.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: { expected_failure: 'The acceptance assertion fails.' },
        green: { done_when: 'The acceptance assertion passes.' },
        refactor: { done_when: 'The acceptance assertion remains green.' },
      },
    ],
    quality_gates: ['node quality.js'],
  });
}

describe('delivery controls', () => {
  it('rejects an active iteration that is not frozen from a GitHub Issue', () => {
    const cwd = workspace();
    write(cwd, 'artifacts/iterations/ITER-0001/00-user-input/requirements.md');
    writeState(cwd, { ...DEFAULT_STATE, phase: 'frame' });

    expect(() => validateWorkflow(cwd)).toThrow(
      'no GitHub Issue requirement source',
    );
  });

  it('snapshots catalog processes and composes one plan across runtimes', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/typescript.json',
      processDefinition('web', 'typescript'),
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/rust.json',
      processDefinition('server', 'rust'),
    );
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    selectWorkItem(cwd, 'US-001', 'SC-001');

    const afterWeb = selectTestProcess(cwd, 'typescript', [
      'typescript-context',
    ]);
    const afterServer = selectTestProcess(cwd, 'rust', ['rust-context']);

    expect(afterWeb.active_work_item?.test_plan?.processes).toHaveLength(1);
    expect(afterServer.active_work_item?.test_plan?.processes).toHaveLength(2);
    expect(
      afterServer.active_work_item?.test_plan?.processes.map(
        ({ runtime }) => runtime,
      ),
    ).toEqual(['typescript', 'rust']);
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/03-architecture/selected-test-processes/typescript.json`,
      ),
    ).toBe(true);
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/03-architecture/selected-test-processes/rust.json`,
      ),
    ).toBe(true);
  });

  it('rejects selecting a legacy v1 process for a new v5 iteration', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web.json',
      processDefinition('web', 'typescript'),
    );
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'pair',
      phase: 'coding',
    });
    selectWorkItem(cwd, 'US-001', 'SC-001');

    expect(() =>
      selectTestProcess(cwd, 'typescript', ['typescript-context']),
    ).toThrow('cannot select legacy test process');
  });

  it('runs locked v2 commands in step order and each final quality gate once', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web-v2.json',
      processDefinitionV2(),
    );
    write(cwd, 'focused-test.js', 'process.exit(1);');
    write(cwd, 'quality.js', 'process.exit(0);');
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'pair',
      phase: 'coding',
    });
    selectWorkItem(cwd, 'US-001', 'SC-001');
    const selected = selectTestProcess(
      cwd,
      'typescript',
      ['workspace'],
      ['react-feature'],
      { test_filter: 'SC-008' },
    );

    expect(selected.active_work_item?.test_plan).toMatchObject({
      version: 2,
      processes: [
        {
          process_version: 2,
          command_variables: { test_filter: 'SC-008' },
          focused_commands: [
            {
              step_id: 'component-q1',
              command: 'node focused-test.js SC-008',
            },
            {
              step_id: 'acceptance-q2',
              command: 'node focused-test.js SC-008',
            },
          ],
        },
      ],
    });
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/04-planning/test-plans/US-001-SC-001-web-v2.json`,
      ),
    ).toBe(true);
    expect(() =>
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'red',
        stepId: 'component-q1',
        command: 'node focused-test.js other',
      }),
    ).toThrow('not the locked focused command');
    expect(() =>
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'red',
        stepId: 'acceptance-q2',
        command: 'node focused-test.js SC-008',
      }),
    ).toThrow('cannot run before component-q1 is green');

    expect(
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'red',
        stepId: 'component-q1',
        command: 'node focused-test.js SC-008',
      }).expected_failure,
    ).toBe(true);
    write(cwd, 'focused-test.js', 'process.exit(0);');
    executeTestStep(cwd, {
      processId: 'web-v2',
      stage: 'green',
      stepId: 'component-q1',
      command: 'node focused-test.js SC-008',
    });
    expect(() =>
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'quality_gate',
        command: 'node quality.js',
      }),
    ).toThrow('completed focused steps: acceptance-q2');

    write(cwd, 'focused-test.js', 'process.exit(1);');
    executeTestStep(cwd, {
      processId: 'web-v2',
      stage: 'red',
      stepId: 'acceptance-q2',
      command: 'node focused-test.js SC-008',
    });
    write(cwd, 'focused-test.js', 'process.exit(0);');
    executeTestStep(cwd, {
      processId: 'web-v2',
      stage: 'green',
      stepId: 'acceptance-q2',
      command: 'node focused-test.js SC-008',
    });
    expect(
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'quality_gate',
        command: 'node quality.js',
      }).exit_code,
    ).toBe(0);
    expect(() =>
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'quality_gate',
        command: 'node quality.js',
      }),
    ).toThrow('already executed');
  });

  it('rejects definition and materialized-command drift', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web-v2.json',
      processDefinitionV2(),
    );
    write(cwd, 'focused-test.js', 'process.exit(1);');
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'pair',
      phase: 'coding',
    });
    selectWorkItem(cwd, 'US-001', 'SC-001');
    selectTestProcess(cwd, 'typescript', ['workspace'], ['react-feature'], {
      test_filter: 'SC-008',
    });

    const lockedState = readState(cwd);
    const driftedState = structuredClone(lockedState);
    const lockedCommand =
      driftedState.active_work_item?.test_plan?.processes[0]
        ?.focused_commands?.[0];
    if (!lockedCommand) throw new Error('Expected one locked focused command.');
    lockedCommand.command = 'node focused-test.js changed';
    writeState(cwd, driftedState);
    expect(() =>
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'red',
        stepId: 'component-q1',
        command: 'node focused-test.js changed',
      }),
    ).toThrow('Materialized test plan drifted');
    writeState(cwd, lockedState);

    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web-v2.json',
      `${processDefinitionV2()}\n`,
    );
    expect(() =>
      executeTestStep(cwd, {
        processId: 'web-v2',
        stage: 'red',
        stepId: 'component-q1',
        command: 'node focused-test.js SC-008',
      }),
    ).toThrow('definition drifted');
  });

  it('runs only a selected process quality gate and writes an execution record', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web.json',
      processDefinition('web', 'typescript'),
    );
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    selectWorkItem(cwd, 'US-001', 'SC-001');
    selectTestProcess(cwd, 'typescript', ['typescript-context']);

    const record = executeTestStep(cwd, {
      processId: 'web',
      stage: 'green',
      command: 'node -e "process.exit(0)"',
    });

    expect(record).toMatchObject({
      version: 2,
      exit_code: 0,
      invocation: 'test-tool',
      git_baseline: expect.stringMatching(/^[0-9a-f]{40}$/),
      stdout_summary: '',
      stderr_summary: '',
      previous_record_sha256: '0'.repeat(64),
      record_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(() =>
      executeTestStep(cwd, {
        processId: 'web',
        stage: 'green',
        command: 'echo unsafe',
      }),
    ).toThrow('not declared by selected test process');
    const log = `${cwd}/artifacts/iterations/ITER-0001/05-code/US-001/SC-001.execution.jsonl`;
    expect(readFileSync(log, 'utf8')).toContain('"process_id":"web"');
  });
});
