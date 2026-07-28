import { describe, expect, it } from 'vitest';
import {
  parseRespondLearnerEvent,
  parseRespondLearnerRuntimeRequest,
} from './respond-learner-protocol';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

describe('Respond Learner protocol', () => {
  it('accepts one locked, bounded runtime request', () => {
    expect(
      parseRespondLearnerRuntimeRequest({
        id: 'respond:iteration-1:30',
        timeoutMs: 600_000,
        worktreeRoot: '/tmp/worktree',
        authoritySha256: sha('a'),
        approvedCommitSha: 'c'.repeat(40),
        changedPaths: ['libs/server/domain/src/respond.ts'],
        evidence: { storyRevision: { id: 'revision-1' } },
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'respond:iteration-1:30',
        authoritySha256: sha('a'),
        changedPaths: ['libs/server/domain/src/respond.ts'],
      }),
    );
  });

  it('accepts one structured Candidate but no human decision', () => {
    expect(
      parseRespondLearnerEvent({
        id: 'respond:iteration-1:30',
        event: 'complete',
        data: '',
        details: {
          promotions: [],
          noPromotionReason: 'No reusable knowledge was validated.',
          observedOutcomes: ['The Story value was accepted.'],
          residualRisks: [],
          nextProbe: {
            question: 'Which risk should be learned next?',
            whyNow: 'One bounded risk remains.',
            evidenceRefs: ['showcase:risk-Q4'],
            firstAction: 'A human decides whether to capture it.',
          },
          agentCallCount: 1,
        },
      }),
    ).toEqual(expect.objectContaining({ event: 'complete' }));
  });

  it('rejects a report that attempts to include decision authority', () => {
    expect(
      parseRespondLearnerEvent({
        id: 'respond:iteration-1:30',
        event: 'complete',
        data: '',
        details: {
          promotions: [],
          noPromotionReason: 'No reusable knowledge was validated.',
          observedOutcomes: ['The Story value was accepted.'],
          residualRisks: [],
          nextProbe: {
            question: 'Which risk should be learned next?',
            whyNow: 'One bounded risk remains.',
            evidenceRefs: ['showcase:risk-Q4'],
            firstAction: 'A human decides whether to capture it.',
          },
          decision: 'approve',
          agentCallCount: 1,
        },
      }),
    ).not.toHaveProperty('details.decision');
  });

  it('rejects empty promotions without an explicit reason', () => {
    expect(
      parseRespondLearnerEvent({
        id: 'respond:iteration-1:30',
        event: 'complete',
        data: '',
        details: {
          promotions: [],
          noPromotionReason: null,
          observedOutcomes: ['The Story value was accepted.'],
          residualRisks: [],
          nextProbe: {
            question: 'Which risk should be learned next?',
            whyNow: 'One bounded risk remains.',
            evidenceRefs: ['showcase:risk-Q4'],
            firstAction: 'A human decides whether to capture it.',
          },
          agentCallCount: 1,
        },
      }),
    ).toBeNull();
  });
});
