import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './phase-catalog';
import {
  newIterationState,
  readState,
  selectTestProcess,
  selectWorkItem,
  writeState,
} from './state-store';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('state', () => {
  it('rejects local iteration initialization in favor of an Issue snapshot', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');
    expect(() => newIterationState(cwd)).toThrow(
      'Local iteration initialization is disabled',
    );
  });

  it('requires one selected scenario before selecting its unique test process', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web.json',
      JSON.stringify({
        version: 1,
        id: 'web',
        applies_to: { runtime: 'typescript', functional_contexts: ['shell'] },
        steps: [
          {
            id: 'q1',
            quadrant: 'Q1',
            functional_context: 'shell',
            test_double: 'stub',
            task: 'Component test.',
          },
          {
            id: 'q2',
            quadrant: 'Q2',
            functional_context: 'shell',
            test_double: 'real',
            task: 'Acceptance test.',
          },
        ],
        quality_gates: ['pnpm test'],
      }),
    );
    expect(() => selectTestProcess(cwd, 'typescript', ['shell'])).toThrow(
      'select one US-xxx',
    );
    selectWorkItem(cwd, 'US-001', 'SC-001');
    expect(
      selectTestProcess(cwd, 'typescript', ['shell']).active_work_item
        ?.test_process?.id,
    ).toBe('web');
    expect(readState(cwd).active_work_item?.test_process?.id).toBe('web');
  });
});
