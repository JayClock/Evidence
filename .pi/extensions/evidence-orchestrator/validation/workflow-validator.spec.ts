import { afterEach, describe, expect, it } from 'vitest';
import { startActivityTrace } from '../capabilities/activity-observability/trace';
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
  it('rejects an active iteration without a frozen requirement input', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');
    expect(() => validateWorkflow(cwd)).toThrow('no frozen requirement input');
  });

  it('rejects a missing active iteration root', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => validateWorkflow(cwd)).toThrow(
      'Active iteration artifact root is missing',
    );
  });

  it('rejects an incomplete activity trace before accepting workflow evidence', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    startActivityTrace(cwd, {
      iterationId: 'ITER-0001',
      activity: 'kickoff',
      agent: 'requirements-analyst',
      requestedModel: 'provider/model',
      thinking: 'medium',
      sessionMode: 'ephemeral',
      task: 'Prepare one candidate.',
      toolNames: ['read'],
    });

    expect(() => validateWorkflow(cwd)).toThrow(
      'Activity trace has incomplete spans: ACT-000001',
    );
  });
});
