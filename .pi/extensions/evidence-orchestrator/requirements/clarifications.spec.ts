import { afterEach, describe, expect, it } from 'vitest';
import {
  answerClarification,
  askClarification,
  readTqaDocument,
} from './clarifications';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

function discoverWorkspace(): string {
  const cwd = workspace();
  writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
  writeState(cwd, { ...DEFAULT_STATE, phase: 'discover' });
  return cwd;
}

describe('single-Story TQA', () => {
  it('persists one Thought and Question for the sole Story', () => {
    const cwd = discoverWorkspace();
    const state = askClarification(cwd, {
      story_id: 'US-001',
      thought: 'The observable confirmation is still unclear.',
      question: 'What must the user see after saving the title?',
    });

    expect(state.pending_clarification).toMatchObject({
      question_id: 'Q-001',
      story_id: 'US-001',
      thought: 'The observable confirmation is still unclear.',
    });
    expect(readTqaDocument(cwd)?.exchanges).toHaveLength(1);
  });

  it('blocks a second Question until the domain expert answers', () => {
    const cwd = discoverWorkspace();
    askClarification(cwd, {
      story_id: 'US-001',
      thought: 'One unknown remains.',
      question: 'Which title is valid?',
    });

    expect(() =>
      askClarification(cwd, {
        story_id: 'US-001',
        thought: 'Another unknown.',
        question: 'Who can edit it?',
      }),
    ).toThrow('awaiting a domain-expert answer');
  });

  it('rejects questions for a second Story', () => {
    const cwd = discoverWorkspace();
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-002',
        thought: 'Try another Story.',
        question: 'Should this be handled too?',
      }),
    ).toThrow('contains only US-001');
  });

  it('records the explicit Answer and advances question IDs', () => {
    const cwd = discoverWorkspace();
    askClarification(cwd, {
      story_id: 'US-001',
      thought: 'Confirmation is unclear.',
      question: 'What should be visible?',
    });
    const answered = answerClarification(cwd, 'The saved title on reload.');
    expect(answered.pending_clarification).toBeUndefined();
    expect(answered.clarification_history?.[0]).toMatchObject({
      question_id: 'Q-001',
      answer: 'The saved title on reload.',
    });

    expect(
      askClarification(cwd, {
        story_id: 'US-001',
        thought: 'Authorization remains unclear.',
        question: 'Who may change it?',
      }).pending_clarification?.question_id,
    ).toBe('Q-002');
  });
});
