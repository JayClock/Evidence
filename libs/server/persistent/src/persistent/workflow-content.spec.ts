import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '@evidence/server-domain';
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

type HashVectors = {
  canonicalJson: Array<{ value: JsonValue; sha256: string }>;
  workflows: {
    inboxCandidate: {
      input: Parameters<typeof hashInboxCandidateInput>[0];
      normalized: ReturnType<typeof hashInboxCandidateInput>['candidate'];
      sha256: string;
    };
    candidateDecision: {
      input: Parameters<typeof hashInboxCandidateDecision>[0];
      output: ReturnType<typeof hashInboxCandidateDecision>;
    };
    iterationIntake: {
      input: Parameters<typeof hashIterationIntake>[0];
      sha256: string;
    };
    kickoffProposal: {
      input: Parameters<typeof hashKickoffProposal>[0];
      normalized: ReturnType<typeof hashKickoffProposal>['candidate'];
      sha256: string;
    };
    kickoffDecision: {
      input: Parameters<typeof hashKickoffDecision>[0];
      output: ReturnType<typeof hashKickoffDecision>;
    };
  };
};

const repositoryRoot = process.cwd().endsWith('libs/server/persistent')
  ? resolve(process.cwd(), '../../..')
  : process.cwd();
const hashVectors = JSON.parse(
  readFileSync(
    resolve(
      repositoryRoot,
      'libs/contracts/api-contracts/baseline/hash-vectors.json',
    ),
    'utf8',
  ),
) as HashVectors;

describe('workflow content hashing', () => {
  it('matches the language-neutral replacement vectors', () => {
    for (const vector of hashVectors.canonicalJson) {
      expect(hashCanonicalJson(vector.value)).toBe(vector.sha256);
    }

    const workflows = hashVectors.workflows;
    expect(hashInboxCandidateInput(workflows.inboxCandidate.input)).toEqual({
      candidate: workflows.inboxCandidate.normalized,
      contentSha256: workflows.inboxCandidate.sha256,
    });
    expect(
      hashInboxCandidateDecision(workflows.candidateDecision.input),
    ).toEqual(workflows.candidateDecision.output);
    expect(hashIterationIntake(workflows.iterationIntake.input)).toBe(
      workflows.iterationIntake.sha256,
    );
    expect(hashKickoffProposal(workflows.kickoffProposal.input)).toEqual({
      candidate: workflows.kickoffProposal.normalized,
      contentSha256: workflows.kickoffProposal.sha256,
    });
    expect(hashKickoffDecision(workflows.kickoffDecision.input)).toEqual(
      workflows.kickoffDecision.output,
    );
  });
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
