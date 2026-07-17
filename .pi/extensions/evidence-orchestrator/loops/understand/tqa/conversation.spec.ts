import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import { readState, writeState } from '../../../iteration/state-repository';
import {
  answerClarification,
  askClarification,
  MAX_CLARIFICATION_QUESTION_BYTES,
  waivePendingClarification,
} from './conversation';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../../test-support/support';

afterEach(cleanupWorkspaces);

function prepareTqa(cwd: string): void {
  write(
    cwd,
    'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
    '# US-001 Confirm current model',
  );
  writeState(cwd, {
    ...DEFAULT_STATE,
    loop: 'understand',
    understand_stage: 'tqa',
    active_clarification_story: {
      story_id: 'US-001',
      selected_at: '2026-01-01T00:00:00.000Z',
    },
  });
}

describe('single-Story TQA', () => {
  it('records one question and routes only the explicit human answer', () => {
    const cwd = workspace();
    prepareTqa(cwd);

    const pending = askClarification(
      cwd,
      {
        story_id: 'US-001',
        question: 'Who confirms which model version is current?',
        target: 'business_context',
      },
      '2026-01-01T00:01:00.000Z',
    );
    expect(pending.pending_clarification?.question_id).toBe('Q-001');
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-001',
        question: 'What happens next?',
        target: 'history',
      }),
    ).toThrow('awaits an answer');

    const answered = answerClarification(
      cwd,
      'The modeling lead confirms v3.',
      '2026-01-01T00:02:00.000Z',
    );
    expect(answered.pending_clarification).toBeUndefined();
    expect(answered.clarification_history?.[0]).toMatchObject({
      answer: 'The modeling lead confirms v3.',
      answered_at: '2026-01-01T00:02:00.000Z',
    });
    const delta =
      'artifacts/iterations/ITER-0001/01-requirements/product-context-delta.md';
    expect(existsSync(`${cwd}/${delta}`)).toBe(true);
    expect(readFileSync(`${cwd}/${delta}`, 'utf8')).toContain(
      'The modeling lead confirms v3.',
    );
  });

  it('routes a Card correction back to Kickoff without appending Conversation to the Story', () => {
    const cwd = workspace();
    prepareTqa(cwd);
    const storyPath =
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md';
    const original = readFileSync(`${cwd}/${storyPath}`, 'utf8');
    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Which role actually benefits from confirming the model?',
      target: 'story',
    });

    const state = answerClarification(
      cwd,
      'The collaboration lead benefits, not the modeling lead.',
      '2026-01-01T00:02:00.000Z',
    );

    expect(state.loop).toBe('kickoff');
    expect(state.understand_stage).toBeUndefined();
    expect(state.feedback_history?.at(-1)).toMatchObject({
      target: 'story',
      from_loop: 'understand',
      to_loop: 'kickoff',
      decided_by: 'human',
    });
    expect(readFileSync(`${cwd}/${storyPath}`, 'utf8')).toBe(original);
    expect(readFileSync(`${cwd}/${storyPath}`, 'utf8')).not.toContain(
      '## TQA 澄清',
    );
  });

  it('rejects a question that cannot fit intact in the bounded parent dialogue', () => {
    const cwd = workspace();
    prepareTqa(cwd);

    expect(() =>
      askClarification(cwd, {
        story_id: 'US-001',
        question: '界'.repeat(MAX_CLARIFICATION_QUESTION_BYTES),
        target: 'history',
      }),
    ).toThrow(`maximum is ${MAX_CLARIFICATION_QUESTION_BYTES}`);
  });

  it('waives the sole pending question only through a human split/defer path', () => {
    const cwd = workspace();
    prepareTqa(cwd);
    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Which authority decides?',
      target: 'history',
    });

    const state = waivePendingClarification(
      cwd,
      'The Story must be split before answering.',
      '2026-01-01T00:03:00.000Z',
    );

    expect(state.pending_clarification).toBeUndefined();
    expect(state.clarification_history?.at(-1)).toMatchObject({
      waived_by: 'human',
      waived_reason: 'The Story must be split before answering.',
    });
    expect(
      Object.keys(readState(cwd)).some((key) => key.startsWith('paused_')),
    ).toBe(false);
  });
});
