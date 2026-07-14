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
    expect(status.version).toBe(3);
    expect(status.stories[0]).toEqual(
      expect.objectContaining({
        status: 'clarified',
        decided_by: 'human',
        confirmed_at: expect.any(String),
        proposal: expect.objectContaining({ outcome: 'clarified' }),
      }),
    );
  });

  it('treats reselecting the active story as an idempotent resume', () => {
    const cwd = workspace();
    prepareStory(cwd);
    const selected = selectClarificationStory(cwd, 'US-001');
    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Who approves publication?',
      target: 'history',
    });

    const resumed = selectClarificationStory(cwd, 'US-001');

    expect(resumed.active_clarification_story).toEqual(
      selected.active_clarification_story,
    );
    expect(resumed.pending_clarification).toEqual(
      expect.objectContaining({ question_id: 'Q-001', story_id: 'US-001' }),
    );
  });

  it('switches stories with pending questions and restores each TQA', () => {
    const cwd = workspace();
    prepareStory(cwd);
    writeIterationArtifact(cwd, '01-requirements/stories/US-002.md');
    selectClarificationStory(cwd, 'US-001');
    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Who approves publication?',
      target: 'history',
    });

    const switched = selectClarificationStory(cwd, 'US-002');
    expect(switched.active_clarification_story?.story_id).toBe('US-002');
    expect(switched.pending_clarification).toBeUndefined();
    expect(switched.paused_clarifications).toEqual([
      expect.objectContaining({ question_id: 'Q-001', story_id: 'US-001' }),
    ]);
    expect(() => completePhase(cwd, 'clarify')).toThrow(
      'pending clarification Q-001',
    );

    askClarification(cwd, {
      story_id: 'US-002',
      question: 'Who shares it?',
      target: 'history',
    });
    const resumedFirst = selectClarificationStory(cwd, 'US-001');
    expect(resumedFirst.pending_clarification).toEqual(
      expect.objectContaining({ question_id: 'Q-001', story_id: 'US-001' }),
    );
    expect(resumedFirst.paused_clarifications).toEqual([
      expect.objectContaining({ question_id: 'Q-002', story_id: 'US-002' }),
    ]);

    answerClarification(cwd, 'The workspace owner.');
    const resumedSecond = selectClarificationStory(cwd, 'US-002');
    expect(resumedSecond.pending_clarification).toEqual(
      expect.objectContaining({ question_id: 'Q-002', story_id: 'US-002' }),
    );
  });

  it('switches stories while a human decision is pending and restores it', () => {
    const cwd = workspace();
    prepareStory(cwd);
    writeIterationArtifact(cwd, '01-requirements/stories/US-002.md');
    selectClarificationStory(cwd, 'US-001');
    proposeClarificationStoryOutcome(cwd, 'US-001', 'clarified', 'Clear.');

    const switched = selectClarificationStory(cwd, 'US-002');
    expect(switched.active_clarification_story?.story_id).toBe('US-002');
    expect(switched.proposed_clarification_story_outcome).toBeUndefined();
    expect(switched.paused_clarification_story_outcome_proposals).toEqual([
      expect.objectContaining({ story_id: 'US-001', outcome: 'clarified' }),
    ]);
    expect(() =>
      validateClarificationStoriesComplete(cwd, readState(cwd)),
    ).toThrow('awaiting a human decision');

    const resumed = selectClarificationStory(cwd, 'US-001');
    expect(resumed.proposed_clarification_story_outcome).toEqual(
      expect.objectContaining({ story_id: 'US-001', outcome: 'clarified' }),
    );
    expect(
      resumed.paused_clarification_story_outcome_proposals,
    ).toBeUndefined();
  });

  it('lets the human complete directly and waives the pending question', () => {
    const cwd = workspace();
    prepareStory(cwd);
    selectClarificationStory(cwd, 'US-001');
    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Which edge case remains?',
      target: 'history',
    });

    const completed = confirmClarificationStoryOutcome(
      cwd,
      'clarified',
      'The domain expert considers the current detail sufficient.',
    );

    expect(completed.active_clarification_story).toBeUndefined();
    expect(completed.pending_clarification).toBeUndefined();
    expect(completed.clarification_history?.[0]).toEqual(
      expect.objectContaining({
        question_id: 'Q-001',
        waived_by: 'human',
        waived_reason:
          'The domain expert considers the current detail sufficient.',
        waived_at: expect.any(String),
      }),
    );
    expect(completed.clarification_story_outcomes?.[0]).toEqual(
      expect.objectContaining({
        story_id: 'US-001',
        outcome: 'clarified',
        decided_by: 'human',
      }),
    );
    expect(
      completed.clarification_story_outcomes?.[0]?.proposal,
    ).toBeUndefined();
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/clarifications/US-001.md',
        ),
        'utf8',
      ),
    ).toContain('状态：已放弃');
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
