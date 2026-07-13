import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  answerClarification,
  askClarification,
  confirmClarificationStoryOutcome,
  continueClarificationStory,
  proposeClarificationStoryOutcome,
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
  it('keeps the story active until a human confirms the proposed outcome', () => {
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

    const proposed = proposeClarificationStoryOutcome(
      cwd,
      'US-001',
      'clarified',
      'The responsibility boundary is explicit.',
    );
    expect(proposed.active_clarification_story?.story_id).toBe('US-001');
    expect(proposed.clarification_story_outcomes).toBeUndefined();
    expect(proposed.proposed_clarification_story_outcome).toEqual(
      expect.objectContaining({
        story_id: 'US-001',
        outcome: 'clarified',
      }),
    );

    const completed = confirmClarificationStoryOutcome(
      cwd,
      'clarified',
      'The responsibility boundary is explicit.',
    );
    expect(completed.active_clarification_story).toBeUndefined();
    expect(completed.proposed_clarification_story_outcome).toBeUndefined();
    expect(completed.clarification_story_outcomes).toEqual([
      expect.objectContaining({
        story_id: 'US-001',
        outcome: 'clarified',
        decided_by: 'human',
        confirmed_at: expect.any(String),
        proposal: expect.objectContaining({ outcome: 'clarified' }),
      }),
    ]);
    const status = JSON.parse(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/clarifications/story-status.json',
        ),
        'utf8',
      ),
    ) as {
      version: number;
      stories: Array<Record<string, unknown>>;
    };
    expect(status.version).toBe(2);
    expect(status.stories[0]).toEqual(
      expect.objectContaining({
        status: 'clarified',
        decided_by: 'human',
        confirmed_at: expect.any(String),
        proposal: expect.objectContaining({ outcome: 'clarified' }),
      }),
    );
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

  it('does not complete or switch stories while a human decision is pending', () => {
    const cwd = workspace();
    prepareStory(cwd);
    writeIterationArtifact(cwd, '01-requirements/stories/US-002.md');
    selectClarificationStory(cwd, 'US-001');
    proposeClarificationStoryOutcome(cwd, 'US-001', 'clarified', 'Clear.');

    expect(() => selectClarificationStory(cwd, 'US-002')).toThrow(
      'US-001 is still active',
    );
    expect(() =>
      validateClarificationStoriesComplete(cwd, readState(cwd)),
    ).toThrow('awaiting a human decision');
  });

  it('allows the human to override the AI proposal before completing the story', () => {
    const cwd = workspace();
    prepareStory(cwd);
    selectClarificationStory(cwd, 'US-001');
    proposeClarificationStoryOutcome(cwd, 'US-001', 'clarified', 'Clear.');

    const completed = confirmClarificationStoryOutcome(
      cwd,
      'needs_split',
      'The expert identified two independently valuable outcomes.',
    );

    expect(completed.clarification_story_outcomes?.[0]).toEqual(
      expect.objectContaining({
        outcome: 'needs_split',
        decided_by: 'human',
        proposal: expect.objectContaining({ outcome: 'clarified' }),
      }),
    );
  });

  it('continues clarification when the human rejects the AI proposal', () => {
    const cwd = workspace();
    prepareStory(cwd);
    selectClarificationStory(cwd, 'US-001');
    proposeClarificationStoryOutcome(cwd, 'US-001', 'clarified', 'Clear.');

    const continued = continueClarificationStory(cwd);
    expect(continued.proposed_clarification_story_outcome).toBeUndefined();
    expect(continued.active_clarification_story?.story_id).toBe('US-001');
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-001',
        question: 'Which boundary still needs a decision?',
        target: 'history',
      }),
    ).not.toThrow();
  });

  it('allows the clarify phase to advance only after human confirmation', () => {
    const cwd = workspace();
    prepareStory(cwd);
    selectClarificationStory(cwd, 'US-001');
    proposeClarificationStoryOutcome(cwd, 'US-001', 'clarified', 'Clear.');
    expect(() => completePhase(cwd, 'clarify')).toThrow(
      'awaiting a human decision',
    );

    confirmClarificationStoryOutcome(cwd, 'clarified', 'Clear.');
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
