import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../iteration/default-state';
import { writeState } from '../iteration/state-repository';
import { proposeKickoffCandidate } from '../requirements/kickoff';
import { proposeScenarioDrafts } from '../requirements/scenarios';
import {
  isCompletedIteration,
  prepareActivityRun,
  ActivityRunBlockedError,
} from './activity-dispatch';
import { cleanupWorkspaces, workspace, write } from '../tests/support';
import type { WorkflowState } from '../iteration/state';

function issueState(): WorkflowState {
  return {
    ...DEFAULT_STATE,
    requirement_source: {
      type: 'github_issue',
      repository: 'owner/repo',
      issue_number: 7,
      url: 'https://example.test/issues/7',
      snapshot_path: 'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      projection_path:
        'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      content_hash: 'hash',
      issue_updated_at: '2026-01-01T00:00:00.000Z',
      fetched_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

function writeKickoffInputs(cwd: string): void {
  for (const path of [
    'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    'docs/product/personas.md',
    'docs/product/business-context.md',
    'docs/product/user-journeys.md',
    'docs/product/story-map.md',
  ]) {
    write(cwd, path, 'input');
  }
}

afterEach(cleanupWorkspaces);

describe('activity dispatch', () => {
  it('requires an Issue-backed native iteration', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => prepareActivityRun(cwd)).toThrow('no frozen GitHub Issue');
  });

  it('prepares Kickoff with an explicit role and no phase mapping', () => {
    const cwd = workspace();
    writeKickoffInputs(cwd);
    writeState(cwd, issueState());

    const preparation = prepareActivityRun(cwd);
    if (isCompletedIteration(preparation))
      throw new Error('Unexpected complete.');
    expect(preparation).toMatchObject({
      activity: 'kickoff',
      agentName: 'requirements-analyst',
    });
    expect(preparation).not.toHaveProperty('phase');
  });

  it('blocks Kickoff while its candidate awaits a human', () => {
    const cwd = workspace();
    writeKickoffInputs(cwd);
    writeState(cwd, issueState());
    proposeKickoffCandidate(cwd, {
      title: 'Confirm current model',
      problem: 'The lead cannot tell which model is current.',
      role: 'modeling lead',
      goal: 'see the current model',
      value: 'review the intended version',
      cognitiveMode: 'complex',
      sourceRefs: ['Issue #7'],
    });

    expect(() => prepareActivityRun(cwd)).toThrow(ActivityRunBlockedError);
    expect(() => prepareActivityRun(cwd)).toThrow('/evidence-kickoff');
  });

  it('dispatches the single Story TQA and blocks on Scenario review', () => {
    const cwd = workspace();
    for (const path of [
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      'artifacts/iterations/ITER-0001/01-requirements/problem-statement.md',
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
    ]) {
      write(cwd, path, 'input');
    }
    writeState(cwd, {
      ...issueState(),
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const preparation = prepareActivityRun(cwd);
    if (isCompletedIteration(preparation))
      throw new Error('Unexpected complete.');
    expect(preparation).toMatchObject({
      activity: 'understand',
      agentName: 'requirements-analyst',
    });

    proposeScenarioDrafts(cwd, 'US-001', [
      {
        title: 'Show current model',
        given: ['v3 is confirmed'],
        when: 'The lead opens the workspace',
        then: ['v3 is shown as current'],
        businessData: ['version=v3'],
      },
    ]);
    expect(() => prepareActivityRun(cwd)).toThrow('/evidence-scenario');
  });
});
