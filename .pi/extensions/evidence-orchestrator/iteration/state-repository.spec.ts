import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './default-state';
import {
  assertCanStartIteration,
  readPersistedState,
  readState,
  writeState,
} from './state-repository';
import { cleanupWorkspaces, workspace } from '../test-support/support';
import type { WorkflowState } from './state';
import { transitionLoopState } from './transition-graph';

afterEach(cleanupWorkspaces);

describe('workflow state', () => {
  it('persists native loop transitions without a phase projection', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    const state = writeState(
      cwd,
      transitionLoopState(readState(cwd), { to: 'understand' }),
    );

    expect(state.loop).toBe('understand');
    expect(readState(cwd).loop).toBe('understand');
    expect(state).not.toHaveProperty('phase');
  });

  it('rejects every field outside the native state contract', () => {
    const cwd = workspace();
    for (const field of [
      'workflow_version',
      'phase',
      'pending_gate',
      'paused_questions',
      'unknown_field',
    ]) {
      expect(() =>
        writeState(cwd, {
          ...DEFAULT_STATE,
          [field]: field === 'phase' ? 'frame' : [],
        } as unknown as WorkflowState),
      ).toThrow('Unsupported workflow state field');
    }
    expect(() =>
      writeState(cwd, {
        ...DEFAULT_STATE,
        pi: { enabled: true },
      } as unknown as WorkflowState),
    ).toThrow('Pi runtime metadata is invalid');
  });

  it('keeps exactly one pending question for the single Understand Story', () => {
    const cwd = workspace();
    const state = writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question: 'Who confirms the current model?',
        target: 'history',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });

    expect(state.pending_clarification?.story_id).toBe('US-001');
    expect(() =>
      writeState(cwd, {
        ...state,
        active_clarification_story: {
          story_id: 'US-002',
          selected_at: '2026-01-01T00:02:00.000Z',
        },
      }),
    ).toThrow('pending clarification is invalid');
  });

  it('allows approval without a reason but requires feedback reasons', () => {
    const cwd = workspace();
    const approved = writeState(cwd, {
      ...DEFAULT_STATE,
      desk_check_decisions: [
        {
          action: 'approve',
          decided_by: 'human',
          artifact_path:
            'artifacts/iterations/ITER-0001/04-planning/desk-checks/DESK-001.json',
          decided_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(approved.desk_check_decisions?.[0]).not.toHaveProperty('reason');
    expect(() =>
      writeState(cwd, {
        ...approved,
        desk_check_decisions: [
          {
            action: 'revise',
            decided_by: 'human',
            artifact_path:
              'artifacts/iterations/ITER-0001/04-planning/desk-checks/DESK-002.json',
            decided_at: '2026-01-01T00:01:00.000Z',
          },
        ],
      }),
    ).toThrow('Desk Check decision history is invalid');
  });

  it('distinguishes an idle repository from bootstrap state', () => {
    const cwd = workspace();

    expect(readPersistedState(cwd)).toBeUndefined();
    expect(readState(cwd)).toEqual(DEFAULT_STATE);
    expect(() => assertCanStartIteration(cwd)).not.toThrow();
  });

  it('starts another iteration only after the current one is terminal', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => assertCanStartIteration(cwd)).toThrow('ITER-0001 is active');

    writeState(cwd, { ...DEFAULT_STATE, loop: 'complete' });
    expect(() => assertCanStartIteration(cwd)).not.toThrow();
  });
});
