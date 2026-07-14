import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CANONICAL_KNOWLEDGE_PATHS } from '../evidence/knowledge';
import { executeTestStep } from '../testing/execution-recorder';
import { validateWorkflow } from '../validation/workflow-validator';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import {
  selectTestProcess,
  selectWorkItem,
  writeState,
} from '../workflow/state-store';
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
        task: 'Test component behavior.',
      },
      {
        id: `${id}-q2`,
        quadrant: 'Q2',
        functional_context: `${runtime}-context`,
        test_double: 'real',
        task: 'Verify scenario behavior.',
      },
    ],
    quality_gates: ['node -e "process.exit(0)"'],
  });
}

function prepareBuild(cwd: string, runtimes: Array<'rust' | 'typescript'>) {
  initializeGitRepository(cwd);
  for (const runtime of runtimes) {
    const id = runtime === 'rust' ? 'server' : 'web';
    write(
      cwd,
      `engineering/evidence-orchestrator/test-processes/${runtime}.json`,
      processDefinition(id, runtime),
    );
  }
  writeIterationArtifact(
    cwd,
    '02-discovery/examples/US-001-SC-001.md',
    'Given x\nWhen y\nThen z\n',
  );
  writeIterationArtifact(
    cwd,
    '04-design/scenario-context-map.json',
    JSON.stringify({
      version: 1,
      scenarios: [
        {
          story_id: 'US-001',
          scenario_id: 'SC-001',
          runtimes: runtimes.map((runtime) => ({
            runtime,
            functional_contexts: [`${runtime}-context`],
            q1_tests: ['component'],
            q2_tests: ['acceptance'],
            test_doubles: ['fake'],
            candidate_process_ids: [runtime === 'rust' ? 'server' : 'web'],
          })),
        },
      ],
    }),
  );
  writeState(cwd, { ...DEFAULT_STATE, phase: 'build' });
  selectWorkItem(cwd, 'US-001', 'SC-001');
}

describe('delivery controls', () => {
  it('rejects an active iteration without a frozen GitHub Issue', () => {
    const cwd = workspace();
    for (const path of CANONICAL_KNOWLEDGE_PATHS) write(cwd, path, 'knowledge');
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/web.json',
      processDefinition('web', 'typescript'),
    );
    writeIterationArtifact(cwd, '00-input/requirements.md');
    writeState(cwd, DEFAULT_STATE);
    expect(() => validateWorkflow(cwd)).toThrow('no frozen GitHub Issue');
  });

  it('snapshots catalog processes and composes one plan across runtimes', () => {
    const cwd = workspace();
    prepareBuild(cwd, ['typescript', 'rust']);

    const afterWeb = selectTestProcess(cwd, 'typescript', [
      'typescript-context',
    ]);
    const afterServer = selectTestProcess(cwd, 'rust', ['rust-context']);
    expect(afterWeb.active_work_item?.test_plan?.processes).toHaveLength(1);
    expect(
      afterServer.active_work_item?.test_plan?.processes.map(
        ({ runtime }) => runtime,
      ),
    ).toEqual(['typescript', 'rust']);
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/04-design/selected-test-processes/typescript.json`,
      ),
    ).toBe(true);
  });

  it('runs only a selected process command and appends execution facts', () => {
    const cwd = workspace();
    prepareBuild(cwd, ['typescript']);
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
    const log = `${cwd}/artifacts/iterations/ITER-0001/05-build/US-001/SC-001.execution.jsonl`;
    expect(readFileSync(log, 'utf8')).toContain('"process_id":"web"');
  });
});
