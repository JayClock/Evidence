import { describe, expect, it, vi } from 'vitest';
import type { Workspace, WorkspaceRespond } from '@evidence/server-domain';
import type { ResourceResolver } from './resource-resolver.service';
import { RespondController } from './respond.controller';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

function fixture() {
  const stopped = new Error('stop after port capture');
  const respond = {
    findRespond: vi.fn(),
    proposeCandidate: vi.fn(async () => Promise.reject(stopped)),
    decideRespond: vi.fn(async () => Promise.reject(stopped)),
  } satisfies WorkspaceRespond;
  const workspace = { respond: () => respond } as unknown as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    currentUserId: vi.fn(() => 'user-1'),
  } as unknown as ResourceResolver;
  return { controller: new RespondController(resolver), respond, stopped };
}

describe('RespondController', () => {
  it('accepts only a bounded structured Candidate from the local Learner', async () => {
    const { controller, respond, stopped } = fixture();

    await expect(
      controller.proposeCandidate('workspace-1', 'iteration-1', {
        actionId: 'respond:iteration-1:10',
        expectedIterationVersion: 10,
        authoritySha256: sha('a'),
        promotions: [
          {
            sourceRef: 'iteration:model-observation',
            kind: 'model',
            decision: 'deferred',
            reason: 'The observation needs another Scenario.',
            validationEvidenceRefs: ['showcase:decision-1'],
            canonicalTarget: '.evidence/entities/order.yaml',
          },
        ],
        observedOutcomes: ['The product outcome was accepted.'],
        residualRisks: [],
        nextProbe: {
          question: 'Which model rule needs another Scenario?',
          whyNow: 'One observation was deferred.',
          evidenceRefs: ['showcase:decision-1'],
          firstAction: 'A human decides whether to capture the Probe.',
        },
      }),
    ).rejects.toBe(stopped);

    expect(respond.proposeCandidate).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        actionId: 'respond:iteration-1:10',
        authoritySha256: sha('a'),
        promotions: [expect.objectContaining({ decision: 'deferred' })],
      }),
    );
  });

  it('records the current user as the sole Respond decision actor', async () => {
    const { controller, respond, stopped } = fixture();

    await expect(
      controller.decide('workspace-1', 'iteration-1', {
        expectedIterationVersion: 11,
        candidateId: 'respond-candidate-1',
        candidateSha256: sha('c'),
        authoritySha256: sha('a'),
        action: 'approve',
        reason: 'The knowledge response and next Probe are reviewable.',
      }),
    ).rejects.toBe(stopped);

    expect(respond.decideRespond).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        candidateId: 'respond-candidate-1',
        candidateSha256: sha('c'),
        action: 'approve',
      }),
      'user-1',
    );
  });
});
