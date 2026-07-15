import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './default-state';
import {
  assertCanStartIteration,
  readPersistedState,
  readState,
  transitionWorkflowLoop,
  writeState,
} from './state-repository';
import { cleanupWorkspaces, workspace } from '../test-support/support';
import type { WorkflowState } from './state';

afterEach(cleanupWorkspaces);

describe('workflow state', () => {
  it('persists native loop transitions without a phase projection', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    const state = transitionWorkflowLoop(cwd, { to: 'understand' });

    expect(state.loop).toBe('understand');
    expect(readState(cwd).loop).toBe('understand');
    expect(state).not.toHaveProperty('phase');
  });

  it('rejects retired version, phase, gate, and runtime metadata fields', () => {
    const cwd = workspace();
    for (const field of [
      'workflow_version',
      'phase',
      'pending_gate',
      'paused_questions',
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
