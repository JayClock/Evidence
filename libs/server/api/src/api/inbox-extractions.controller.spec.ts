import { describe, expect, it, vi } from 'vitest';
import {
  InboxExtraction,
  InboxStoryCandidate,
  Ref,
  type Workspace,
  type WorkspaceInboxWorkflow,
} from '@evidence/server-domain';
import { InboxExtractionsController } from './inbox-extractions.controller';
import type { ResourceResolver } from './resource-resolver.service';

const timestamp = '2026-01-01T00:00:00.000Z';
const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const candidateSha256 = `sha256:${'b'.repeat(64)}`;

function extraction(status: 'awaiting_agent' | 'completed' = 'awaiting_agent') {
  return new InboxExtraction('extraction-1', {
    reference: 'EXTRACT-0001',
    workspace: new Ref('workspace-1'),
    status,
    sources: [
      {
        position: 0,
        inboxItem: new Ref('inbox-1'),
        inboxRevision: new Ref('revision-1'),
        revisionNumber: 2,
        sourceKind: 'manual_text',
        externalKey: 'manual:one',
        itemStatus: 'active',
        title: 'Source',
        body: 'Exact source body',
        contentType: 'text/plain',
        uri: null,
        providerMetadata: {},
        sourceUpdatedAt: null,
        capturedAt: timestamp,
        contentSha256: revisionSha256,
      },
    ],
    version: status === 'completed' ? 2 : 1,
    requestedBy: new Ref('user-1'),
    requestedAt: timestamp,
    completedAt: status === 'completed' ? timestamp : null,
    failureSummary: null,
  });
}

function candidate() {
  return new InboxStoryCandidate('candidate-1', {
    reference: 'CAND-0001',
    workspace: new Ref('workspace-1'),
    extraction: new Ref('extraction-1'),
    title: 'One Story',
    problem: 'The source needs a bounded outcome.',
    role: 'Workspace maintainer',
    goal: 'Start one iteration.',
    value: 'Delivery remains traceable.',
    cognitiveMode: 'complicated',
    citations: [
      {
        inboxItem: new Ref('inbox-1'),
        inboxRevision: new Ref('revision-1'),
        revisionNumber: 2,
        revisionSha256,
        locator: 'whole-source',
      },
    ],
    contentSha256: candidateSha256,
    status: 'ready',
    proposedBy: 'inbox-analyst',
    proposedAt: timestamp,
    terminalDecision: null,
    selectedIteration: null,
  });
}

function controllerFixture() {
  const workflow = {
    createExtraction: vi.fn(async () => extraction()),
    findExtraction: vi.fn(async () => extraction()),
    proposeCandidates: vi.fn(async () => ({
      extraction: extraction('completed'),
      candidates: [candidate()],
    })),
  } as unknown as WorkspaceInboxWorkflow;
  const workspace = {
    inboxWorkflow: () => workflow,
  } as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    currentUserId: vi.fn(() => 'user-1'),
  } as unknown as ResourceResolver;
  return {
    controller: new InboxExtractionsController(resolver),
    resolver,
    workflow,
  };
}

describe('InboxExtractionsController', () => {
  it('records the human-selected source set and returns its Location', async () => {
    const { controller, workflow } = controllerFixture();
    const response = { setHeader: vi.fn() };

    const model = await controller.createExtraction(
      'workspace-1',
      { inboxItemIds: [' inbox-1 '] },
      response,
    );

    expect(workflow.createExtraction).toHaveBeenCalledWith(
      { inboxItemIds: ['inbox-1'] },
      'user-1',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/workspaces/workspace-1/inbox-extractions/extraction-1',
    );
    expect(model).toMatchObject({
      id: 'extraction-1',
      reference: 'EXTRACT-0001',
      status: 'awaiting_agent',
      _links: {
        'propose-candidates': {
          href: '/api/workspaces/workspace-1/inbox-extractions/extraction-1/candidates',
        },
      },
      sources: [
        expect.objectContaining({
          inboxItemId: 'inbox-1',
          contentSha256: revisionSha256,
        }),
      ],
    });
  });

  it('accepts one structured Agent Candidate batch with exact SHA citations', async () => {
    const { controller, workflow } = controllerFixture();

    const model = await controller.proposeCandidates(
      'workspace-1',
      'extraction-1',
      {
        expectedVersion: 1,
        candidates: [
          {
            title: ' One Story ',
            problem: 'The source needs a bounded outcome.',
            role: 'Workspace maintainer',
            goal: 'Start one iteration.',
            value: 'Delivery remains traceable.',
            cognitiveMode: 'complicated',
            citations: [
              {
                inboxItemId: 'inbox-1',
                revisionSha256,
                locator: 'whole-source',
              },
            ],
          },
        ],
      },
    );

    expect(workflow.proposeCandidates).toHaveBeenCalledWith('extraction-1', 1, [
      expect.objectContaining({
        title: 'One Story',
        citations: [
          { inboxItemId: 'inbox-1', revisionSha256, locator: 'whole-source' },
        ],
      }),
    ]);
    expect(model.extraction.status).toBe('completed');
    expect(model._embedded.storyCandidates[0]).toMatchObject({
      id: 'candidate-1',
      status: 'ready',
      _links: {
        select: {
          href: '/api/workspaces/workspace-1/story-candidates/candidate-1/select',
        },
      },
    });
  });

  it('rejects malformed Candidate batches before delegation', async () => {
    const { controller, workflow } = controllerFixture();

    await expect(
      controller.proposeCandidates('workspace-1', 'extraction-1', {
        expectedVersion: 1,
        candidates: 'not-an-array',
      }),
    ).rejects.toThrow('candidates must be an array');
    expect(workflow.proposeCandidates).not.toHaveBeenCalled();
  });

  it('returns not found for an Extraction outside the Workspace', async () => {
    const { controller, workflow } = controllerFixture();
    vi.mocked(workflow.findExtraction).mockResolvedValueOnce(null);

    await expect(
      controller.getExtraction('workspace-1', 'missing'),
    ).rejects.toThrow('Inbox Extraction missing not found');
  });
});
