import { describe, expect, it } from 'vitest';
import type { InboxStoryCandidateInput } from '@evidence/server-domain';
import { hashInboxCandidateInput } from '../workflow-content';
import {
  asStore,
  mockPrismaStore,
  timestamp,
  type MockPrismaStore,
} from './test-support';
import { PrismaWorkspaceInboxWorkflow } from './workspace-inbox-workflow';

const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const candidateInput: InboxStoryCandidateInput = {
  title: 'Frozen delivery intake',
  problem: 'A mutable source cannot authorize coding work.',
  role: 'Workspace maintainer',
  goal: 'Select an exact candidate for one iteration.',
  value: 'Delivery remains traceable to immutable evidence.',
  cognitiveMode: 'complicated',
  citations: [
    {
      inboxItemId: 'inbox-1',
      revisionSha256,
      locator: 'whole-source',
    },
  ],
};

function extractionSourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-1',
    extractionId: 'extraction-1',
    inboxItemId: 'inbox-1',
    inboxRevisionId: 'revision-1',
    position: 0,
    revisionNumber: 2,
    sourceKind: 'manual_text',
    externalKey: 'manual:one',
    itemStatus: 'active',
    title: 'Frozen source',
    body: 'Exact body',
    contentType: 'text/plain',
    uri: null,
    providerMetadata: {},
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256: revisionSha256,
    ...overrides,
  };
}

function extractionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'extraction-1',
    reference: 'EXTRACT-0001',
    workspaceId: 'workspace-1',
    status: 'awaiting_agent',
    version: 1,
    requestedByUserId: 'user-1',
    requestedAt: timestamp,
    completedAt: null,
    failureSummary: null,
    sources: [extractionSourceRow()],
    ...overrides,
  };
}

function inboxRevisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1',
    inboxItemId: 'inbox-1',
    revisionNumber: 2,
    title: 'Frozen source',
    body: 'Exact body',
    contentType: 'text/plain',
    uri: null,
    providerMetadata: {},
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256: revisionSha256,
    ...overrides,
  };
}

function citationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'citation-1',
    candidateId: 'candidate-1',
    inboxItemId: 'inbox-1',
    inboxRevisionId: 'revision-1',
    position: 0,
    locator: 'whole-source',
    revisionSha256,
    inboxRevision: inboxRevisionRow(),
    inboxItem: { latestRevisionId: 'revision-1' },
    ...overrides,
  };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    reference: 'CAND-0001',
    workspaceId: 'workspace-1',
    extractionId: 'extraction-1',
    ...candidateInput,
    contentSha256: hashInboxCandidateInput(candidateInput).contentSha256,
    proposedAt: timestamp,
    citations: [citationRow()],
    decision: null,
    selectedIteration: null,
    ...overrides,
  };
}

function sequenceRow(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'workspace-1',
    nextExtractionNumber: 2,
    nextCandidateNumber: 2,
    nextDecisionNumber: 2,
    nextIterationNumber: 1,
    nextKickoffNumber: 1,
    updatedAt: timestamp,
    ...overrides,
  };
}

function setupProposal(store: MockPrismaStore) {
  store.inboxExtraction.findFirst
    .mockResolvedValueOnce(extractionRow())
    .mockResolvedValueOnce(
      extractionRow({
        status: 'completed',
        version: 2,
        completedAt: timestamp,
      }),
    );
  store.workspaceSequence.upsert.mockResolvedValue(sequenceRow());
  store.inboxExtraction.updateMany.mockResolvedValue({ count: 1 });
  store.inboxStoryCandidate.findMany.mockResolvedValue([candidateRow()]);
}

describe('PrismaWorkspaceInboxWorkflow proposals', () => {
  it('persists one exact-revision Candidate set and completes Extraction once', async () => {
    const store = mockPrismaStore();
    setupProposal(store);
    const workflow = new PrismaWorkspaceInboxWorkflow(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const result = await workflow.proposeCandidates('extraction-1', 1, [
      candidateInput,
    ]);

    expect(result.extraction.description().status).toBe('completed');
    expect(result.candidates[0]?.description()).toMatchObject({
      reference: 'CAND-0001',
      status: 'ready',
      proposedBy: 'inbox-analyst',
      citations: [
        expect.objectContaining({
          revisionNumber: 2,
          revisionSha256,
          locator: 'whole-source',
        }),
      ],
    });
    expect(store.inboxStoryCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reference: 'CAND-0001',
        extractionId: 'extraction-1',
        contentSha256: hashInboxCandidateInput(candidateInput).contentSha256,
      }),
    });
    expect(store.inboxStoryCitation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inboxItemId: 'inbox-1',
          inboxRevisionId: 'revision-1',
          revisionSha256,
        }),
      ],
    });
    expect(store.inboxExtraction.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'extraction-1',
        status: 'awaiting_agent',
        version: 1,
      }),
      data: expect.objectContaining({
        status: 'completed',
        version: { increment: 1 },
      }),
    });
  });

  it('rejects a Citation hash other than the frozen selected Revision', async () => {
    const store = mockPrismaStore();
    store.inboxExtraction.findFirst.mockResolvedValue(extractionRow());
    store.workspaceSequence.upsert.mockResolvedValue(sequenceRow());
    const workflow = new PrismaWorkspaceInboxWorkflow(
      asStore(store),
      'workspace-1',
    );

    await expect(
      workflow.proposeCandidates('extraction-1', 1, [
        {
          ...candidateInput,
          citations: [
            {
              ...candidateInput.citations[0],
              revisionSha256: `sha256:${'b'.repeat(64)}`,
            },
          ],
        },
      ]),
    ).rejects.toThrow('no longer matches selected source');
    expect(store.inboxExtraction.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a second proposal batch for one Extraction', async () => {
    const store = mockPrismaStore();
    store.inboxExtraction.findFirst.mockResolvedValue(
      extractionRow({ status: 'completed', version: 2 }),
    );
    const workflow = new PrismaWorkspaceInboxWorkflow(
      asStore(store),
      'workspace-1',
    );

    await expect(
      workflow.proposeCandidates('extraction-1', 2, [candidateInput]),
    ).rejects.toThrow('no longer accepts Candidates');
    expect(store.inboxStoryCandidate.create).not.toHaveBeenCalled();
  });
});

describe('PrismaWorkspaceInboxWorkflow candidate authority', () => {
  it('derives staleness from the live latest Revision without mutating Candidate', async () => {
    const store = mockPrismaStore();
    store.inboxStoryCandidate.findMany.mockResolvedValue([
      candidateRow({
        citations: [
          citationRow({ inboxItem: { latestRevisionId: 'revision-2' } }),
        ],
      }),
    ]);
    const workflow = new PrismaWorkspaceInboxWorkflow(
      asStore(store),
      'workspace-1',
    );

    const [candidates] = await workflow.listCandidates({
      page: 1,
      pageSize: 20,
      status: 'stale',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.description().status).toBe('stale');
    expect(store.inboxStoryCandidate.findMany).toHaveBeenCalledTimes(1);
  });

  it('gives a unique Iteration claim precedence over later source changes', async () => {
    const store = mockPrismaStore();
    store.inboxStoryCandidate.findFirst.mockResolvedValue(
      candidateRow({
        citations: [
          citationRow({ inboxItem: { latestRevisionId: 'revision-2' } }),
        ],
        selectedIteration: { id: 'iteration-1' },
      }),
    );
    const workflow = new PrismaWorkspaceInboxWorkflow(
      asStore(store),
      'workspace-1',
    );

    const candidate = await workflow.findCandidate('candidate-1');
    expect(candidate?.description().status).toBe('selected');
  });

  it('records a human terminal decision without creating a Story', async () => {
    const store = mockPrismaStore();
    let persistedDecision: Record<string, unknown> | null = null;
    store.inboxStoryCandidate.findFirst
      .mockResolvedValueOnce(candidateRow())
      .mockImplementationOnce(() =>
        Promise.resolve(
          candidateRow({
            decision: persistedDecision,
          }),
        ),
      );
    store.workspaceSequence.upsert.mockResolvedValue(sequenceRow());
    store.inboxCandidateDecision.create.mockImplementation(({ data }) => {
      persistedDecision = data as Record<string, unknown>;
      return Promise.resolve(data);
    });
    const workflow = new PrismaWorkspaceInboxWorkflow(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const result = await workflow.decideCandidate(
      'candidate-1',
      hashInboxCandidateInput(candidateInput).contentSha256,
      'defer',
      ' Not ready for delivery. ',
      'user-1',
    );

    expect(result.candidate.description().status).toBe('deferred');
    expect(result.decision.description()).toMatchObject({
      reference: 'DECISION-0001',
      action: 'defer',
      reason: 'Not ready for delivery.',
    });
    expect(store.story.create).not.toHaveBeenCalled();
    expect(store.inboxCandidateDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateId: 'candidate-1',
        action: 'defer',
        decidedByUserId: 'user-1',
      }),
    });
  });
});
