import { afterEach, describe, expect, it } from 'vitest';
import { buildPhasePrompt } from './prompts';
import { DEFAULT_STATE } from './phases';
import { writeState } from './state';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from './test-support';

afterEach(cleanupWorkspaces);

describe('prompts', () => {
  it('resolves phase paths within the active iteration', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');
    expect(buildPhasePrompt(cwd)).toContain(
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    );
  });

  it('instructs coding to select a test process before implementation', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    expect(buildPhasePrompt(cwd)).toContain(
      'evidence_workflow_select_test_process',
    );
  });
});
