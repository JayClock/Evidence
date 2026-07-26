import { describe, expect, it } from 'vitest';
import { DomainError } from '../error';
import {
  assertKickoffCanConfirm,
  normalizeCompleteIterationProvisioningInput,
  normalizeFailIterationProvisioningInput,
  normalizeKickoffDecisionInput,
  normalizeKickoffReplacementProposal,
  normalizeSelectInboxCandidateInput,
  parseIterationLifecycle,
  parseIterationLoop,
  parseIterationStage,
  parseKickoffDecisionAction,
} from './validation';

const contentSha256 = `sha256:${'a'.repeat(64)}`;
const baseCommitSha = 'b'.repeat(40);

function replacementProposal() {
  return {
    title: 'Revised intake',
    problem: 'The frozen problem needs a narrower outcome.',
    role: 'Workspace maintainer',
    goal: 'Start one reviewable Story.',
    value: 'Delivery remains bounded.',
    cognitiveMode: 'clear' as const,
    citations: [
      {
        inboxItemId: 'INBOX-0001',
        revisionSha256: contentSha256,
        locator: 'paragraph 2',
      },
    ],
  };
}

describe('Iteration admission validation', () => {
  it('locks an exact Candidate and Git base without granting Story authority', () => {
    expect(
      normalizeSelectInboxCandidateInput({
        candidateId: ' candidate-1 ',
        candidateSha256: contentSha256.toUpperCase(),
        baseCommitSha: baseCommitSha.toUpperCase(),
      }),
    ).toEqual({
      candidateId: 'candidate-1',
      candidateSha256: contentSha256,
      baseCommitSha,
    });
  });

  it('accepts only deterministic iteration branches at the locked base', () => {
    expect(
      normalizeCompleteIterationProvisioningInput({
        expectedVersion: 1,
        baseCommitSha,
        branchName: 'evidence/iter-0001',
      }),
    ).toEqual({
      expectedVersion: 1,
      baseCommitSha,
      branchName: 'evidence/iter-0001',
    });
    expect(() =>
      normalizeCompleteIterationProvisioningInput({
        expectedVersion: 1,
        baseCommitSha,
        branchName: 'feature/untrusted',
      }),
    ).toThrow('evidence/iter');
  });

  it('requires an explicit provisioning failure reason', () => {
    expect(
      normalizeFailIterationProvisioningInput({
        expectedVersion: 2,
        reason: ' Worktree already exists. ',
      }),
    ).toEqual({ expectedVersion: 2, reason: 'Worktree already exists.' });
    expect(() =>
      normalizeFailIterationProvisioningInput({
        expectedVersion: 2,
        reason: ' ',
      }),
    ).toThrow('reason is required');
  });

  it('rejects malformed Candidate hashes and Git SHAs', () => {
    expect(() =>
      normalizeSelectInboxCandidateInput({
        candidateId: 'candidate-1',
        candidateSha256: 'bad',
        baseCommitSha,
      }),
    ).toThrow(DomainError);
    expect(() =>
      normalizeSelectInboxCandidateInput({
        candidateId: 'candidate-1',
        candidateSha256: contentSha256,
        baseCommitSha: 'bad',
      }),
    ).toThrow(DomainError);
  });
});

describe('Kickoff authority validation', () => {
  it('allows confirm without a reason and requires reasons otherwise', () => {
    expect(
      normalizeKickoffDecisionInput({
        proposalId: 'proposal-1',
        proposalSha256: contentSha256,
        expectedIterationVersion: 3,
        action: 'confirm',
      }),
    ).toEqual({
      proposalId: 'proposal-1',
      proposalSha256: contentSha256,
      expectedIterationVersion: 3,
      action: 'confirm',
      reason: null,
    });

    for (const action of ['revise', 'split', 'defer', 'stop'] as const) {
      expect(() =>
        normalizeKickoffDecisionInput({
          proposalId: 'proposal-1',
          proposalSha256: contentSha256,
          expectedIterationVersion: 3,
          action,
        }),
      ).toThrow('reason is required');
    }
  });

  it('normalizes one replacement Proposal without assigning a Story id', () => {
    expect(normalizeKickoffReplacementProposal(replacementProposal())).toEqual(
      replacementProposal(),
    );
  });

  it('prevents a second Story in one Iteration', () => {
    expect(() => assertKickoffCanConfirm(null)).not.toThrow();
    expect(() => assertKickoffCanConfirm('story-1')).toThrow(
      'cannot create more than one Story',
    );
  });

  it('only parses reachable lifecycle values', () => {
    expect(parseIterationLifecycle('provisioning')).toBe('provisioning');
    expect(parseIterationLoop('kickoff')).toBe('kickoff');
    expect(parseIterationStage('candidate_review')).toBe('candidate_review');
    expect(parseIterationStage('scenario_review')).toBe('scenario_review');
    expect(parseIterationStage('modeling')).toBe('modeling');
    expect(parseIterationLoop('tasking')).toBe('tasking');
    expect(parseIterationStage('desk_check')).toBe('desk_check');
    expect(parseIterationLoop('pair')).toBe('pair');
    expect(parseIterationStage('quality_gates_passed')).toBe(
      'quality_gates_passed',
    );
    expect(parseKickoffDecisionAction('stop')).toBe('stop');
    expect(() => parseIterationLifecycle('complete')).toThrow(DomainError);
    expect(() => parseIterationLoop('showcase')).toThrow(DomainError);
    expect(() => parseIterationStage('planning')).toThrow(DomainError);
    expect(() => parseKickoffDecisionAction('approve')).toThrow(DomainError);
  });
});
