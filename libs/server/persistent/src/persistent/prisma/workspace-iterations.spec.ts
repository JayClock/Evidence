import { describe, expect, it } from 'vitest';
import type { InboxStoryCandidateInput } from '@evidence/server-domain';
import { hashInboxCandidateInput } from '../workflow-content';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceIterations } from './workspace-iterations';

const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const candidateInput: InboxStoryCandidateInput = {
  title: 'Frozen iteration',
  problem: 'Live sources can change after work starts.',
  role: 'Workspace maintainer',
  goal: 'Start from one immutable intake.',
  value: 'Kickoff decisions remain auditable.',
  cognitiveMode: 'complicated',
  citations: [
    {
      inboxItemId: 'inbox-1',
      revisionSha256,
      locator: 'whole-source',
    },
  ],
};
const candidateSha256 = hashInboxCandidateInput(candidateInput).contentSha256;
const baseCommitSha = 'b'.repeat(40);

function revisionRow() {
  return {
    id: 'revision-1',
    inboxItemId: 'inbox-1',
    revisionNumber: 2,
    title: 'Source',
    body: 'Exact source body',
    contentType: 'text/plain',
    uri: null,
    providerMetadata: {},
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256: revisionSha256,
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
    inboxRevision: revisionRow(),
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
    contentSha256: candidateSha256,
    proposedAt: timestamp,
    citations: [citationRow()],
    decision: null,
    selectedIteration: null,
    ...overrides,
  };
}

function extractionSourceRow() {
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
    title: 'Source',
    body: 'Exact source body',
    contentType: 'text/plain',
    uri: null,
    providerMetadata: {},
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256: revisionSha256,
  };
}

function extractionRow() {
  return {
    id: 'extraction-1',
    reference: 'EXTRACT-0001',
    workspaceId: 'workspace-1',
    status: 'completed',
    version: 2,
    requestedByUserId: 'user-1',
    requestedAt: timestamp,
    completedAt: timestamp,
    failureSummary: null,
    sources: [extractionSourceRow()],
  };
}

function storedCitation() {
  return {
    inboxItemId: 'inbox-1',
    inboxRevisionId: 'revision-1',
    revisionNumber: 2,
    revisionSha256,
    locator: 'whole-source',
  };
}

function candidateSnapshot() {
  return {
    candidateId: 'candidate-1',
    candidateReference: 'CAND-0001',
    extractionId: 'extraction-1',
    ...candidateInput,
    citations: [storedCitation()],
    contentSha256: candidateSha256,
    proposedAt: timestamp.toISOString(),
  };
}

function sourceSnapshot() {
  return {
    position: 0,
    inboxItemId: 'inbox-1',
    inboxRevisionId: 'revision-1',
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
    capturedAt: timestamp.toISOString(),
    contentSha256: revisionSha256,
  };
}

function iterationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'iteration-1',
    reference: 'ITER-0001',
    workspaceId: 'workspace-1',
    sourceCandidateId: 'candidate-1',
    sourceCandidateSha256: candidateSha256,
    lifecycle: 'provisioning',
    loop: 'kickoff',
    stage: 'candidate_review',
    lane: 'discovery',
    version: 1,
    baseCommitSha,
    branchName: null,
    provisioningFailureSummary: null,
    admittedByUserId: 'user-1',
    admittedAt: timestamp,
    updatedAt: timestamp,
    story: null,
    ...overrides,
  };
}

function intakeRow() {
  return {
    iterationId: 'iteration-1',
    candidateSnapshot: candidateSnapshot(),
    sourceSnapshots: [sourceSnapshot()],
    requirementsProjection: '# Frozen iteration\n',
    contentSha256: `sha256:${'c'.repeat(64)}`,
    frozenAt: timestamp,
  };
}

function proposalRow() {
  return {
    id: 'proposal-1',
    reference: 'KICKOFF-0001',
    iterationId: 'iteration-1',
    sequence: 1,
    origin: 'inbox_candidate',
    ...candidateInput,
    citations: [storedCitation()],
    contentSha256: `sha256:${'d'.repeat(64)}`,
    proposedAt: timestamp,
  };
}

function sequenceRow(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'workspace-1',
    nextExtractionNumber: 2,
    nextCandidateNumber: 2,
    nextDecisionNumber: 1,
    nextIterationNumber: 2,
    nextKickoffNumber: 2,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('PrismaWorkspaceIterations admission', () => {
  it('atomically claims one ready Candidate and freezes self-contained Intake', async () => {
    const store = mockPrismaStore();
    store.inboxStoryCandidate.findFirst.mockResolvedValue(candidateRow());
    store.iteration.count.mockResolvedValue(0);
    store.inboxExtraction.findFirst.mockResolvedValue(extractionRow());
    store.workspaceSequence.upsert
      .mockResolvedValueOnce(sequenceRow())
      .mockResolvedValueOnce(sequenceRow());
    store.iteration.findFirst.mockResolvedValue(iterationRow());
    store.iterationIntake.findFirst.mockResolvedValue(intakeRow());
    store.kickoffProposal.findFirst.mockResolvedValue(proposalRow());
    const iterations = new PrismaWorkspaceIterations(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const selected = await iterations.selectCandidate(
      {
        candidateId: 'candidate-1',
        candidateSha256,
        baseCommitSha,
      },
      'user-1',
    );

    expect(selected.iteration.description()).toMatchObject({
      reference: 'ITER-0001',
      lifecycle: 'provisioning',
      loop: 'kickoff',
      stage: 'candidate_review',
      activeStory: null,
    });
    expect(selected.intake.description()).toMatchObject({
      candidate: expect.objectContaining({
        candidateReference: 'CAND-0001',
        contentSha256: candidateSha256,
      }),
      sources: [
        expect.objectContaining({
          body: 'Exact source body',
          contentSha256: revisionSha256,
        }),
      ],
    });
    expect(selected.proposal.description()).toMatchObject({
      reference: 'KICKOFF-0001',
      origin: 'inbox_candidate',
      sequence: 1,
    });
    expect(store.iterationIntake.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        iterationId: expect.any(String),
        candidateSnapshot: expect.objectContaining({
          candidateId: 'candidate-1',
        }),
        sourceSnapshots: [
          expect.objectContaining({ inboxRevisionId: 'revision-1' }),
        ],
        contentSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    });
    expect(store.story.create).not.toHaveBeenCalled();
  });

  it('rejects stale Candidates and a full discovery lane', async () => {
    const staleStore = mockPrismaStore();
    staleStore.inboxStoryCandidate.findFirst.mockResolvedValue(
      candidateRow({
        citations: [
          citationRow({ inboxItem: { latestRevisionId: 'revision-2' } }),
        ],
      }),
    );
    const stale = new PrismaWorkspaceIterations(
      asStore(staleStore),
      'workspace-1',
    );
    await expect(
      stale.selectCandidate(
        { candidateId: 'candidate-1', candidateSha256, baseCommitSha },
        'user-1',
      ),
    ).rejects.toThrow('is stale');

    const fullStore = mockPrismaStore();
    fullStore.inboxStoryCandidate.findFirst.mockResolvedValue(candidateRow());
    fullStore.iteration.count.mockResolvedValue(2);
    const full = new PrismaWorkspaceIterations(
      asStore(fullStore),
      'workspace-1',
    );
    await expect(
      full.selectCandidate(
        { candidateId: 'candidate-1', candidateSha256, baseCommitSha },
        'user-1',
      ),
    ).rejects.toThrow('WIP limit 2');
    expect(fullStore.iteration.create).not.toHaveBeenCalled();
  });
});

describe('PrismaWorkspaceIterations provisioning', () => {
  it('activates only the deterministic branch at the frozen base', async () => {
    const store = mockPrismaStore();
    store.iteration.findFirst
      .mockResolvedValueOnce(iterationRow())
      .mockResolvedValueOnce(
        iterationRow({
          lifecycle: 'active',
          version: 2,
          branchName: 'evidence/iter-0001',
        }),
      );
    store.iteration.updateMany.mockResolvedValue({ count: 1 });
    const iterations = new PrismaWorkspaceIterations(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const iteration = await iterations.completeProvisioning('iteration-1', {
      expectedVersion: 1,
      baseCommitSha,
      branchName: 'evidence/iter-0001',
    });

    expect(iteration.description()).toMatchObject({
      lifecycle: 'active',
      version: 2,
      branchName: 'evidence/iter-0001',
    });
    expect(store.iteration.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        lifecycle: 'provisioning',
        version: 1,
        baseCommitSha,
      }),
      data: expect.objectContaining({
        lifecycle: 'active',
        branchName: 'evidence/iter-0001',
      }),
    });
  });

  it('preserves an explicit failure without releasing the Candidate claim', async () => {
    const store = mockPrismaStore();
    store.iteration.updateMany.mockResolvedValue({ count: 1 });
    store.iteration.findFirst.mockResolvedValue(
      iterationRow({
        lifecycle: 'provisioning_failed',
        version: 2,
        provisioningFailureSummary: 'Worktree exists.',
      }),
    );
    const iterations = new PrismaWorkspaceIterations(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const iteration = await iterations.failProvisioning('iteration-1', {
      expectedVersion: 1,
      reason: ' Worktree exists. ',
    });

    expect(iteration.description()).toMatchObject({
      lifecycle: 'provisioning_failed',
      provisioningFailureSummary: 'Worktree exists.',
    });
    expect(store.iteration.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'iteration-1',
        lifecycle: 'provisioning',
      }),
      data: expect.objectContaining({
        lifecycle: 'provisioning_failed',
        provisioningFailureSummary: 'Worktree exists.',
      }),
    });
  });
});
