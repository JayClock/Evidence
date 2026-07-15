import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../iteration/default-state';
import { writeState } from '../iteration/state-repository';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../test-support/support';
import { validateWorkflow } from './workflow-validator';

afterEach(cleanupWorkspaces);

describe('validate', () => {
  it('rejects a legacy active iteration even when its local requirement file exists', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');
    expect(() => validateWorkflow(cwd)).toThrow(
      'no GitHub Issue requirement source',
    );
  });

  it('rejects a missing active iteration root', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => validateWorkflow(cwd)).toThrow(
      'Active iteration artifact root is missing',
    );
  });
});
