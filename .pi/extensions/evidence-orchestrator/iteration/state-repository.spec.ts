import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './default-state';
import { readStateSnapshot } from '../compatibility/state-snapshot';
import {
  assertCanStartV5Iteration,
  readState,
  statePath,
  transitionWorkflowLoop,
  writeState,
} from './state-repository';
import { cleanupWorkspaces, workspace } from '../test-support/support';
import type { WorkflowState } from './state';

afterEach(cleanupWorkspaces);

describe('v5 state', () => {
  it('persists native loop transitions without a phase projection', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    const state = transitionWorkflowLoop(cwd, { to: 'understand' });

    expect(state.loop).toBe('understand');
    expect(readState(cwd).loop).toBe('understand');
    expect(state).not.toHaveProperty('phase');
  });

  it('rejects removed phase, gate, and paused multi-Story fields', () => {
    const cwd = workspace();
    for (const field of ['phase', 'pending_gate', 'paused_questions']) {
      expect(() =>
        writeState(cwd, {
          ...DEFAULT_STATE,
          [field]: field === 'phase' ? 'frame' : [],
        } as unknown as WorkflowState),
      ).toThrow('Deleted v4 state field is not supported');
    }
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

  it('reads a terminal v4 state without rewriting or activating it', () => {
    const cwd = workspace();
    const source = `${JSON.stringify(
      {
        iteration_id: 'ITER-0001',
        phase: 'complete',
        round: 0,
        pi: { enabled: true, version: 4 },
      },
      null,
      2,
    )}\n`;
    writeFileSync(statePath(cwd), source);

    expect(readStateSnapshot(cwd)).toMatchObject({
      workflow_version: 4,
      legacy_phase: 'complete',
      terminal: 'complete',
    });
    expect(() => readState(cwd)).toThrow('read-only');
    expect(readFileSync(statePath(cwd), 'utf8')).toBe(source);
    expect(() => assertCanStartV5Iteration(cwd)).not.toThrow();
  });

  it('rejects an active legacy state rather than migrating it', () => {
    const cwd = workspace();
    writeFileSync(
      statePath(cwd),
      `${JSON.stringify({ iteration_id: 'ITER-0001', phase: 'coding' })}\n`,
    );

    expect(() => readStateSnapshot(cwd)).toThrow(
      'Legacy iteration ITER-0001 is still active',
    );
  });
});
