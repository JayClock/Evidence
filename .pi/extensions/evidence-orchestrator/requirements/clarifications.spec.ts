import { afterEach, describe, expect, it } from 'vitest';
import { answerClarification, askClarification } from './clarifications';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('clarifications', () => {
  it('persists an explicit answer and clears the sole pending question', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });
    writeIterationArtifact(cwd, '01-requirements/stories/US-001.md');
    writeIterationArtifact(cwd, '01-requirements/product-context-delta.md');

    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Who approves publication?',
      target: 'business_context',
    });
    expect(readState(cwd).pending_clarification?.question_id).toBe('Q-001');
    expect(
      answerClarification(cwd, 'The workspace owner.').clarification_history,
    ).toHaveLength(1);
  });

  it('does not permit a second question while an answer is pending', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });
    writeIterationArtifact(cwd, '01-requirements/stories/US-001.md');
    askClarification(cwd, {
      story_id: 'US-001',
      question: 'What is shared?',
      target: 'history',
    });
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-001',
        question: 'Who shares it?',
        target: 'history',
      }),
    ).toThrow('pending clarification Q-001');
  });
});
