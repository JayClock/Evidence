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
  sidebar: 'application/vnd.evidence.sidebar+json',
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
  understanding: 'application/vnd.evidence.understanding+json',
  scenarioProposal: 'application/vnd.evidence.scenario-proposal+json',
  understandingDecisionResult:
    'application/vnd.evidence.understanding-decision-result+json',
  tasking: 'application/vnd.evidence.tasking+json',
  noModelImpactDecision:
    'application/vnd.evidence.no-model-impact-decision+json',
  taskingCandidate: 'application/vnd.evidence.tasking-candidate+json',
  deskCheckDecisionResult:
    'application/vnd.evidence.desk-check-decision-result+json',
  pair: 'application/vnd.evidence.pair+json',
  pairStartResult: 'application/vnd.evidence.pair-start-result+json',
  showcase: 'application/vnd.evidence.showcase+json',
  showcaseActionResult: 'application/vnd.evidence.showcase-action-result+json',
  respond: 'application/vnd.evidence.respond+json',
  respondActionResult: 'application/vnd.evidence.respond-action-result+json',
  story: 'application/vnd.evidence.story+json',
  stories: 'application/vnd.evidence.stories+json',
  storyRevision: 'application/vnd.evidence.story-revision+json',
  storyRevisions: 'application/vnd.evidence.story-revisions+json',
  logicalEntity: 'application/vnd.evidence.logical-entity+json',
  logicalEntities: 'application/vnd.evidence.logical-entities+json',
  logicalRelationship: 'application/vnd.evidence.logical-relationship+json',
  logicalRelationships: 'application/vnd.evidence.logical-relationships+json',
  membership: 'application/vnd.evidence.membership+json',
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

function contractSha(value: number): string {
  return `sha256:${value.toString(16).padStart(64, '0')}`;
}

describeContracts('Evidence API contract vertical slice', () => {
  const userId = 'desktop-user';

  it('exposes root, health, user, sidebar, and seeded workspace resources as HAL-style resources', async () => {
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
    expect(openapi.body.paths).toHaveProperty('/api/users/{userId}/sidebar');
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
    ).not.toHaveProperty('post');
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/iterations/{iterationId}/tasking',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/iterations/{iterationId}/tasking/decisions',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/iterations/{iterationId}/pair',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/iterations/{iterationId}/pair/command-observations',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/iterations/{iterationId}/showcase',
    );
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/iterations/{iterationId}/respond',
    );
    expect(openapi.body.paths).not.toHaveProperty(
      '/api/workspaces/{workspaceId}/stories/{storyId}/coding-runs',
    );
    expect(openapi.body.paths).not.toHaveProperty(
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
      sidebar: { href: `/api/users/${userId}/sidebar` },
    });

    const sidebar = await apiRequest(`/api/users/${userId}/sidebar`);
    expect(sidebar.status).toBe(200);
    expectHalResource(sidebar, mediaTypes.sidebar);
    expect(sidebar.body._links).toMatchObject({
      self: { href: `/api/users/${userId}/sidebar` },
      user: { href: `/api/users/${userId}` },
    });
    expect(sidebar.body.sections).toMatchObject([
      {
        key: 'workspace',
        title: '工作区',
        items: [
          {
            key: 'workspace-overview',
            label: '工作区总览',
            href: '/api/workspaces/{workspaceId}',
          },
        ],
      },
      {
        key: 'source',
        title: '来源',
        items: [{ key: 'inbox-items', label: 'Inbox' }],
      },
      {
        key: 'delivery',
        title: '交付',
        items: [
          { key: 'story-candidates' },
          { key: 'stories', label: '故事看板' },
          {
            key: 'tasking-queue',
            href: '/api/workspaces/{workspaceId}/stories?filter=tasking',
          },
          {
            key: 'pair-queue',
            href: '/api/workspaces/{workspaceId}/stories?filter=pair',
          },
        ],
      },
      {
        key: 'model',
        title: '模型',
        items: [
          { key: 'diagram', label: '模型图' },
          { key: 'logical-entities', label: '逻辑实体' },
        ],
      },
    ]);

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
              href: '/api/workspaces/default-workspace/memberships/default-workspace-owner-membership',
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
          title: 'Desktop Pair delivery',
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
          title: 'Desktop Pair delivery',
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
      `/api/workspaces/${workspaceId}/inbox-items?status=active&q=pair&page=1&pageSize=20`,
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
          title: 'Desktop Pair delivery',
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
          title: 'Desktop Pair delivery',
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
          title: 'Desktop Pair delivery',
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
      _links: {
        'story-candidates': {
          href: `/api/workspaces/${workspaceId}/story-candidates?extractionId=${extraction.body.id}`,
        },
      },
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
    expect(proposed.body._links).toMatchObject({
      'story-candidates': {
        href: `/api/workspaces/${workspaceId}/story-candidates?extractionId=${extraction.body.id}`,
      },
    });
    const listedCandidates = await apiRequest(
      `/api/workspaces/${workspaceId}/story-candidates?status=ready&extractionId=${extraction.body.id}&q=frozen&page=1&pageSize=20`,
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

  it('requires No Model Impact and approved Tasking authority before Pair', async () => {
    const workspace = await createContractWorkspace('Tasking Workspace');
    const workspaceId = workspace.body.id as string;
    const source = await apiRequest(
      `/api/workspaces/${workspaceId}/inbox-items`,
      {
        method: 'POST',
        body: JSON.stringify({
          sourceKind: 'manual_text',
          externalKey: uniqueName('tasking-source'),
          title: 'Review one local Tasking plan',
          body: 'Plan one tool-only delivery change and stop before coding.',
          contentType: 'text/markdown',
        }),
      },
    );
    const candidateInput = {
      title: 'Review one local Tasking plan',
      problem: 'Coding lacks an explicit approved Tasking boundary.',
      role: 'Delivery lead',
      goal: 'Approve one complete tool-only Tasking plan.',
      value: 'Pair starts only from reviewed authority.',
      cognitiveMode: 'complicated',
      citations: [
        {
          inboxItemId: source.body.id,
          revisionSha256: source.body.latestRevisionSha256,
          locator: 'whole-source',
        },
      ],
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
          candidates: [candidateInput],
        }),
      },
    );
    const candidate = proposed.body._embedded.storyCandidates[0];
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
    const iterationId = selected.body.id as string;
    await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/provisioning/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          baseCommitSha,
          branchName: `evidence/iter-${iterationId}`,
        }),
      },
    );
    const kickoff = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/kickoff`,
    );
    const confirmed = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/kickoff/decisions`,
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
    const storyId = confirmed.body.storyCard.storyId as string;
    const story = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}`,
    );
    expect(story.status).toBe(200);
    expectHalResource(story, mediaTypes.story);
    expect(story.body).toMatchObject({
      iterationId,
      iterationReference: selected.body.reference,
      iterationLifecycle: 'active',
      iterationLoop: 'understand',
      iterationStage: 'tqa',
      reference: 'US-001',
      latestScenarioCount: 0,
      latestCitationCount: 1,
      pendingClarificationReference: null,
      authority: {
        owner: 'agent',
        nextAction: 'run_understanding_analyst',
      },
      _links: {
        iteration: {
          href: `/api/workspaces/${workspaceId}/iterations/${iterationId}`,
        },
        understanding: {
          href: `/api/workspaces/${workspaceId}/iterations/${iterationId}/understanding`,
        },
      },
    });
    const stories = await apiRequest(
      `/api/workspaces/${workspaceId}/stories?page=1&pageSize=20`,
    );
    expectHalCollection(stories, mediaTypes.stories, 'stories');
    expect(stories.body.summary).toMatchObject({
      humanAttention: 0,
      agentAttention: 1,
      approved: 0,
      stages: [{ loop: 'understand', stage: 'tqa', count: 1 }],
      actions: [{ action: 'run_understanding_analyst', count: 1 }],
    });

    const understanding = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/understanding`,
    );
    expect(understanding.status).toBe(200);
    expectHalResource(understanding, mediaTypes.understanding);
    expect(understanding.body.iteration).toMatchObject({
      loop: 'understand',
      stage: 'tqa',
      version: 3,
    });

    const scenarioInput = {
      title: 'Review one complete Tasking Candidate',
      given: [
        'A confirmed Story Revision is active.',
        'The Story changes only local workflow glue.',
      ],
      when: 'The delivery lead reviews the proposed Tasking plan.',
      then: ['A complete Tasking Candidate awaits human Desk Check.'],
      businessData: ['Story Revision v2', 'TASKING-001'],
    };
    const scenarioProposal = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/understanding/scenario-proposals`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: understanding.body.iteration.version,
          storyId,
          storyRevisionId: understanding.body.storyRevision.id,
          scenarios: [scenarioInput],
        }),
      },
    );
    expect(scenarioProposal.status).toBe(201);
    expectResourceContentType(scenarioProposal, mediaTypes.scenarioProposal);
    const scenarioDecision = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/understanding/decisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: 4,
          action: 'confirm',
          proposalId: scenarioProposal.body.id,
          proposalSha256: scenarioProposal.body.contentSha256,
          selectedDraftIds: scenarioProposal.body.drafts.map(
            (draft: { id: string }) => draft.id,
          ),
        }),
      },
    );
    expect(scenarioDecision.status).toBe(200);
    expectResourceContentType(
      scenarioDecision,
      mediaTypes.understandingDecisionResult,
    );
    expect(scenarioDecision.body.iteration).toMatchObject({
      loop: 'understand',
      stage: 'modeling',
      version: 5,
    });
    expect(scenarioDecision.body.storyRevision).toMatchObject({
      revisionNumber: 2,
      scenarios: [
        expect.objectContaining({
          reference: 'SC-001',
          title: scenarioInput.title,
          then: scenarioInput.then,
          businessData: scenarioInput.businessData,
        }),
      ],
    });

    const modelingTasking = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/tasking`,
    );
    expect(modelingTasking.status).toBe(200);
    expectHalResource(modelingTasking, mediaTypes.tasking);
    expect(modelingTasking.body._links).toHaveProperty(
      'record-no-model-impact',
    );
    const noModelImpact = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/tasking/no-model-impact`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: 5,
          storyId,
          storyRevisionId: scenarioDecision.body.storyRevision.id,
          storyRevisionSha256:
            scenarioDecision.body.storyRevision.contentSha256,
          reason: 'This Story changes only local workflow glue.',
        }),
      },
    );
    expect(noModelImpact.status).toBe(201);
    expectHalResource(noModelImpact, mediaTypes.noModelImpactDecision);
    expect(noModelImpact.body).toMatchObject({
      subject: 'tool',
      method: 'none',
      modelChangeRequired: false,
      decidedByUserId: userId,
    });

    const drafting = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/tasking`,
    );
    expect(drafting.body.iteration).toMatchObject({
      loop: 'tasking',
      stage: 'drafting',
      version: 6,
    });
    expect(drafting.body._links).toHaveProperty('propose-candidate');
    const projectCatalog = {
      projects: [
        {
          id: ':server-java:domain',
          root: 'libs/server-java/domain',
          targets: ['build', 'spotlessCheck', 'test'],
        },
        {
          id: ':server-java:persistent',
          root: 'libs/server-java/persistent',
          targets: ['build', 'spotlessCheck', 'test'],
        },
        {
          id: '@evidence/server',
          root: 'apps/server-java',
          targets: ['build', 'spotlessCheck', 'test'],
        },
      ],
    };
    const emptyModelRefs = { entities: [], associations: [] };
    const tests = [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'The Tasking domain preserves the approval boundary.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'java-domain-q1',
        projectId: ':server-java:domain',
        testFilter: 'reengineering.ddd.evidence.domain.TaskingTest',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['Story Revision v2'],
        modelRefs: emptyModelRefs,
      },
      {
        id: 'TEST-002',
        quadrant: 'Q1',
        intent: 'Tasking authority remains immutable in persistence.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'java-persistent-q1',
        projectId: ':server-java:persistent',
        testFilter:
          'reengineering.ddd.evidence.persistent.TaskingPersistenceTest',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['TASKING-001'],
        modelRefs: emptyModelRefs,
      },
      {
        id: 'TEST-003',
        quadrant: 'Q2',
        intent: 'The confirmed Scenario reaches human Desk Check.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'java-api-q2',
        projectId: '@evidence/server',
        testFilter: 'reengineering.ddd.evidence.ApplicationTest',
        supportedBy: ['TEST-001', 'TEST-002'],
        scenarioIds: ['SC-001'],
        scenarioOutcome:
          'A complete Tasking Candidate awaits human Desk Check.',
        businessData: ['TASKING-001'],
        modelRefs: emptyModelRefs,
      },
    ];
    const taskingCandidate = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/tasking/candidates`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: 6,
          storyId,
          storyRevisionId: scenarioDecision.body.storyRevision.id,
          noModelImpactDecisionId: noModelImpact.body.id,
          noModelImpactDecisionSha256: noModelImpact.body.contentSha256,
          projectCatalog,
          runtimes: [
            {
              id: 'RUNTIME-001',
              runtime: 'java',
              functionalContexts: ['delivery'],
              technicalBoundaries: ['java-domain'],
              projectIds: projectCatalog.projects.map(({ id }) => id),
            },
          ],
          tests,
          tasks: [
            {
              id: 'TASK-001',
              description: 'Drive the complete Tasking authority chain.',
              testIds: tests.map(({ id }) => id),
              dependsOn: [],
            },
          ],
        }),
      },
    );
    expect(taskingCandidate.status).toBe(201);
    expectHalResource(taskingCandidate, mediaTypes.taskingCandidate);
    expect(taskingCandidate.body).toMatchObject({
      storyId,
      storyRevisionId: scenarioDecision.body.storyRevision.id,
      baseCommitSha,
      tests: expect.arrayContaining([
        expect.objectContaining({
          id: 'TEST-003',
          processId: 'java-server-feature',
          modelRefs: emptyModelRefs,
        }),
      ]),
      tasks: [expect.objectContaining({ modelRefs: emptyModelRefs })],
    });

    const deskCheck = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/tasking`,
    );
    expect(deskCheck.body.iteration).toMatchObject({
      stage: 'desk_check',
      version: 7,
    });
    expect(deskCheck.body.currentCandidate.id).toBe(taskingCandidate.body.id);
    const approved = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/tasking/decisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: 7,
          candidateId: taskingCandidate.body.id,
          candidateSha256: taskingCandidate.body.contentSha256,
          action: 'approve',
        }),
      },
    );
    expect(approved.status).toBe(200);
    expectHalResource(approved, mediaTypes.deskCheckDecisionResult);
    expect(approved.body.iteration).toMatchObject({
      loop: 'tasking',
      stage: 'approved',
      version: 8,
    });
    expect(approved.body.approvedPlan).toMatchObject({
      storyId,
      storyRevisionId: scenarioDecision.body.storyRevision.id,
      taskingCandidateId: taskingCandidate.body.id,
      approvedByUserId: userId,
      plan: expect.objectContaining({
        planVersion: 2,
        contentSha256: taskingCandidate.body.contentSha256,
        baseCommitSha,
        executionBudget: expect.objectContaining({
          policyId: 'pair-default',
          maxAgentCalls: expect.any(Number),
          maxCheckpoints: expect.any(Number),
        }),
      }),
    });
    expect(approved.body._links).not.toHaveProperty('start-coding-run');

    const pairStart = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/pair/runs`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: 8,
          approvedTaskingPlanId: approved.body.approvedPlan.id,
          approvedTaskingPlanSha256: approved.body.approvedPlan.contentSha256,
          executorId: 'contract-desktop',
        }),
      },
    );
    expect(pairStart.status).toBe(201);
    expectHalResource(pairStart, mediaTypes.pairStartResult);
    expect(pairStart.body).toMatchObject({
      leaseToken: expect.any(String),
      pair: {
        run: {
          status: 'running',
          checkpoint: 'plan_confirmed',
          approvedTaskingPlanId: approved.body.approvedPlan.id,
        },
        nextAction: { kind: 'run_driver', role: 'test' },
      },
    });

    const pair = await apiRequest(
      `/api/workspaces/${workspaceId}/iterations/${iterationId}/pair`,
    );
    expect(pair.status).toBe(200);
    expectHalResource(pair, mediaTypes.pair);
    expect(pair.body.run.id).toBe(pairStart.body.pair.run.id);

    const pairPath = `/api/workspaces/${workspaceId}/iterations/${iterationId}/pair`;
    let pairView = pairStart.body.pair;
    let leaseToken = pairStart.body.leaseToken as string;
    let evidenceSequence = 1;
    let worktreeSha256 = contractSha(evidenceSequence++);
    let diffSha256 = contractSha(evidenceSequence++);
    const postMachineEvidence = async (suffix: string, body: object) => {
      const response = await apiRequest(`${pairPath}/${suffix}`, {
        method: 'POST',
        headers: { 'X-Evidence-Pair-Lease': leaseToken },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(201);
      pairView = response.body.pair;
      return response;
    };
    const authority = () => ({
      pairRunId: pairView.run.id,
      actionId: pairView.nextAction.actionId,
      expectedPairVersion: pairView.nextAction.expectedPairVersion,
    });
    const claimPair = async (executorId: string) => {
      const claimed = await apiRequest(`${pairPath}/lease/claim`, {
        method: 'POST',
        body: JSON.stringify({
          pairRunId: pairView.run.id,
          expectedPairVersion: pairView.run.version,
          executorId,
        }),
      });
      expect(claimed.status).toBe(200);
      leaseToken = claimed.body.leaseToken;
    };
    const driveToHuman = async (failOneQualityGate: boolean) => {
      let qualityFailurePending = failOneQualityGate;
      for (let step = 0; step < 100; step += 1) {
        const action = pairView.nextAction;
        if (!action || action.kind === 'await_human') return;
        if (action.kind === 'run_driver') {
          const beforeWorktreeSha256 = worktreeSha256;
          const changedPaths: string[] = [];
          if (action.role !== 'refactor') {
            const roots =
              action.role === 'test'
                ? action.allowedTestRoots
                : action.allowedProductionRoots;
            const root = roots[0];
            if (typeof root !== 'string') {
              throw new Error('Pair Driver action lost its approved root.');
            }
            changedPaths.push(
              `${root}/pair-contract-${String(evidenceSequence)}${
                action.role === 'test' ? '.spec.ts' : '.ts'
              }`,
            );
            worktreeSha256 = contractSha(evidenceSequence++);
            diffSha256 = contractSha(evidenceSequence++);
          }
          await postMachineEvidence('driver-attempts', {
            ...authority(),
            role: action.role,
            mode: action.mode,
            summary: `Contract ${action.mode} completed.`,
            changedPaths,
            beforeWorktreeSha256,
            afterWorktreeSha256: worktreeSha256,
            diffSha256,
            agentCallCount: 1,
            inputTokens: null,
            outputTokens: null,
          });
          continue;
        }
        if (action.kind === 'execute_command') {
          const fail =
            action.stage === 'red' ||
            (action.stage === 'quality_gate' && qualityFailurePending);
          if (action.stage === 'quality_gate' && qualityFailurePending) {
            qualityFailurePending = false;
          }
          await postMachineEvidence('command-observations', {
            ...authority(),
            stage: action.stage,
            command: action.command,
            termination: 'exited',
            exitCode: fail ? 1 : 0,
            signal: null,
            durationMs: 25,
            stdoutSha256: contractSha(fail ? 900 : 901),
            stdoutBytes: 24,
            stdoutLines: 1,
            stderrSha256: contractSha(fail ? 902 : 903),
            stderrBytes: fail ? 12 : 0,
            stderrLines: fail ? 1 : 0,
            worktreeSha256,
            diffSha256,
          });
          if (pairView.run.status === 'exception') return;
          continue;
        }
        if (action.kind === 'review_red') {
          await postMachineEvidence('red-reviews', {
            ...authority(),
            observationId: action.observationId,
            classification: 'behavior',
            reason: 'The approved behavior assertion was reached and failed.',
          });
          continue;
        }
        throw new Error(`Unexpected Pair action ${String(action.kind)}.`);
      }
      throw new Error('Pair contract exceeded its bounded action loop.');
    };

    await driveToHuman(true);
    expect(pairView.currentException).toMatchObject({
      kind: 'quality_gate_failed',
    });
    const retryQuality = await apiRequest(`${pairPath}/decisions`, {
      method: 'POST',
      body: JSON.stringify({
        expectedPairVersion: pairView.run.version,
        action: 'retry_quality',
        reason: 'Repair the exact failed quality observation.',
      }),
    });
    expect(retryQuality.status).toBe(200);
    pairView = retryQuality.body.pair;
    expect(pairView.nextAction).toMatchObject({
      kind: 'run_driver',
      mode: 'repair_quality_gate',
      diagnosticObservationId: expect.any(String),
    });
    await claimPair('contract-desktop-quality-repair');
    await driveToHuman(false);
    expect(pairView.run.status).toBe('approval_required');
    const firstManifest = pairView.manifest;

    const implementationReason =
      'The complete diff needs one bounded implementation correction.';
    const backImplementation = await apiRequest(`${pairPath}/decisions`, {
      method: 'POST',
      body: JSON.stringify({
        expectedPairVersion: pairView.run.version,
        action: 'back_implementation',
        reason: implementationReason,
      }),
    });
    expect(backImplementation.status).toBe(200);
    pairView = backImplementation.body.pair;
    expect(pairView).toMatchObject({
      manifest: null,
      nextAction: {
        kind: 'run_driver',
        mode: 'repair_implementation',
        repairDecisionId: expect.any(String),
        repairInstruction: implementationReason,
      },
    });
    await claimPair('contract-desktop-implementation-repair');
    await driveToHuman(false);
    expect(pairView.run.status).toBe('approval_required');
    expect(pairView.manifest.id).not.toBe(firstManifest.id);
    expect(pairView.manifest.finalDiffSha256).toBe(diffSha256);
    expect(pairView.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'retry_quality' }),
        expect.objectContaining({
          action: 'back_implementation',
          reason: implementationReason,
        }),
      ]),
    );

    const approvalInput = {
      expectedPairVersion: pairView.run.version,
      action: 'approve',
      reason: 'Reviewed the complete revised Story diff.',
      manifestSha256: pairView.manifest.contentSha256,
      diffSha256: pairView.manifest.finalDiffSha256,
      commitSha: 'c'.repeat(40),
    };
    const pairApproval = await apiRequest(`${pairPath}/decisions`, {
      method: 'POST',
      body: JSON.stringify(approvalInput),
    });
    expect(pairApproval.status).toBe(200);
    expect(pairApproval.body.pair.run).toMatchObject({
      status: 'approved',
      checkpoint: 'approved',
      approvedCommitSha: approvalInput.commitSha,
    });
    const approvalReplay = await apiRequest(`${pairPath}/decisions`, {
      method: 'POST',
      body: JSON.stringify(approvalInput),
    });
    expect(approvalReplay.status).toBe(200);
    expect(approvalReplay.body.acceptedRecordId).toBe(
      pairApproval.body.acceptedRecordId,
    );

    const showcasePath = `/api/workspaces/${workspaceId}/iterations/${iterationId}/showcase`;
    const showcase = await apiRequest(showcasePath);
    expect(showcase.status).toBe(200);
    expectHalResource(showcase, mediaTypes.showcase);
    let showcaseView = showcase.body;
    expect(showcaseView).toMatchObject({
      run: {
        pairRunId: pairView.run.id,
        pairManifestSha256: pairView.manifest.contentSha256,
        approvedCommitSha: approvalInput.commitSha,
        stage: 'setup',
      },
      nextAction: { kind: 'execute_q2', testId: 'TEST-003' },
    });
    const postShowcase = async (
      suffix: string,
      body: object,
      expectedStatus = 201,
    ) => {
      const response = await apiRequest(`${showcasePath}/${suffix}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(expectedStatus);
      expectHalResource(response, mediaTypes.showcaseActionResult);
      showcaseView = response.body.showcase;
      return response;
    };

    const q2Action = showcaseView.nextAction;
    await postShowcase('q2-observations', {
      showcaseRunId: showcaseView.run.id,
      actionId: q2Action.actionId,
      expectedShowcaseVersion: q2Action.expectedShowcaseVersion,
      command: q2Action.command,
      termination: 'exited',
      exitCode: 0,
      signal: null,
      durationMs: 50,
      stdoutSha256: contractSha(950),
      stdoutBytes: 20,
      stdoutLines: 1,
      stderrSha256: contractSha(951),
      stderrBytes: 0,
      stderrLines: 0,
      approvedCommitSha: approvalInput.commitSha,
      worktreeSha256,
    });
    expect(showcaseView.nextAction).toMatchObject({
      kind: 'observe_scenario',
      scenarioReference: 'SC-001',
    });

    const observeAction = showcaseView.nextAction;
    await postShowcase('product-observations', {
      expectedShowcaseVersion: observeAction.expectedShowcaseVersion,
      scenarioId: observeAction.scenarioId,
      observedOutcomes: [
        'A complete Tasking Candidate awaited human Desk Check.',
      ],
      observation:
        'The delivery lead observed the complete Candidate in the product surface.',
      valueFeedback:
        'The confirmed Scenario value is visible and remains human-controlled.',
      evidenceRefs: ['contract:showcase-product-observation'],
    });
    expect(showcaseView.nextAction).toMatchObject({
      kind: 'decide_risk',
      quadrant: 'Q3',
    });

    for (const quadrant of ['Q3', 'Q4']) {
      const riskAction = showcaseView.nextAction;
      expect(riskAction).toMatchObject({ kind: 'decide_risk', quadrant });
      await postShowcase('risk-decisions', {
        expectedShowcaseVersion: riskAction.expectedShowcaseVersion,
        quadrant,
        disposition: 'not_required',
        activities: [],
        reason: `${quadrant} adds no further risk activity for this contract slice.`,
      });
    }
    const reviewAction = showcaseView.nextAction;
    expect(reviewAction).toMatchObject({
      kind: 'run_reviewer',
      evidenceBundleSha256: expect.any(String),
    });
    await postShowcase('reviews', {
      expectedShowcaseVersion: reviewAction.expectedShowcaseVersion,
      evidenceBundleSha256: reviewAction.evidenceBundleSha256,
      observedFacts: [
        'Fresh Q2 and human product observations cover the confirmed Scenario.',
      ],
      productDomainFeedback: [],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'accept',
    });
    expect(showcaseView.nextAction).toMatchObject({ kind: 'await_human' });

    const unsafePairRoute = await apiRequest(`${showcasePath}/decisions`, {
      method: 'POST',
      body: JSON.stringify({
        expectedShowcaseVersion:
          showcaseView.nextAction.expectedShowcaseVersion,
        action: 'revise',
        reason: 'This route requires deterministic worktree recovery.',
        feedbackTarget: 'implementation',
        evidenceBundleSha256: showcaseView.run.evidenceBundleSha256,
        reviewSha256: showcaseView.review.contentSha256,
      }),
    });
    expect(unsafePairRoute.status).toBe(400);

    const showcaseAcceptance = await postShowcase(
      'decisions',
      {
        expectedShowcaseVersion:
          showcaseView.nextAction.expectedShowcaseVersion,
        action: 'accept',
        reason:
          'The domain expert accepts the observed product behavior and value.',
        evidenceBundleSha256: showcaseView.run.evidenceBundleSha256,
        reviewSha256: showcaseView.review.contentSha256,
      },
      200,
    );
    expect(showcaseAcceptance.body.showcase.run.stage).toBe('accepted');
    expect(showcaseAcceptance.body.showcase._links).toHaveProperty('respond');

    const respondPath = `/api/workspaces/${workspaceId}/iterations/${iterationId}/respond`;
    const respond = await apiRequest(respondPath);
    expect(respond.status).toBe(200);
    expectHalResource(respond, mediaTypes.respond);
    expect(respond.body).toMatchObject({
      iteration: { loop: 'respond', stage: 'drafting' },
      candidates: [],
      decisions: [],
      nextAction: { kind: 'run_learner' },
    });
    const learnerAction = respond.body.nextAction;
    const respondCandidate = await apiRequest(`${respondPath}/candidates`, {
      method: 'POST',
      body: JSON.stringify({
        actionId: learnerAction.actionId,
        expectedIterationVersion: learnerAction.expectedIterationVersion,
        authoritySha256: learnerAction.authoritySha256,
        promotions: [],
        noPromotionReason:
          'This contract run validated no reusable knowledge beyond existing authority.',
        observedOutcomes: [
          'The confirmed Scenario behavior and value were accepted by a human.',
        ],
        residualRisks: [],
        nextProbe: {
          question:
            'Which additional product risk should a future human-selected Story validate?',
          whyNow:
            'The current Story is complete and should not absorb unrelated scope.',
          evidenceRefs: ['showcase:accepted-decision'],
          firstAction:
            'A human decides whether to capture this Probe into the Inbox.',
        },
      }),
    });
    expect(respondCandidate.status).toBe(201);
    expectHalResource(respondCandidate, mediaTypes.respondActionResult);
    const respondView = respondCandidate.body.respond;
    expect(respondView).toMatchObject({
      iteration: { stage: 'decision' },
      candidates: [
        expect.objectContaining({
          promotions: [],
          noPromotionReason: expect.any(String),
        }),
      ],
      nextAction: { kind: 'await_human' },
    });
    const respondDecisionAction = respondView.nextAction;
    const respondApproval = await apiRequest(`${respondPath}/decisions`, {
      method: 'POST',
      body: JSON.stringify({
        expectedIterationVersion:
          respondDecisionAction.expectedIterationVersion,
        candidateId: respondDecisionAction.candidateId,
        candidateSha256: respondDecisionAction.candidateSha256,
        authoritySha256: respondDecisionAction.authoritySha256,
        action: 'approve',
        reason:
          'The domain expert reviewed the no-promotion reason and concrete next Probe.',
      }),
    });
    expect(respondApproval.status).toBe(200);
    expectHalResource(respondApproval, mediaTypes.respondActionResult);
    expect(respondApproval.body.respond).toMatchObject({
      iteration: { loop: 'respond', stage: 'accepted' },
      nextAction: null,
      decisions: [expect.objectContaining({ action: 'approve' })],
    });

    const completedStory = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}`,
    );
    expect(completedStory.body).toMatchObject({
      iterationLoop: 'respond',
      iterationStage: 'accepted',
      authority: { owner: 'none', nextAction: 'none' },
    });

    const removedDirectAdmission = await apiRequest(
      `/api/workspaces/${workspaceId}/stories/${storyId}/coding-runs`,
      {
        method: 'POST',
        body: JSON.stringify({
          storyRevisionId: scenarioDecision.body.storyRevision.id,
          baseCommitSha,
        }),
      },
    );
    expect(removedDirectAdmission.status).toBe(404);
  }, 30_000);

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

  it('enforces membership uniqueness and preserves the workspace owner', async () => {
    const workspace = await createContractWorkspace(
      'Membership Diagram Workspace',
    );
    const workspaceId = workspace.body.id as string;

    const memberships = await apiRequest(
      `/api/workspaces/${workspaceId}/memberships`,
    );
    expect(memberships.status).toBe(200);
    expectHalResource(memberships, mediaTypes.memberships);
    expect(memberships.body.page).toMatchObject({ number: 1, size: 20 });
    expect(memberships.body._embedded.memberships).toHaveLength(1);
    const owner = memberships.body._embedded.memberships[0];
    expect(owner).toMatchObject({ role: 'owner', user: { id: userId } });

    const duplicate = await apiRequest(
      `/api/workspaces/${workspaceId}/memberships`,
      {
        method: 'POST',
        body: JSON.stringify({ user: { id: userId }, role: 'member' }),
      },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already/i);

    const membership = await apiRequest(
      `/api/workspaces/${workspaceId}/memberships/${owner.id}`,
    );
    expect(membership.status).toBe(200);
    expectHalResource(membership, mediaTypes.membership);

    const demoted = await apiRequest(
      `/api/workspaces/${workspaceId}/memberships/${owner.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'member' }),
      },
    );
    expect(demoted.status).toBe(409);

    const removed = await apiRequest(
      `/api/workspaces/${workspaceId}/memberships/${owner.id}`,
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
