import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { executeTestStep } from './execution';
import { DEFAULT_STATE } from './phases';
import { selectTestProcess, selectWorkItem, writeState } from './state';
import { validateWorkflow } from './validate';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
  writeIterationArtifact,
} from './test-support';

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
      'engineering/evidence-workflow/test-processes/typescript.json',
      processDefinition('web', 'typescript'),
    );
    write(
      cwd,
      'engineering/evidence-workflow/test-processes/rust.json',
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
        `${cwd}/artifacts/iterations/ITER-0001/03-architecture/test-processes/typescript.json`,
      ),
    ).toBe(true);
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/03-architecture/test-processes/rust.json`,
      ),
    ).toBe(true);
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

    expect(record.exit_code).toBe(0);
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
