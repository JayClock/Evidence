import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import { buildPhaseTask } from './phase-task';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('phase tasks', () => {
  it('resolves phase paths without referring to legacy skills', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');

    const task = buildPhaseTask(cwd);

    expect(task).toContain(
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    );
    expect(task).not.toContain('.pi/skills/');
  });

  it('instructs coding to select a test process before implementation', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    expect(buildPhaseTask(cwd)).toContain(
      'evidence_orchestrator_select_test_process',
    );
  });
});
