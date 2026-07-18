import { afterEach, describe, expect, it } from 'vitest';
import { startActivityTrace } from '../capabilities/activity-observability/trace';
import { provisionWorkItem } from '../capabilities/work-item-worktree/provisioner';
import { DEFAULT_STATE } from '../iteration/default-state';
import { writeState } from '../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from '../test-support/support';
import { validateWorkflow } from './workflow-validator';

afterEach(cleanupWorkspaces);

function story(cwd: string) {
  initializeGitRepository(cwd);
  return provisionWorkItem(
    cwd,
    'CAND-0001',
    ({ iterationId, worktreeRoot }) => {
      writeState(worktreeRoot, {
        ...DEFAULT_STATE,
        iteration_id: iterationId,
      });
    },
  );
}

describe('Board workflow validation', () => {
  it('rejects one Board Story without a frozen requirement input', () => {
    const cwd = workspace();
    const provisioned = story(cwd);
    write(
      provisioned.worktree.path,
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    );

    expect(() => validateWorkflow(cwd)).toThrow(
      'ITER-0001 has no frozen requirement input',
    );
  });

  it('rejects one Board Story with a missing iteration root', () => {
    const cwd = workspace();
    story(cwd);

    expect(() => validateWorkflow(cwd)).toThrow(
      'ITER-0001 artifact root is missing',
    );
  });

  it('rejects an incomplete trace in the exact owning Story worktree', () => {
    const cwd = workspace();
    const provisioned = story(cwd);
    write(
      provisioned.worktree.path,
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    );
    startActivityTrace(provisioned.worktree.path, {
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
