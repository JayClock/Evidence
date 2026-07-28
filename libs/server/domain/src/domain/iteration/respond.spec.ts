import { describe, expect, it } from 'vitest';
import type { ProposeRespondCandidateInput } from './respond';
import {
  normalizeDecideRespondInput,
  normalizeProposeRespondCandidateInput,
} from './respond-validation';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

describe('Respond validation', () => {
  it('accepts an explicit no-promotion response with one concrete next Probe', () => {
    expect(normalizeProposeRespondCandidateInput(validProposal())).toEqual({
      ...validProposal(),
      noPromotionReason: '本轮没有可复用知识需要提升。',
    });
  });

  it('requires promoted knowledge to cite a canonical target and evidence', () => {
    const input = validProposal();
    input.promotions = [
      {
        sourceRef: 'iteration:learning/model-observation',
        kind: 'model',
        decision: 'promoted',
        reason: '模型规则被 Scenario 与 Showcase 共同验证。',
        validationEvidenceRefs: ['scenario:SC-001', 'showcase:decision-1'],
        canonicalTarget: null,
      },
    ];
    input.noPromotionReason = null;

    expect(() => normalizeProposeRespondCandidateInput(input)).toThrow(
      'Promoted knowledge requires a canonical target',
    );
  });

  it('rejects absolute local paths from bounded Server knowledge', () => {
    const input = validProposal();
    input.nextProbe.evidenceRefs = ['file:///Users/example/private.txt'];

    expect(() => normalizeProposeRespondCandidateInput(input)).toThrow(
      'cannot contain a local absolute path',
    );
  });

  it('locks human decisions to exact Candidate and authority hashes', () => {
    expect(
      normalizeDecideRespondInput({
        expectedIterationVersion: 11,
        candidateId: 'respond-candidate-1',
        candidateSha256: sha('c'),
        authoritySha256: sha('a'),
        action: 'approve',
        reason: '已审查知识处置、残余风险与下一轮 Probe。',
      }),
    ).toEqual({
      expectedIterationVersion: 11,
      candidateId: 'respond-candidate-1',
      candidateSha256: sha('c'),
      authoritySha256: sha('a'),
      action: 'approve',
      reason: '已审查知识处置、残余风险与下一轮 Probe。',
    });
  });
});

function validProposal(): ProposeRespondCandidateInput {
  return {
    actionId: 'respond:iteration-1:10',
    expectedIterationVersion: 10,
    authoritySha256: sha('a'),
    promotions: [],
    noPromotionReason: '本轮没有可复用知识需要提升。',
    observedOutcomes: ['领域专家观察到 Scenario 的用户价值。'],
    residualRisks: [],
    nextProbe: {
      question: '下一轮应验证哪一个尚未确认的产品风险？',
      whyNow: 'Showcase 留下了一个明确但不阻塞本轮的风险。',
      evidenceRefs: ['showcase:risk-Q4'],
      firstAction: '由人明确决定是否将该 Probe 收集进 Inbox。',
    },
  };
}
