import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import { writeState } from '../../../iteration/state-repository';
import { proposeKickoffCandidate } from '../../../loops/kickoff/story-candidate';
import { proposeScenarioDrafts } from '../../../loops/understand/scenario/candidates';
import {
  isCompletedIteration,
  prepareActivityRun,
  ActivityRunBlockedError,
} from './dispatch';
import {
  cleanupWorkspaces,
  testIntakeSnapshot,
  workspace,
  write,
} from '../../../test-support/support';
import type { WorkflowState } from '../../../iteration/state';

function issueState(): WorkflowState {
  return {
    ...DEFAULT_STATE,
    intake_snapshot: testIntakeSnapshot(),
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
  it('requires a frozen native iteration input', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => prepareActivityRun(cwd)).toThrow(
      'no frozen requirement input',
    );
  });

  it('routes method=none expansion to a deterministic no-model checkpoint', () => {
    const cwd = workspace();
    const scenarioPath =
      'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md';
    write(cwd, scenarioPath, '# Scenario');
    writeState(cwd, {
      ...issueState(),
      loop: 'understand',
      understand_stage: 'modeling',
      modeling_stage: 'expansion',
      confirmed_scenarios: [
        {
          version: 1,
          story_id: 'US-001',
          scenario_id: 'SC-001',
          source_draft_id: 'DRAFT-001',
          title: 'Change an interaction',
          given: ['The editor is open'],
          when: 'The owner saves the interaction change',
          then: ['The changed interaction is visible'],
          business_data: ['workspace=Alpha'],
          artifact_path: scenarioPath,
          confirmed_by: 'human',
          confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      modeling_profile: {
        version: 1,
        subject: 'tool',
        method: 'none',
        model_change_required: false,
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:01:00.000Z',
      },
    });

    const preparation = prepareActivityRun(cwd);
    if (isCompletedIteration(preparation))
      throw new Error('Unexpected complete.');

    expect(preparation).toMatchObject({
      activity: 'understand',
      modelingAction: 'complete_no_model',
    });
    expect(preparation).not.toHaveProperty('agentName');
    expect(preparation.task).toContain('不得启动 Model Builder');
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
      'docs/product/story-map.md',
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
    expect(preparation.task).toContain('docs/product/story-map.md');

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
