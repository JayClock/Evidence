import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './phase-catalog';
import {
  newIterationState,
  readState,
  selectTestProcess,
  selectWorkItem,
  transitionWorkflowLoop,
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
  it('persists v5 loop transitions and their compatibility phase', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'kickoff',
    });

    const state = transitionWorkflowLoop(cwd, { to: 'understand' });

    expect(state).toMatchObject({
      workflow_version: 5,
      loop: 'understand',
      phase: 'clarify',
    });
    expect(readState(cwd).loop).toBe('understand');
  });

  it('requires v5 states to declare a loop', () => {
    const cwd = workspace();
    expect(() =>
      writeState(cwd, {
        ...DEFAULT_STATE,
        workflow_version: 5,
      }),
    ).toThrow('must declare its current knowledge loop');
  });

  it('rejects local iteration initialization in favor of an Issue snapshot', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');
    expect(() => newIterationState(cwd)).toThrow(
      'Local iteration initialization is disabled',
    );
  });

  it('requires every proposed story outcome to belong to the active story', () => {
    const cwd = workspace();

    expect(() =>
      writeState(cwd, {
        ...DEFAULT_STATE,
        phase: 'clarify',
        proposed_clarification_story_outcome: {
          story_id: 'US-001',
          outcome: 'clarified',
          summary: 'Clear.',
          proposed_at: '2026-01-01T00:00:00.000Z',
        },
      }),
    ).toThrow('must belong to the active clarification story');
  });

  it('rejects paused multi-Story clarification state in v5 Understand', () => {
    const cwd = workspace();
    expect(() =>
      writeState(cwd, {
        ...DEFAULT_STATE,
        workflow_version: 5,
        loop: 'understand',
        phase: 'clarify',
        understand_stage: 'tqa',
        active_clarification_story: {
          story_id: 'US-001',
          selected_at: '2026-01-01T00:00:00.000Z',
        },
        paused_clarifications: [
          {
            question_id: 'Q-001',
            story_id: 'US-002',
            question: 'Who approves?',
            target: 'history',
            asked_at: '2026-01-01T00:01:00.000Z',
          },
        ],
      }),
    ).toThrow('cannot pause questions or decisions for another Story');
  });

  it('accepts paused clarification state only for non-active stories', () => {
    const cwd = workspace();
    const state = writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      active_clarification_story: {
        story_id: 'US-002',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      paused_clarifications: [
        {
          question_id: 'Q-001',
          story_id: 'US-001',
          question: 'Who approves?',
          target: 'history',
          asked_at: '2026-01-01T00:01:00.000Z',
        },
      ],
      paused_clarification_story_outcome_proposals: [
        {
          story_id: 'US-003',
          outcome: 'clarified',
          summary: 'Clear.',
          proposed_at: '2026-01-01T00:02:00.000Z',
        },
      ],
    });

    expect(state.paused_clarifications?.[0]?.story_id).toBe('US-001');
    expect(
      state.paused_clarification_story_outcome_proposals?.[0]?.story_id,
    ).toBe('US-003');
    expect(() =>
      writeState(cwd, {
        ...state,
        paused_clarifications: [
          {
            question_id: 'Q-002',
            story_id: 'US-002',
            question: 'Conflicts with active.',
            target: 'history',
            asked_at: '2026-01-01T00:03:00.000Z',
          },
        ],
      }),
    ).toThrow('must not belong to the active clarification story');
  });

  it('accepts a direct human outcome and a waived clarification', () => {
    const cwd = workspace();
    const state = writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      clarification_story_outcomes: [
        {
          story_id: 'US-001',
          outcome: 'clarified',
          summary: 'Current detail is sufficient.',
          completed_at: '2026-01-01T00:03:00.000Z',
          decided_by: 'human',
          confirmed_at: '2026-01-01T00:03:00.000Z',
        },
      ],
      clarification_history: [
        {
          question_id: 'Q-001',
          story_id: 'US-001',
          question: 'Which edge case remains?',
          target: 'history',
          asked_at: '2026-01-01T00:01:00.000Z',
          waived_by: 'human',
          waived_reason: 'Current detail is sufficient.',
          waived_at: '2026-01-01T00:03:00.000Z',
        },
      ],
    });

    expect(state.clarification_story_outcomes?.[0]?.proposal).toBeUndefined();
    expect(state.clarification_history?.[0]?.waived_by).toBe('human');
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
