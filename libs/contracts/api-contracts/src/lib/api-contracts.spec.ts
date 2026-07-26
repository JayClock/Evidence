import {
  apiBaseUrl,
  apiRequest,
  expectHalCollection,
  expectHalResource,
  expectResourceContentType,
  uniqueName,
} from './api-contracts.js';

const describeContracts = apiBaseUrl ? describe : describe.skip;

const mediaTypes = {
  root: 'application/vnd.evidence.root+json',
  health: 'application/vnd.evidence.health+json',
  user: 'application/vnd.evidence.user+json',
  workspace: 'application/vnd.evidence.workspace+json',
  memberships: 'application/vnd.evidence.memberships+json',
  inboxItem: 'application/vnd.evidence.inbox-item+json',
  inboxItems: 'application/vnd.evidence.inbox-items+json',
  inboxRevision: 'application/vnd.evidence.inbox-revision+json',
  inboxRevisions: 'application/vnd.evidence.inbox-revisions+json',
  inboxExtraction: 'application/vnd.evidence.inbox-extraction+json',
  inboxCandidateSet: 'application/vnd.evidence.inbox-candidate-set+json',
  storyCandidate: 'application/vnd.evidence.story-candidate+json',
  storyCandidates: 'application/vnd.evidence.story-candidates+json',
  iteration: 'application/vnd.evidence.iteration+json',
  iterationIntake: 'application/vnd.evidence.iteration-intake+json',
  kickoff: 'application/vnd.evidence.kickoff+json',
  kickoffDecisionResult:
    'application/vnd.evidence.kickoff-decision-result+json',
  story: 'application/vnd.evidence.story+json',
  stories: 'application/vnd.evidence.stories+json',
  storyRevision: 'application/vnd.evidence.story-revision+json',
  storyRevisions: 'application/vnd.evidence.story-revisions+json',
  codingRun: 'application/vnd.evidence.coding-run+json',
  codingRuns: 'application/vnd.evidence.coding-runs+json',
  logicalEntity: 'application/vnd.evidence.logical-entity+json',
  logicalEntities: 'application/vnd.evidence.logical-entities+json',
  logicalRelationship: 'application/vnd.evidence.logical-relationship+json',
  logicalRelationships: 'application/vnd.evidence.logical-relationships+json',
  member: 'application/vnd.evidence.member+json',
  members: 'application/vnd.evidence.members+json',
  diagram: 'application/vnd.evidence.diagram+json',
  nodes: 'application/vnd.evidence.nodes+json',
  edges: 'application/vnd.evidence.edges+json',
} as const;

async function createContractWorkspace(prefix: string) {
  const title = uniqueName(prefix);
  return apiRequest('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({
      title,
      metadata: { source: 'api-contracts' },
    }),
  });
}

describeContracts('Evidence API contract vertical slice', () => {
  const userId = 'desktop-user';

  it('exposes root, health, user, and seeded workspace resources as HAL-style resources', async () => {
    if (!apiBaseUrl) throw new Error('API_BASE_URL is required');
    const unauthorized = await fetch(`${apiBaseUrl}/api`);
    expect(unauthorized.status).toBe(401);
    const publicHealth = await fetch(`${apiBaseUrl}/health`);
    expect(publicHealth.status).toBe(200);

    const root = await apiRequest('/api');
    expect(root.status).toBe(200);
    expectHalResource(root, mediaTypes.root);
    expect(root.body._links).toMatchObject({
      self: { href: '/api' },
      health: { href: '/health' },
      'current-user': { href: '/api/users/desktop-user' },
    });
    const health = await apiRequest('/health');
    expect(health.status).toBe(200);
    expectHalResource(health, mediaTypes.health);
    expect(health.body.status).toBe('ok');

    const openapi = await apiRequest('/api/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.body.security).toEqual([{ evidenceAuthorization: [] }]);
    expect(openapi.body.components.securitySchemes).toHaveProperty(
      'evidenceAuthorization',
    );
    expect(openapi.body.paths).not.toHaveProperty(
      '/api/workspaces/{workspaceId}/diagram/propose-model',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/users/{userId}/memberships',
    );
    expect(openapi.body.paths).toHaveProperty('/api/workspaces');
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/inbox-items',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/inbox-extractions/{extractionId}/candidates',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/story-candidates/{candidateId}/select',
    );
    expect(openapi.body.paths).not.toHaveProperty(
      '/api/workspaces/{workspaceId}/story-candidates/{candidateId}/confirm',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/stories/{storyId}/revisions/{revisionId}',
    );
    expect(
      openapi.body.paths[
        '/api/workspaces/{workspaceId}/stories/{storyId}/revisions'
      ],
    ).toHaveProperty('post');
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/stories/{storyId}/coding-runs',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/coding-runs/{runId}/accept',
    );

    const user = await apiRequest(`/api/users/${userId}`);
    expect(user.status).toBe(200);
    expectHalResource(user, mediaTypes.user);
    expect(user.body).toMatchObject({ id: userId, name: 'Desktop User' });
    expect(user.body._links).toMatchObject({
      self: { href: `/api/users/${userId}` },
      memberships: { href: `/api/users/${userId}/memberships` },
      'create-workspace': { href: '/api/workspaces' },
    });

    const memberships = await apiRequest(
      `/api/users/${userId}/memberships?page=1&pageSize=20`,
    );
    expect(memberships.status).toBe(200);
    expectHalCollection(memberships, mediaTypes.memberships, 'memberships');
    expect(memberships.body.page).toMatchObject({ number: 1, size: 20 });
    expect(memberships.body._embedded.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _links: expect.objectContaining({
            self: {
              href: '/api/workspaces/default-workspace/members/default-workspace-owner',
            },
          }),
          role: 'owner',
          workspace: expect.objectContaining({
            id: 'default-workspace',
            title: 'Default Workspace',
            _links: expect.objectContaining({
              self: { href: '/api/workspaces/default-workspace' },
            }),
          }),
        }),
      ]),
    );
  });

  it('creates, reads, updates, and deletes workspaces', async () => {
    const created = await createContractWorkspace('Contract Workspace');
    expect(created.status).toBe(201);
    expectHalResource(created, mediaTypes.workspace);
    expect(created.headers.get('location')).toBe(
      `/api/workspaces/${created.body.id}`,
    );
    expect(created.body).toMatchObject({
      status: 'active',
      metadata: { source: 'api-contracts' },
    });
    expect(created.body._links).toMatchObject({
      self: { href: `/api/workspaces/${created.body.id}` },
      'logical-entities': {
        href: `/api/workspaces/${created.body.id}/logical-entities`,
      },
      'inbox-items': {
        href: `/api/workspaces/${created.body.id}/inbox-items`,
      },
    });

    const fetched = await apiRequest(`/api/workspaces/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expectHalResource(fetched, mediaTypes.workspace);
    expect(fetched.body.id).toBe(created.body.id);

    const updated = await apiRequest(`/api/workspaces/${created.body.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Updated Contract Workspace',
        description: null,
        status: 'active',
        metadata: { updated: 'true' },
      }),
    });
    expect(updated.status).toBe(200);
    expectHalResource(updated, mediaTypes.workspace);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      title: 'Updated Contract Workspace',
      description: null,
      metadata: { updated: 'true' },
    });

    const rejectedLocalPath = await apiRequest('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Must stay local',
        path: '/desktop/repository',
      }),
    });
    expect(rejectedLocalPath.status).toBe(400);

    const rejectedMetadataPath = await apiRequest('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Must also stay local',
        metadata: { repositoryRoot: '/desktop/repository' },
      }),
    });
    expect(rejectedMetadataPath.status).toBe(400);

    const deleted = await apiRequest(`/api/workspaces/${created.body.id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);
    expect(deleted.headers.get('content-type')).toBeNull();

    const missing = await apiRequest(`/api/workspaces/${created.body.id}`);
    expect(missing.status).toBe(404);
  });

  it('captures immutable Inbox revisions inside one workspace', async () => {
    const workspace = await createContractWorkspace('Inbox Workspace');
    const workspaceId = workspace.body.id as string;
    const externalKey = uniqueName('capture');
    const created = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items`,
      {
        method: 'POST',
        body: JSON.stringify({
          sourceKind: 'manual_text',
          externalKey,
          title: 'Desktop coding agent',
          body: 'Run Pi locally.',
          contentType: 'text/markdown',
          providerMetadata: { channel: 'contracts' },
        }),
      },
    );

    expect(created.status).toBe(201);
    expectHalResource(created, mediaTypes.inboxItem);
    expect(created.body).toMatchObject({
      sourceKind: 'manual_text',
      externalKey,
      status: 'active',
      revisionCount: 1,
      version: 1,
    });
    expect(created.body.latestRevisionSha256).toMatch(/^sha256:[a-f0-9]{64}$/);

    const replayedCapture = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items`,
      {
        method: 'POST',
        body: JSON.stringify({
          sourceKind: 'manual_text',
          externalKey,
          title: 'Desktop coding agent',
          body: 'Run Pi locally.',
          contentType: 'text/markdown',
          providerMetadata: { channel: 'contracts' },
        }),
      },
    );
    expect(replayedCapture.status).toBe(201);
    expect(replayedCapture.body).toMatchObject({
      id: created.body.id,
      revisionCount: 1,
      version: 1,
    });

    const listed = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items?status=active&q=coding&page=1&pageSize=20`,
    );
    expect(listed.status).toBe(200);
    expectHalCollection(listed, mediaTypes.inboxItems, 'inboxItems');
    expect(listed.body._embedded.inboxItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id }),
      ]),
    );

    const unchanged = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items/${created.body.id}/revisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Desktop coding agent',
          body: 'Run Pi locally.',
          contentType: 'text/markdown',
          expectedLatestRevisionSha256: created.body.latestRevisionSha256,
        }),
      },
    );
    expect(unchanged.status).toBe(200);
    expectHalResource(unchanged, mediaTypes.inboxRevision);
    expect(unchanged.body.id).toBe(created.body.latestRevisionId);

    const appended = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items/${created.body.id}/revisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Desktop coding agent',
          body: 'Run Pi in an isolated worktree.',
          contentType: 'text/markdown',
          uri: 'https://example.com/issues/1',
          providerMetadata: { channel: 'contracts', state: 'open' },
          sourceUpdatedAt: '2026-07-21T12:00:00.000Z',
          expectedLatestRevisionSha256: created.body.latestRevisionSha256,
        }),
      },
    );
    expect(appended.status).toBe(200);
    expectHalResource(appended, mediaTypes.inboxRevision);
    expect(appended.body.id).not.toBe(created.body.latestRevisionId);
    expect(appended.body).toMatchObject({
      uri: 'https://example.com/issues/1',
      providerMetadata: { channel: 'contracts', state: 'open' },
      sourceUpdatedAt: '2026-07-21T12:00:00.000Z',
    });

    const reverted = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items/${created.body.id}/revisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Desktop coding agent',
          body: 'Run Pi locally.',
          contentType: 'text/markdown',
          uri: null,
          providerMetadata: { channel: 'contracts' },
          sourceUpdatedAt: null,
          expectedLatestRevisionSha256: appended.body.contentSha256,
        }),
      },
    );
    expect(reverted.status).toBe(200);
    expect(reverted.body.id).toBe(created.body.latestRevisionId);

    const revertedItem = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items/${created.body.id}`,
    );
    expect(revertedItem.body).toMatchObject({
      latestRevisionId: created.body.latestRevisionId,
      revisionCount: 2,
      version: 3,
    });

    const revisions = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items/${created.body.id}/revisions?page=1&pageSize=20`,
    );
    expect(revisions.status).toBe(200);
    expectHalCollection(revisions, mediaTypes.inboxRevisions, 'inboxRevisions');
    expect(revisions.body.page.totalElements).toBe(2);
    expect(
      revisions.body._embedded.inboxRevisions.map(
        (revision: { revisionNumber: number }) => revision.revisionNumber,
      ),
    ).toEqual([2, 1]);

    const deferred = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items/${created.body.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'deferred', expectedVersion: 3 }),
      },
    );
    expect(deferred.status).toBe(200);
    expectHalResource(deferred, mediaTypes.inboxItem);
    expect(deferred.body).toMatchObject({ status: 'deferred', version: 4 });

    const stale = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items/${created.body.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed', expectedVersion: 3 }),
      },
    );
    expect(stale.status).toBe(409);

    const otherWorkspace = await createContractWorkspace(
      'Other Inbox Workspace',
    );
    const outsideBoundary = await apiRequest(
      `/api/workspaces/${otherWorkspace.body.id}/inbox-items/${created.body.id}`,
    );
    expect(outsideBoundary.status).toBe(404);
  });

  it('freezes a selected source set and accepts one exact-revision Candidate batch', async () => {
    const workspace = await createContractWorkspace('Extraction Workspace');
    const workspaceId = workspace.body.id as string;
    const source = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items`,
      {
        method: 'POST',
        body: JSON.stringify({
          sourceKind: 'manual_text',
          externalKey: uniqueName('extraction-source'),
          title: 'Frozen delivery intake',
          body: 'Start one Story from this exact source.',
          contentType: 'text/markdown',
        }),
      },
    );

    const extraction = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-extractions`,
      {
        method: 'POST',
        body: JSON.stringify({ inboxItemIds: [source.body.id] }),
      },
    );
    expect(extraction.status).toBe(201);
    expectHalResource(extraction, mediaTypes.inboxExtraction);
    expect(extraction.body).toMatchObject({
      reference: expect.stringMatching(/^EXTRACT-[0-9]{4,}$/),
      status: 'awaiting_agent',
      version: 1,
      sources: [
        expect.objectContaining({
          inboxItemId: source.body.id,
          inboxRevisionId: source.body.latestRevisionId,
          contentSha256: source.body.latestRevisionSha256,
          body: 'Start one Story from this exact source.',
        }),
      ],
    });

    const proposed = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-extractions/${extraction.body.id}/candidates`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          candidates: [
            {
              title: 'Frozen delivery intake',
              problem: 'Mutable sources cannot authorize delivery.',
              role: 'Workspace maintainer',
              goal: 'Start one frozen iteration.',
              value: 'Every decision remains traceable.',
              cognitiveMode: 'complicated',
              citations: [
                {
                  inboxItemId: source.body.id,
                  revisionSha256: source.body.latestRevisionSha256,
                  locator: 'whole-source',
                },
              ],
            },
          ],
        }),
      },
    );
    expect(proposed.status).toBe(201);
    expectResourceContentType(proposed, mediaTypes.inboxCandidateSet);
    expect(proposed.body.extraction).toMatchObject({
      id: extraction.body.id,
      status: 'completed',
      version: 2,
    });
    expect(proposed.body._embedded.storyCandidates).toEqual([
      expect.objectContaining({
        reference: expect.stringMatching(/^CAND-[0-9]{4,}$/),
        status: 'ready',
        proposedBy: 'inbox-analyst',
      }),
    ]);
    const candidate = proposed.body._embedded.storyCandidates[0];
    const listedCandidates = await apiRequest(
      `/api/workspaces/${workspaceId}/story-candidates?status=ready&page=1&pageSize=20`,
    );
    expectHalCollection(
      listedCandidates,
      mediaTypes.storyCandidates,
      'storyCandidates',
    );
    expect(listedCandidates.body._embedded.storyCandidates).toEqual([
      expect.objectContaining({ id: candidate.id, status: 'ready' }),
    ]);

    const selected = await apiRequest(
      `/api/workspaces/${workspaceId}/story-candidates/${candidate.id}/select`,
      {
        method: 'POST',
        body: JSON.stringify({
          candidateSha256: candidate.contentSha256,
          baseCommitSha: 'b'.repeat(40),
        }),
      },
    );
    expect(selected.status).toBe(201);
    expectHalResource(selected, 'application/vnd.evidence.iteration+json');
    expect(selected.body).toMatchObject({
      reference: expect.stringMatching(/^ITER-[0-9]{4,}$/),
      lifecycle: 'provisioning',
      loop: 'kickoff',
      stage: 'candidate_review',
      activeStoryId: null,
    });

    const selectedCandidate = await apiRequest(
      `/api/workspaces/${workspaceId}/story-candidates/${candidate.id}`,
    );
    expect(selectedCandidate.body).toMatchObject({
      status: 'selected',
      selectedIterationId: selected.body.id,
    });

    const frozenIntake = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${selected.body.id}/intake`,
    );
    expect(frozenIntake.status).toBe(200);
    expectHalResource(frozenIntake, mediaTypes.iterationIntake);
    expect(frozenIntake.body).toMatchObject({
      candidate: expect.objectContaining({
        candidateReference: candidate.reference,
      }),
      sources: [
        expect.objectContaining({
          inboxRevisionId: source.body.latestRevisionId,
          contentSha256: source.body.latestRevisionSha256,
        }),
      ],
    });
    expect(frozenIntake.body.candidate.candidateId).toBe(candidate.id);

    const provisioned = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${selected.body.id}/provisioning/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          baseCommitSha: 'b'.repeat(40),
          branchName: `evidence/${selected.body.reference.toLowerCase()}`,
        }),
      },
    );
    expect(provisioned.status).toBe(200);
    expectHalResource(provisioned, mediaTypes.iteration);
    expect(provisioned.body).toMatchObject({
      lifecycle: 'active',
      version: 2,
    });

    const kickoff = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${selected.body.id}/kickoff`,
    );
    expect(kickoff.status).toBe(200);
    expectHalResource(kickoff, mediaTypes.kickoff);
    expect(kickoff.body.currentProposal).toMatchObject({
      origin: 'inbox_candidate',
      title: 'Frozen delivery intake',
    });

    const confirmed = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${selected.body.id}/kickoff/decisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          proposalId: kickoff.body.currentProposal.id,
          proposalSha256: kickoff.body.currentProposal.contentSha256,
          expectedIterationVersion: 2,
          action: 'confirm',
        }),
      },
    );
    expect(confirmed.status).toBe(200);
    expectResourceContentType(confirmed, mediaTypes.kickoffDecisionResult);
    expect(confirmed.body).toMatchObject({
      iteration: {
        loop: 'understand',
        stage: 'tqa',
        activeStoryId: expect.any(String),
      },
      decision: { action: 'confirm', reason: null },
      problemStatement: expect.objectContaining({
        problem: 'Mutable sources cannot authorize delivery.',
      }),
      storyCard: expect.objectContaining({
        reference: 'US-001',
        role: 'Workspace maintainer',
      }),
    });

    const replay = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-extractions/${extraction.body.id}/candidates`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 2, candidates: [] }),
      },
    );
    expect(replay.status).toBe(409);
  });

  it('extends a human-confirmed Kickoff Story with Scenarios and a Coding Run', async () => {
    const workspace = await createContractWorkspace('Delivery Workspace');
    const workspaceId = workspace.body.id as string;
    const source = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items`,
      {
        method: 'POST',
        body: JSON.stringify({
          sourceKind: 'manual_text',
          externalKey: uniqueName('delivery-source'),
          title: 'Local coding agent',
          body: 'Run Pi in an isolated local worktree.',
          contentType: 'text/markdown',
        }),
      },
    );
    const candidateInput = {
      title: 'Local coding agent',
      problem: 'Hosted services must not receive source code.',
      role: 'Workspace maintainer',
      goal: 'Run coding work in an isolated local worktree.',
      value: 'Source and credentials remain local.',
      cognitiveMode: 'complicated',
      citations: [
        {
          inboxItemId: source.body.id,
          revisionSha256: source.body.latestRevisionSha256,
          locator: 'whole-source',
        },
      ],
    };
    const rejectedCandidateInput = {
      ...candidateInput,
      title: 'Rejected coding alternative',
      goal: 'Send source code to a hosted coding service.',
    };
    const extraction = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-extractions`,
      {
        method: 'POST',
        body: JSON.stringify({ inboxItemIds: [source.body.id] }),
      },
    );
    const proposed = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-extractions/${extraction.body.id}/candidates`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          candidates: [candidateInput, rejectedCandidateInput],
        }),
      },
    );
    const candidate = proposed.body._embedded.storyCandidates[0];
    const rejectedCandidate = proposed.body._embedded.storyCandidates[1];
    expect(candidate).toMatchObject({
      status: 'ready',
      reference: 'CAND-0001',
    });

    const baseCommitSha = 'a'.repeat(40);
    const selected = await apiRequest(
      `/api/workspaces/${workspaceId}/story-candidates/${candidate.id}/select`,
      {
        method: 'POST',
        body: JSON.stringify({
          candidateSha256: candidate.contentSha256,
          baseCommitSha,
        }),
      },
    );
    const provisioned = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${selected.body.id}/provisioning/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          baseCommitSha,
          branchName: `evidence/iter-${selected.body.id}`,
        }),
      },
    );
    expect(provisioned.body).toMatchObject({
      lifecycle: 'active',
      version: 2,
    });
    const kickoff = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${selected.body.id}/kickoff`,
    );
    const confirmed = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${selected.body.id}/kickoff/decisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          proposalId: kickoff.body.currentProposal.id,
          proposalSha256: kickoff.body.currentProposal.contentSha256,
          expectedIterationVersion: 2,
          action: 'confirm',
        }),
      },
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.storyCard).toMatchObject({ reference: 'US-001' });
    const storyId = confirmed.body.storyCard.storyId as string;
    const story = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}`,
    );
    expect(story.status).toBe(200);
    expectHalResource(story, mediaTypes.story);
    expect(story.body).toMatchObject({
      id: storyId,
      reference: 'US-001',
      title: candidateInput.title,
      latestRevisionNumber: 1,
      latestScenarioCount: 0,
      revisionCount: 1,
      version: 1,
    });
    const baselineRevision = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/revisions/${story.body.latestRevisionId}`,
    );
    expect(baselineRevision.body).toMatchObject({
      revisionNumber: 1,
      scenarios: [],
      createdByUserId: userId,
    });
    const storyContent = {
      title: candidateInput.title,
      problem: candidateInput.problem,
      role: candidateInput.role,
      goal: candidateInput.goal,
      value: candidateInput.value,
      cognitiveMode: candidateInput.cognitiveMode,
      citations: [
        {
          inboxItemId: source.body.id,
          inboxRevisionId: source.body.latestRevisionId,
          contentSha256: source.body.latestRevisionSha256,
          locator: 'whole-source',
        },
      ],
    };
    const acceptanceInput = {
      expectedVersion: 1,
      expectedLatestRevisionId: baselineRevision.body.id,
      ...storyContent,
      scenarios: [
        {
          title: 'Create an isolated coding worktree',
          given: ['The Workspace is bound to an accessible Git repository.'],
          when: 'The user starts a Coding Run.',
          then: [
            'A dedicated branch and worktree are created.',
            'The primary working tree remains unchanged.',
          ],
        },
      ],
    };
    const invalidAcceptance = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/revisions`,
      {
        method: 'POST',
        body: JSON.stringify({ ...acceptanceInput, scenarios: [] }),
      },
    );
    expect(invalidAcceptance.status).toBe(400);

    const acceptedRevision = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/revisions`,
      { method: 'POST', body: JSON.stringify(acceptanceInput) },
    );
    expect(acceptedRevision.status).toBe(201);
    expectHalResource(acceptedRevision, mediaTypes.storyRevision);
    expect(acceptedRevision.headers.get('location')).toBe(
      `/api/workspaces/${workspaceId}/stories/${storyId}/revisions/${acceptedRevision.body.id}`,
    );
    expect(acceptedRevision.body).toMatchObject({
      revisionNumber: 2,
      createdByUserId: userId,
      scenarios: [
        expect.objectContaining({
          id: expect.any(String),
          ...acceptanceInput.scenarios[0],
        }),
      ],
    });
    expect(acceptedRevision.body.contentSha256).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(acceptedRevision.body.contentSha256).not.toBe(
      baselineRevision.body.contentSha256,
    );

    const staleRevision = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/revisions`,
      { method: 'POST', body: JSON.stringify(acceptanceInput) },
    );
    expect(staleRevision.status).toBe(409);

    const updatedStory = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}`,
    );
    expect(updatedStory.body).toMatchObject({
      latestRevisionId: acceptedRevision.body.id,
      latestRevisionNumber: 2,
      latestScenarioCount: 1,
      revisionCount: 2,
      version: 2,
    });

    const startedRun = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/coding-runs`,
      {
        method: 'POST',
        body: JSON.stringify({
          storyRevisionId: acceptedRevision.body.id,
          baseCommitSha,
        }),
      },
    );
    expect(startedRun.status).toBe(201);
    expectHalResource(startedRun, mediaTypes.codingRun);
    expect(startedRun.headers.get('location')).toBe(
      `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}`,
    );
    expect(startedRun.body).toMatchObject({
      storyId,
      storyRevisionId: acceptedRevision.body.id,
      requestedByUserId: userId,
      status: 'running',
      version: 1,
      baseCommitSha,
      diffSha256: null,
      commitSha: null,
    });
    expect(startedRun.body._links).toMatchObject({
      review: {
        href: `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/review`,
      },
      cancel: {
        href: `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/cancel`,
      },
    });

    const duplicateRun = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/coding-runs`,
      {
        method: 'POST',
        body: JSON.stringify({
          storyRevisionId: acceptedRevision.body.id,
          baseCommitSha,
        }),
      },
    );
    expect(duplicateRun.status).toBe(409);

    const listedRuns = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/coding-runs?status=running&page=1&pageSize=20`,
    );
    expect(listedRuns.status).toBe(200);
    expectHalCollection(listedRuns, mediaTypes.codingRuns, 'codingRuns');
    expect(listedRuns.body._embedded.codingRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: startedRun.body.id }),
      ]),
    );

    const diffSha256 = `sha256:${'b'.repeat(64)}`;
    for (const invalidReviewInput of [
      {
        expectedVersion: 1,
        diffSha256,
        changedFileCount: 0,
        qualityChecks: [
          {
            name: 'pnpm test',
            status: 'passed',
            durationMs: 1200,
            summary: 'All focused tests passed.',
          },
        ],
      },
      {
        expectedVersion: 1,
        diffSha256,
        changedFileCount: 2,
        qualityChecks: [
          {
            name: 'pnpm test',
            status: 'failed',
            durationMs: 1200,
            summary: 'A focused test failed.',
          },
        ],
      },
    ]) {
      const invalidReview = await apiRequest(
        `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/review`,
        { method: 'POST', body: JSON.stringify(invalidReviewInput) },
      );
      expect(invalidReview.status).toBe(400);
    }

    const reviewInput = {
      expectedVersion: 1,
      diffSha256,
      changedFileCount: 2,
      qualityChecks: [
        {
          name: 'pnpm test',
          status: 'passed',
          durationMs: 1200,
          summary: 'All focused tests passed.',
        },
      ],
    };
    const reviewRequired = await apiRequest(
      `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/review`,
      { method: 'POST', body: JSON.stringify(reviewInput) },
    );
    expect(reviewRequired.status).toBe(200);
    expectHalResource(reviewRequired, mediaTypes.codingRun);
    expect(reviewRequired.body).toMatchObject({
      status: 'review_required',
      version: 2,
      diffSha256,
      changedFileCount: 2,
      qualityChecks: reviewInput.qualityChecks,
    });
    expect(reviewRequired.body._links).toMatchObject({
      accept: {
        href: `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/accept`,
      },
      reject: {
        href: `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/reject`,
      },
    });

    const reviewReplay = await apiRequest(
      `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/review`,
      { method: 'POST', body: JSON.stringify(reviewInput) },
    );
    expect(reviewReplay.status).toBe(200);
    expect(reviewReplay.body.id).toBe(startedRun.body.id);
    expect(reviewReplay.body.version).toBe(2);

    const acceptedCommitSha = 'c'.repeat(40);
    const acceptedRun = await apiRequest(
      `/api/workspaces/${workspaceId}/coding-runs/${startedRun.body.id}/accept`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 2,
          diffSha256,
          commitSha: acceptedCommitSha,
        }),
      },
    );
    expect(acceptedRun.status).toBe(200);
    expect(acceptedRun.body).toMatchObject({
      status: 'accepted',
      version: 3,
      commitSha: acceptedCommitSha,
      decidedByUserId: userId,
    });
    expect(acceptedRun.body._links).not.toHaveProperty('accept');

    const originalRevision = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/revisions/${baselineRevision.body.id}`,
    );
    expect(originalRevision.status).toBe(200);
    expect(originalRevision.body).toMatchObject({
      id: baselineRevision.body.id,
      revisionNumber: 1,
      scenarios: [],
    });

    const stories = await apiRequest(
      `/api/workspaces/${workspaceId}/stories?page=1&pageSize=20`,
    );
    expect(stories.status).toBe(200);
    expectHalCollection(stories, mediaTypes.stories, 'stories');
    const revisions = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/revisions?page=1&pageSize=20`,
    );
    expect(revisions.status).toBe(200);
    expectHalCollection(revisions, mediaTypes.storyRevisions, 'storyRevisions');
    expect(revisions.body._embedded.storyRevisions).toHaveLength(2);

    const rejectSelected = await apiRequest(
      `/api/workspaces/${workspaceId}/story-candidates/${candidate.id}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({
          candidateSha256: candidate.contentSha256,
          reason: 'A selected Candidate cannot be rejected.',
        }),
      },
    );
    expect(rejectSelected.status).toBe(409);

    const rejected = await apiRequest(
      `/api/workspaces/${workspaceId}/story-candidates/${rejectedCandidate.id}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({
          candidateSha256: rejectedCandidate.contentSha256,
          reason: 'This alternative violates the local source boundary.',
        }),
      },
    );
    expect(rejected.status).toBe(200);
    expectHalResource(rejected, mediaTypes.storyCandidate);
    expect(rejected.body).toMatchObject({
      status: 'rejected',
      terminalDecisionId: expect.any(String),
    });
    expect(rejected.body._links).not.toHaveProperty('reject');

    const otherWorkspace = await createContractWorkspace(
      'Other Delivery Workspace',
    );
    const hiddenCandidate = await apiRequest(
      `/api/workspaces/${otherWorkspace.body.id}/story-candidates/${proposed.body.id}`,
    );
    const hiddenStory = await apiRequest(
      `/api/workspaces/${otherWorkspace.body.id}/stories/${storyId}`,
    );
    expect(hiddenCandidate.status).toBe(404);
    expect(hiddenStory.status).toBe(404);
  });

  it('accepts Inbox JSON overhead while enforcing the domain body limit', async () => {
    const workspace = await createContractWorkspace('Inbox Payload Workspace');
    const capture = (externalKey: string, body: string) =>
      apiRequest(`/api/workspaces/${workspace.body.id}/inbox-items`, {
        method: 'POST',
        body: JSON.stringify({
          sourceKind: 'manual_text',
          externalKey,
          title: 'Payload boundary',
          body,
          contentType: 'text/plain',
        }),
      });

    const accepted = await capture(
      uniqueName('accepted-payload'),
      'x'.repeat(128 * 1024),
    );
    expect(accepted.status).toBe(201);

    const rejected = await capture(
      uniqueName('rejected-payload'),
      'x'.repeat(1024 * 1024 + 1),
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toContain('must not exceed 1048576 bytes');
  });

  it('creates, reads, updates, lists, and deletes logical entities', async () => {
    const workspace = await createContractWorkspace('Logical Entity Workspace');
    expect(workspace.status).toBe(201);
    expectHalResource(workspace, mediaTypes.workspace);

    const created = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'EVIDENCE',
          subType: 'EVIDENCE:rfp',
          name: uniqueName('RequestForProposal'),
          label: 'RFP',
          description: 'Evidence definition',
          attributes: [],
        }),
      },
    );
    expect(created.status).toBe(201);
    expectHalResource(created, mediaTypes.logicalEntities);
    expect(created.body).toMatchObject({
      type: 'EVIDENCE',
      subType: 'EVIDENCE:rfp',
      label: 'RFP',
    });
    expect(created.body._links).toMatchObject({
      self: {
        href: `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
      },
      collection: {
        href: `/api/workspaces/${workspace.body.id}/logical-entities`,
      },
    });

    const listed = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities?page=1&pageSize=50`,
    );
    expect(listed.status).toBe(200);
    expectHalCollection(listed, mediaTypes.logicalEntities, 'logicalEntities');
    expect(listed.body._embedded.logicalEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _links: expect.objectContaining({
            self: expect.objectContaining({ href: expect.any(String) }),
          }),
          id: created.body.id,
        }),
      ]),
    );

    const fetched = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
    );
    expect(fetched.status).toBe(200);
    expectHalResource(fetched, mediaTypes.logicalEntity);

    const updated = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          type: 'PARTICIPANT',
          subType: 'PARTICIPANT:party',
          name: 'Customer',
        }),
      },
    );
    expect(updated.status).toBe(200);
    expectHalResource(updated, mediaTypes.logicalEntity);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      type: 'PARTICIPANT',
      subType: 'PARTICIPANT:party',
      name: 'Customer',
    });

    const deleted = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);
    expectResourceContentType(deleted, mediaTypes.logicalEntity);
    expect(deleted.body).toEqual({ deleted: true });
  });

  it('enforces member uniqueness and preserves the workspace owner', async () => {
    const workspace = await createContractWorkspace('Member Diagram Workspace');
    const workspaceId = workspace.body.id as string;

    const members = await apiRequest(`/api/workspaces/${workspaceId}/members`);
    expect(members.status).toBe(200);
    expectHalResource(members, mediaTypes.members);
    expect(members.body.page).toMatchObject({ number: 1, size: 20 });
    expect(members.body._embedded.members).toHaveLength(1);
    const owner = members.body._embedded.members[0];
    expect(owner).toMatchObject({ role: 'owner', user: { id: userId } });

    const duplicate = await apiRequest(
      `/api/workspaces/${workspaceId}/members`,
      {
        method: 'POST',
        body: JSON.stringify({ user: { id: userId }, role: 'member' }),
      },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already/i);

    const member = await apiRequest(
      `/api/workspaces/${workspaceId}/members/${owner.id}`,
    );
    expect(member.status).toBe(200);
    expectHalResource(member, mediaTypes.member);

    const demoted = await apiRequest(
      `/api/workspaces/${workspaceId}/members/${owner.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'member' }),
      },
    );
    expect(demoted.status).toBe(409);

    const removed = await apiRequest(
      `/api/workspaces/${workspaceId}/members/${owner.id}`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(409);

    const diagram = await apiRequest(`/api/workspaces/${workspaceId}/diagram`);
    expect(diagram.status).toBe(200);
    expectHalResource(diagram, mediaTypes.diagram);
    expect(diagram.body).toMatchObject({ id: 'model' });
    expect(diagram.body._links).toMatchObject({
      nodes: { href: `/api/workspaces/${workspaceId}/diagram/nodes` },
      edges: { href: `/api/workspaces/${workspaceId}/diagram/edges` },
      'logical-entities': {
        href: `/api/workspaces/${workspaceId}/logical-entities`,
      },
      'logical-relationships': {
        href: `/api/workspaces/${workspaceId}/logical-relationships`,
      },
    });

    const nodes = await apiRequest(
      `/api/workspaces/${workspaceId}/diagram/nodes`,
    );
    expect(nodes.status).toBe(200);
    expectHalResource(nodes, mediaTypes.nodes);
    expect(nodes.body._embedded.nodes).toEqual(expect.any(Array));

    const edges = await apiRequest(
      `/api/workspaces/${workspaceId}/diagram/edges`,
    );
    expect(edges.status).toBe(200);
    expectHalResource(edges, mediaTypes.edges);
    expect(edges.body._embedded.edges).toEqual(expect.any(Array));
  });

  it('persists relationships and projects them as diagram edges', async () => {
    const workspace = await createContractWorkspace('Relationship Workspace');
    const workspaceId = workspace.body.id as string;
    const createEntity = (name: string, type: string, subType: string) =>
      apiRequest(`/api/workspaces/${workspaceId}/logical-entities`, {
        method: 'POST',
        body: JSON.stringify({ name, type, subType, attributes: [] }),
      });
    const source = await createEntity(
      uniqueName('Order'),
      'EVIDENCE',
      'EVIDENCE:other_evidence',
    );
    const target = await createEntity(
      uniqueName('Customer'),
      'PARTICIPANT',
      'PARTICIPANT:party',
    );

    const invalid = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships`,
      {
        method: 'POST',
        body: JSON.stringify({
          source: { id: source.body.id },
          target: { id: 'missing' },
          label: 'invalid',
        }),
      },
    );
    expect(invalid.status).toBe(400);

    const created = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships`,
      {
        method: 'POST',
        body: JSON.stringify({
          source: { id: source.body.id },
          target: { id: target.body.id },
          label: 'belongs to',
        }),
      },
    );
    expect(created.status).toBe(201);
    expectHalResource(created, mediaTypes.logicalRelationships);

    const listed = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships?page=1&pageSize=20`,
    );
    expect(listed.status).toBe(200);
    expectHalCollection(
      listed,
      mediaTypes.logicalRelationships,
      'logicalRelationships',
    );

    const updated = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships/${created.body.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ label: 'submitted by' }),
      },
    );
    expect(updated.status).toBe(200);
    expectHalResource(updated, mediaTypes.logicalRelationship);
    expect(updated.body.label).toBe('submitted by');

    const edges = await apiRequest(
      `/api/workspaces/${workspaceId}/diagram/edges`,
    );
    expect(edges.body._embedded.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          logicalRelationship: { id: created.body.id },
        }),
      ]),
    );

    const deleted = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships/${created.body.id}`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true });
  });
});
