import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './phases';
import { writeState } from './state';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from './test-support';
import { validateWorkflow } from './validate';

afterEach(cleanupWorkspaces);

describe('validate', () => {
  it('accepts an active iteration with its required phase input', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');
    expect(() => validateWorkflow(cwd)).not.toThrow();
  });

  it('rejects a missing active iteration root', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => validateWorkflow(cwd)).toThrow(
      'Active iteration artifact root is missing',
    );
  });
});
