import { describe, expect, it, vi } from 'vitest';
import { IntakeApiClient } from './intake-api-client';

const apiBaseUrl = 'https://evidence.example/api';
const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const candidateSha256 = `sha256:${'b'.repeat(64)}`;
const baseCommitSha = 'c'.repeat(40);

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function extractionResource(status = 'awaiting_agent', version = 1) {
  return {
    _links: {
      self: {
        href: '/api/workspaces/workspace-1/inbox-extractions/extraction-1',
      },
      'propose-candidates': {
        href: '/api/workspaces/workspace-1/inbox-extractions/extraction-1/candidates',
      },
    },
    id: 'extraction-1',
    reference: 'EXTRACT-0001',
    status,
    version,
    sources: [
      {
        inboxItemId: 'inbox-1',
        inboxRevisionId: 'revision-1',
        contentSha256: revisionSha256,
      },
    ],
  };
}

function candidateResource() {
  return {
    _links: {
      self: {
        href: '/api/workspaces/workspace-1/story-candidates/candidate-1',
      },
      select: {
        href: '/api/workspaces/workspace-1/story-candidates/candidate-1/select',
      },
    },
    id: 'candidate-1',
    reference: 'CAND-0001',
    status: 'ready',
    contentSha256: candidateSha256,
  };
}

function iterationResource(lifecycle = 'provisioning', version = 1) {
  return {
    _links: {
      self: { href: '/api/workspaces/workspace-1/iterations/iteration-1' },
      intake: {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/intake',
      },
      kickoff: {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/kickoff',
      },
      'complete-provisioning': {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/provisioning/complete',
      },
      'fail-provisioning': {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/provisioning/fail',
      },
    },
    id: 'iteration-1',
    reference: 'ITER-0001',
    lifecycle,
    loop: 'kickoff',
    stage: 'candidate_review',
    version,
    baseCommitSha,
    branchName: lifecycle === 'active' ? 'evidence/iter-0001' : null,
  };
}

describe('IntakeApiClient', () => {
  it('captures sources and creates an explicit Extraction inside the API root', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ id: 'inbox-1' }, 201))
      .mockResolvedValueOnce(response(extractionResource(), 201));
    const client = new IntakeApiClient({
      apiBaseUrl,
      authorization: 'Bearer secret',
      fetch,
    });

    await client.captureSource('workspace-1', {
      sourceKind: 'manual_text',
      externalKey: `manual:${'d'.repeat(64)}`,
      title: 'Requirement',
      body: 'Exact body',
      contentType: 'text/plain',
      uri: null,
      providerMetadata: {},
      sourceUpdatedAt: null,
    });
    const extraction = await client.createExtraction('workspace-1', [
      'inbox-1',
    ]);

    expect(extraction).toMatchObject({
      id: 'extraction-1',
      status: 'awaiting_agent',
      version: 1,
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      new URL(
        'https://evidence.example/api/workspaces/workspace-1/inbox-items',
      ),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      inboxItemIds: ['inbox-1'],
    });
  });

  it('submits one Candidate batch through the server-provided action link', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(
        {
          extraction: extractionResource('completed', 2),
          _embedded: { storyCandidates: [candidateResource()] },
        },
        201,
      ),
    );
    const client = new IntakeApiClient({ apiBaseUrl, fetch });
    const extraction = {
      id: 'extraction-1',
      reference: 'EXTRACT-0001',
      status: 'awaiting_agent' as const,
      version: 1,
      sources: [],
      links: {
        'propose-candidates':
          '/api/workspaces/workspace-1/inbox-extractions/extraction-1/candidates',
      },
      raw: {},
    };
    const candidates = [
      {
        title: 'One Story',
        problem: 'Mutable input is unsafe.',
        role: 'Maintainer',
        goal: 'Freeze one intake.',
        value: 'Decisions are auditable.',
        cognitiveMode: 'complicated' as const,
        citations: [
          {
            inboxItemId: 'inbox-1',
            revisionSha256,
            locator: 'whole-source',
          },
        ],
      },
    ];

    const result = await client.proposeInboxCandidates(extraction, candidates);

    expect(result.extraction.status).toBe('completed');
    expect(result.candidates[0]).toMatchObject({
      id: 'candidate-1',
      status: 'ready',
      contentSha256: candidateSha256,
    });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      expectedVersion: 1,
      candidates,
    });
  });

  it('selects and provisions an Iteration without sending a repository path', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(iterationResource(), 201))
      .mockResolvedValueOnce(response(iterationResource('active', 2)));
    const client = new IntakeApiClient({ apiBaseUrl, fetch });
    const candidate = {
      id: 'candidate-1',
      reference: 'CAND-0001',
      status: 'ready' as const,
      contentSha256: candidateSha256,
      links: {
        select:
          '/api/workspaces/workspace-1/story-candidates/candidate-1/select',
      },
      raw: {},
    };

    const iteration = await client.selectCandidate(candidate, baseCommitSha);
    const active = await client.completeProvisioning(
      iteration,
      'evidence/iter-0001',
    );

    expect(active.lifecycle).toBe('active');
    const requests = fetch.mock.calls.map((call) =>
      call[1]?.body ? JSON.parse(String(call[1].body)) : null,
    );
    expect(requests).toEqual([
      { candidateSha256, baseCommitSha },
      {
        expectedVersion: 1,
        baseCommitSha,
        branchName: 'evidence/iter-0001',
      },
    ]);
    expect(JSON.stringify(requests)).not.toContain('/Users/');
  });

  it('rejects cross-origin HAL actions before sending credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new IntakeApiClient({
      apiBaseUrl,
      authorization: 'Bearer secret',
      fetch,
    });
    const extraction = {
      id: 'extraction-1',
      reference: 'EXTRACT-0001',
      status: 'awaiting_agent' as const,
      version: 1,
      sources: [],
      links: { 'propose-candidates': 'https://evil.example/steal' },
      raw: {},
    };

    await expect(client.proposeInboxCandidates(extraction, [])).rejects.toThrow(
      'outside the configured API root',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
