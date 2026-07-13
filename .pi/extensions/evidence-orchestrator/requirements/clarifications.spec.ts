import { afterEach, describe, expect, it } from 'vitest';
import {
  answerClarification,
  askClarification,
  completeClarificationStory,
  selectClarificationStory,
  validateClarificationStoriesComplete,
} from './clarifications';
import { completePhase } from '../workflow/gates';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

function prepareStory(cwd: string, storyId = 'US-001'): void {
  writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });
  writeIterationArtifact(cwd, `01-requirements/stories/${storyId}.md`);
  writeIterationArtifact(cwd, '01-requirements/product-context-delta.md');
}

afterEach(cleanupWorkspaces);

describe('clarifications', () => {
  it('selects one story before TQA and records its clarification outcome', () => {
    const cwd = workspace();
    prepareStory(cwd);

    expect(() =>
      askClarification(cwd, {
        story_id: 'US-001',
        question: 'Who approves publication?',
        target: 'business_context',
      }),
    ).toThrow('select a clarification story');

    expect(
      selectClarificationStory(cwd, 'US-001').active_clarification_story,
    ).toEqual(expect.objectContaining({ story_id: 'US-001' }));
    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Who approves publication?',
      target: 'business_context',
    });
    expect(readState(cwd).pending_clarification?.question_id).toBe('Q-001');
    expect(
      answerClarification(cwd, 'The workspace owner.').clarification_history,
    ).toHaveLength(1);

    const completed = completeClarificationStory(
      cwd,
      'US-001',
      'clarified',
      'The responsibility boundary is explicit.',
    );
    expect(completed.active_clarification_story).toBeUndefined();
    expect(completed.clarification_story_outcomes).toEqual([
      expect.objectContaining({
        story_id: 'US-001',
        outcome: 'clarified',
      }),
    ]);
  });

  it('does not permit switching stories or asking outside the selected story', () => {
    const cwd = workspace();
    prepareStory(cwd);
    writeIterationArtifact(cwd, '01-requirements/stories/US-002.md');
    selectClarificationStory(cwd, 'US-001');

    expect(() => selectClarificationStory(cwd, 'US-002')).toThrow(
      'US-001 is still active',
    );
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-002',
        question: 'Who shares it?',
        target: 'history',
      }),
    ).toThrow('selected story is US-001');
  });

  it('does not complete the phase while a story remains undispositioned', () => {
    const cwd = workspace();
    prepareStory(cwd);
    writeIterationArtifact(cwd, '01-requirements/stories/US-002.md');
    selectClarificationStory(cwd, 'US-001');
    completeClarificationStory(cwd, 'US-001', 'clarified', 'Clear.');

    expect(() =>
      validateClarificationStoriesComplete(cwd, readState(cwd)),
    ).toThrow('US-002');
  });

  it('allows the clarify phase to advance after every story has an outcome', () => {
    const cwd = workspace();
    prepareStory(cwd);
    selectClarificationStory(cwd, 'US-001');
    completeClarificationStory(cwd, 'US-001', 'clarified', 'Clear.');

    expect(completePhase(cwd, 'clarify').phase).toBe('specify');
  });

  it('does not permit a second question while an answer is pending', () => {
    const cwd = workspace();
    prepareStory(cwd);
    selectClarificationStory(cwd, 'US-001');
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
