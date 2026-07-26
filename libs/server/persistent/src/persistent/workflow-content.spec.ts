import { describe, expect, it } from 'vitest';
import {
  hashCanonicalJson,
  hashInboxCandidateDecision,
  hashInboxCandidateInput,
  hashIterationIntake,
  hashKickoffDecision,
  hashKickoffProposal,
} from './workflow-content';

const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const proposal = {
  title: 'One Story',
  problem: 'The intake must remain frozen.',
  role: 'Workspace maintainer',
  goal: 'Start one bounded iteration.',
  value: 'Changes remain traceable.',
  cognitiveMode: 'complicated' as const,
  citations: [
    {
      inboxItemId: 'INBOX-0001',
      revisionSha256,
      locator: 'whole-source',
    },
  ],
};

describe('workflow content hashing', () => {
  it('canonicalizes object keys without reordering evidence arrays', () => {
    expect(hashCanonicalJson({ second: 2, first: 1 })).toBe(
      hashCanonicalJson({ first: 1, second: 2 }),
    );
    expect(hashCanonicalJson(['a', 'b'])).not.toBe(
      hashCanonicalJson(['b', 'a']),
    );
  });

  it('normalizes and hashes an Inbox Candidate independently of authority', () => {
    const result = hashInboxCandidateInput({
      ...proposal,
      title: ' One Story ',
    });
    expect(result.candidate.title).toBe('One Story');
    expect(result.contentSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result).toEqual(hashInboxCandidateInput(result.candidate));
  });

  it('binds an Intake hash to all frozen content and projection text', () => {
    const first = hashIterationIntake({
      candidateSnapshot: { id: 'candidate-1', title: 'One Story' },
      sourceSnapshots: [{ id: 'revision-1', body: 'Requirement' }],
      requirementsProjection: '# One Story',
      frozenAt: '2026-01-01T00:00:00.000Z',
    });
    const changed = hashIterationIntake({
      candidateSnapshot: { id: 'candidate-1', title: 'One Story' },
      sourceSnapshots: [{ id: 'revision-1', body: 'Changed' }],
      requirementsProjection: '# One Story',
      frozenAt: '2026-01-01T00:00:00.000Z',
    });
    expect(first).not.toBe(changed);
  });

  it('separates candidate, proposal, and decision evidence', () => {
    const candidateHash = hashInboxCandidateInput(proposal).contentSha256;
    const proposalHash = hashKickoffProposal({
      proposal,
      origin: 'inbox_candidate',
      sequence: 1,
    }).contentSha256;
    const candidateDecision = hashInboxCandidateDecision({
      candidateId: 'candidate-1',
      candidateSha256: candidateHash,
      action: 'defer',
      reason: ' Not now. ',
      decidedByUserId: 'user-1',
      decidedAt: '2026-01-01T00:00:00.000Z',
    });
    const kickoffDecision = hashKickoffDecision({
      iterationId: 'iteration-1',
      proposalId: 'proposal-1',
      proposalSha256: proposalHash,
      expectedIterationVersion: 2,
      action: 'confirm',
      decidedByUserId: 'user-1',
      decidedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(candidateHash).not.toBe(proposalHash);
    expect(candidateDecision.reason).toBe('Not now.');
    expect(kickoffDecision.decision.reason).toBeNull();
    expect(kickoffDecision.contentSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
