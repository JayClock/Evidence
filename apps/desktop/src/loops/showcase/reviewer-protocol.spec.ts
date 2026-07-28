import { describe, expect, it } from 'vitest';
import {
  parseShowcaseReviewerEvent,
  parseShowcaseReviewerRuntimeRequest,
} from './reviewer-protocol';

const sha256 = `sha256:${'a'.repeat(64)}`;

function request() {
  return {
    id: 'ACT-REVIEW',
    timeoutMs: 600_000,
    worktreeRoot: '/managed/iteration-1',
    evidenceBundleSha256: sha256,
    story: {
      reference: 'US-001',
      title: 'Observe delivered value',
      problem: 'Tests alone do not prove product value.',
      role: 'Delivery lead',
      goal: 'Observe the approved behavior.',
      value: 'Keep value acceptance human-owned.',
      scenarios: [
        {
          reference: 'SC-001',
          title: 'Observe value',
          given: ['an approved increment'],
          when: 'the product is opened',
          then: ['the behavior is visible'],
          businessData: ['workspace-1'],
        },
      ],
    },
    pair: {
      manifestSha256: sha256,
      finalDiffSha256: sha256,
      approvedCommitSha: 'b'.repeat(40),
      changedPaths: ['apps/desktop/src/showcase.ts'],
    },
    q2Observations: [],
    productObservations: [],
    riskDecisions: [],
    evaluations: [],
  };
}

describe('Showcase Reviewer protocol', () => {
  it('locks one local Reviewer request to its evidence bundle and commit', () => {
    expect(parseShowcaseReviewerRuntimeRequest(request())).toMatchObject({
      id: 'ACT-REVIEW',
      evidenceBundleSha256: sha256,
      pair: {
        approvedCommitSha: 'b'.repeat(40),
        changedPaths: ['apps/desktop/src/showcase.ts'],
      },
    });
  });

  it('accepts one structured report without human decision authority', () => {
    expect(
      parseShowcaseReviewerEvent({
        id: 'ACT-REVIEW',
        event: 'complete',
        data: '',
        details: {
          observedFacts: ['The evidence chain is complete.'],
          productDomainFeedback: ['The value is observable.'],
          technicalQualityFeedback: [],
          unresolvedAssumptions: [],
          recommendation: 'accept',
          agentCallCount: 1,
        },
      }),
    ).toMatchObject({
      event: 'complete',
      details: { recommendation: 'accept', agentCallCount: 1 },
    });

    expect(
      parseShowcaseReviewerEvent({
        id: 'ACT-REVIEW',
        event: 'complete',
        data: '',
        details: {
          observedFacts: [],
          productDomainFeedback: [],
          technicalQualityFeedback: [],
          unresolvedAssumptions: [],
          recommendation: 'accept',
          agentCallCount: 1,
        },
      }),
    ).toBeNull();
  });
});
