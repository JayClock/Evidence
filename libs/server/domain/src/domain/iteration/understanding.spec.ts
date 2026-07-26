import { describe, expect, it } from 'vitest';
import {
  MAX_CLARIFICATION_QUESTION_BYTES,
  normalizeAnswerClarificationInput,
  normalizeAskClarificationInput,
  normalizeScenarioSetInput,
  normalizeUnderstandingDecisionInput,
} from './understanding-validation';

const sha256 = `sha256:${'a'.repeat(64)}`;

function scenario(title = 'Confirm current model') {
  return {
    title,
    given: ['Workspace Alpha contains model v3'],
    when: 'The modeling lead opens the shared model',
    then: ['Model v3 is visibly marked current'],
    businessData: ['workspace=alpha', 'version=v3'],
  };
}

describe('one-Story TQA validation', () => {
  it('normalizes one business-facing clarification', () => {
    expect(
      normalizeAskClarificationInput({
        expectedIterationVersion: 3,
        storyId: ' story-1 ',
        storyRevisionId: ' revision-1 ',
        target: 'business_context',
        question: ' Who confirms which model version is current? ',
      }),
    ).toEqual({
      expectedIterationVersion: 3,
      storyId: 'story-1',
      storyRevisionId: 'revision-1',
      target: 'business_context',
      question: 'Who confirms which model version is current?',
    });
  });

  it('bounds the complete question by UTF-8 bytes', () => {
    expect(() =>
      normalizeAskClarificationInput({
        expectedIterationVersion: 1,
        storyId: 'story-1',
        storyRevisionId: 'revision-1',
        target: 'history',
        question: '界'.repeat(MAX_CLARIFICATION_QUESTION_BYTES),
      }),
    ).toThrow('UTF-8 bytes');
  });

  it('preserves the domain expert answer without summarizing it', () => {
    expect(
      normalizeAnswerClarificationInput({
        expectedIterationVersion: 4,
        clarificationId: 'question-1',
        answer: ' The collaboration lead confirms v3.\r\nNo proxy may decide. ',
      }).answer,
    ).toBe('The collaboration lead confirms v3.\nNo proxy may decide.');
  });
});

describe('Scenario Set validation', () => {
  it('normalizes one to five concrete non-duplicate drafts', () => {
    const normalized = normalizeScenarioSetInput({
      expectedIterationVersion: 5,
      storyId: 'story-1',
      storyRevisionId: 'revision-1',
      scenarios: [scenario(), scenario('No confirmed model exists')],
    });

    expect(normalized.scenarios).toHaveLength(2);
    expect(normalized.scenarios[0]?.businessData).toEqual([
      'workspace=alpha',
      'version=v3',
    ]);
  });

  it('rejects duplicate drafts and missing business data', () => {
    expect(() =>
      normalizeScenarioSetInput({
        expectedIterationVersion: 1,
        storyId: 'story-1',
        storyRevisionId: 'revision-1',
        scenarios: [scenario(), scenario()],
      }),
    ).toThrow('duplicate drafts');
    expect(() =>
      normalizeScenarioSetInput({
        expectedIterationVersion: 1,
        storyId: 'story-1',
        storyRevisionId: 'revision-1',
        scenarios: [{ ...scenario(), businessData: [] }],
      }),
    ).toThrow('businessData');
  });

  it('locks confirmation to a Proposal hash and selected Draft ids', () => {
    expect(
      normalizeUnderstandingDecisionInput({
        expectedIterationVersion: 6,
        action: 'confirm',
        proposalId: 'proposal-1',
        proposalSha256: sha256.toUpperCase(),
        selectedDraftIds: ['draft-1', 'draft-2'],
      }),
    ).toEqual({
      expectedIterationVersion: 6,
      action: 'confirm',
      proposalId: 'proposal-1',
      proposalSha256: sha256,
      selectedDraftIds: ['draft-1', 'draft-2'],
      reason: null,
    });
  });

  it('requires reasons for every non-confirm decision', () => {
    for (const action of ['continue', 'split', 'defer'] as const) {
      expect(() =>
        normalizeUnderstandingDecisionInput({
          expectedIterationVersion: 6,
          action,
          proposalId: action === 'continue' ? 'proposal-1' : null,
          proposalSha256: action === 'continue' ? sha256 : null,
        }),
      ).toThrow('requires a reason');
    }
  });
});
