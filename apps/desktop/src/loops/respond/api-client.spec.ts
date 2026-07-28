import { describe, expect, it, vi } from 'vitest';
import type { ProposeRespondCandidateInput } from '@evidence/api-client';
import { RespondApiClient } from './api-client';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

describe('RespondApiClient', () => {
  it('posts one bounded Candidate through only the advertised HAL relation', async () => {
    const response = respondResponse();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(
        jsonResponse({
          _links: { self: response._links.self },
          respond: response,
          acceptedRecordId: 'respond-candidate-1',
        }),
      );
    const client = new RespondApiClient({
      apiBaseUrl: 'https://evidence.example/api',
      authorization: 'Bearer local',
      fetch,
    });
    const respond = await client.getRespond('workspace-1', 'iteration-1');
    const input: ProposeRespondCandidateInput = {
      actionId: 'respond:iteration-1:30',
      expectedIterationVersion: 30,
      authoritySha256: sha('a'),
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
    };

    await client.proposeCandidate(respond, input);

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      new URL(
        'https://evidence.example/api/workspaces/workspace-1/iterations/iteration-1/respond/candidates',
      ),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        headers: expect.objectContaining({ Authorization: 'Bearer local' }),
      }),
    );
  });

  it('rejects Respond links outside the configured API root', async () => {
    const response = respondResponse();
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ...response,
        _links: {
          ...response._links,
          'propose-candidate': { href: 'https://evil.example/respond' },
        },
      }),
    );
    const client = new RespondApiClient({
      apiBaseUrl: 'https://evidence.example/api',
      fetch,
    });
    const respond = await client.getRespond('workspace-1', 'iteration-1');

    await expect(
      client.proposeCandidate(respond, {
        actionId: 'respond:iteration-1:30',
        expectedIterationVersion: 30,
        authoritySha256: sha('a'),
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
      }),
    ).rejects.toThrow('outside the configured API root');
  });
});

function respondResponse() {
  return {
    _links: {
      self: {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/respond',
      },
      'propose-candidate': {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/respond/candidates',
      },
    },
    iteration: { id: 'iteration-1', version: 30 },
    candidates: [],
    decisions: [],
    nextAction: { kind: 'run_learner' },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
