import { describe, expect, it } from 'vitest';
import type { InboxStoryCandidateInput } from '@evidence/server-domain';
import { hashKickoffProposal } from '../workflow-content';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceKickoff } from './workspace-kickoff';

const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const baseCommitSha = 'b'.repeat(40);
const proposalInput: InboxStoryCandidateInput = {
  title: 'One Kickoff Story',
  problem: 'The delivery boundary is not yet authoritative.',
  role: 'Workspace maintainer',
  goal: 'Confirm one frozen Story.',
  value: 'Understand starts from an auditable decision.',
  cognitiveMode: 'complicated',
  citations: [
    {
      inboxItemId: 'inbox-1',
      revisionSha256,
      locator: 'whole-source',
    },
  ],
};
const proposalSha256 = hashKickoffProposal({
  proposal: proposalInput,
  origin: 'inbox_candidate',
  sequence: 1,
}).contentSha256;

function storedCitation() {
  return {
    inboxItemId: 'inbox-1',
    inboxRevisionId: 'revision-1',
    revisionNumber: 2,
    revisionSha256,
    locator: 'whole-source',
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
    body: 'Frozen source body',
    contentType: 'text/plain',
    uri: null,
    providerMetadata: {},
    sourceUpdatedAt: null,
    capturedAt: timestamp.toISOString(),
    contentSha256: revisionSha256,
  };
}

function candidateSnapshot() {
  return {
    candidateId: 'candidate-1',
    candidateReference: 'CAND-0001',
    extractionId: 'extraction-1',
    ...proposalInput,
    citations: [storedCitation()],
    contentSha256: `sha256:${'c'.repeat(64)}`,
    proposedAt: timestamp.toISOString(),
  };
}

function intakeRow() {
  return {
    iterationId: 'iteration-1',
    candidateSnapshot: candidateSnapshot(),
    sourceSnapshots: [sourceSnapshot()],
    requirementsProjection: '# One Kickoff Story\n',
    contentSha256: `sha256:${'d'.repeat(64)}`,
    frozenAt: timestamp,
  };
}

function iterationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'iteration-1',
    reference: 'ITER-0001',
    workspaceId: 'workspace-1',
    sourceCandidateId: 'candidate-1',
    sourceCandidateSha256: `sha256:${'c'.repeat(64)}`,
    lifecycle: 'active',
    loop: 'kickoff',
    stage: 'candidate_review',
    lane: 'discovery',
    version: 2,
    baseCommitSha,
    branchName: 'evidence/iter-0001',
    provisioningFailureSummary: null,
    admittedByUserId: 'user-1',
    admittedAt: timestamp,
    updatedAt: timestamp,
    story: null,
    ...overrides,
  };
}

function proposalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proposal-1',
    reference: 'KICKOFF-0001',
    iterationId: 'iteration-1',
    sequence: 1,
    origin: 'inbox_candidate',
    ...proposalInput,
    citations: [storedCitation()],
    contentSha256: proposalSha256,
    proposedAt: timestamp,
    decision: null,
    ...overrides,
  };
}

function decisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'decision-1',
    reference: 'DECISION-0001',
    iterationId: 'iteration-1',
    proposalId: 'proposal-1',
    proposalSha256,
    action: 'revise',
    reason: 'Narrow the outcome.',
    decidedByUserId: 'user-1',
    decidedAt: timestamp,
    contentSha256: `sha256:${'e'.repeat(64)}`,
    ...overrides,
  };
}

function sequenceRow() {
  return {
    workspaceId: 'workspace-1',
    nextExtractionNumber: 2,
    nextCandidateNumber: 2,
    nextDecisionNumber: 2,
    nextIterationNumber: 2,
    nextKickoffNumber: 2,
    updatedAt: timestamp,
  };
}

function problemRow() {
  return {
    id: 'problem-1',
    storyId: 'story-1',
    iterationId: 'iteration-1',
    revisionNumber: 1,
    title: proposalInput.title,
    problem: proposalInput.problem,
    cognitiveMode: proposalInput.cognitiveMode,
    citations: [storedCitation()],
    contentSha256: `sha256:${'f'.repeat(64)}`,
    createdAt: timestamp,
  };
}

function cardRow() {
  return {
    id: 'card-1',
    storyId: 'story-1',
    iterationId: 'iteration-1',
    problemStatementId: 'problem-1',
    revisionNumber: 1,
    title: proposalInput.title,
    role: proposalInput.role,
    goal: proposalInput.goal,
    value: proposalInput.value,
    contentSha256: `sha256:${'1'.repeat(64)}`,
    createdAt: timestamp,
  };
}

describe('PrismaWorkspaceKickoff review', () => {
  it('projects the one undecided Proposal over immutable Intake', async () => {
    const store = mockPrismaStore();
    store.iteration.findFirst.mockResolvedValue(iterationRow());
    store.iterationIntake.findFirst.mockResolvedValue(intakeRow());
    store.kickoffProposal.findMany.mockResolvedValue([proposalRow()]);
    store.kickoffDecision.findMany.mockResolvedValue([]);
    const kickoff = new PrismaWorkspaceKickoff(asStore(store), 'workspace-1');

    const view = await kickoff.findKickoff('iteration-1');

    expect(view?.currentProposal?.description()).toMatchObject({
      reference: 'KICKOFF-0001',
      contentSha256: proposalSha256,
      origin: 'inbox_candidate',
    });
    expect(view?.intake.description().sources[0]).toMatchObject({
      body: 'Frozen source body',
      contentSha256: revisionSha256,
    });
  });

  it('records revise authority and returns to candidate drafting', async () => {
    const store = mockPrismaStore();
    store.iteration.findFirst
      .mockResolvedValueOnce(iterationRow())
      .mockResolvedValueOnce(
        iterationRow({ stage: 'candidate_drafting', version: 3 }),
      );
    store.kickoffProposal.findFirst.mockResolvedValue(proposalRow());
    store.workspaceSequence.upsert.mockResolvedValue(sequenceRow());
    store.kickoffDecision.create.mockResolvedValue(decisionRow());
    store.kickoffDecision.findFirst.mockResolvedValue(decisionRow());
    store.iteration.updateMany.mockResolvedValue({ count: 1 });
    const kickoff = new PrismaWorkspaceKickoff(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const result = await kickoff.decideKickoff(
      'iteration-1',
      {
        proposalId: 'proposal-1',
        proposalSha256,
        expectedIterationVersion: 2,
        action: 'revise',
        reason: ' Narrow the outcome. ',
      },
      'user-1',
    );

    expect(result.iteration.description()).toMatchObject({
      stage: 'candidate_drafting',
      version: 3,
      activeStory: null,
    });
    expect(result.decision.description()).toMatchObject({
      action: 'revise',
      reason: 'Narrow the outcome.',
    });
    expect(result.problemStatement).toBeNull();
    expect(result.storyCard).toBeNull();
    expect(store.story.create).not.toHaveBeenCalled();
  });

  it('accepts a replacement only from Frozen Intake evidence', async () => {
    const store = mockPrismaStore();
    store.iteration.findFirst.mockResolvedValue(
      iterationRow({ stage: 'candidate_drafting', version: 3 }),
    );
    store.iterationIntake.findFirst.mockResolvedValue(intakeRow());
    store.kickoffProposal.findFirst
      .mockResolvedValueOnce(proposalRow())
      .mockResolvedValueOnce(
        proposalRow({
          id: 'proposal-2',
          reference: 'KICKOFF-0002',
          sequence: 2,
          origin: 'requirements_analyst',
        }),
      );
    store.workspaceSequence.upsert.mockResolvedValue(sequenceRow());
    store.iteration.updateMany.mockResolvedValue({ count: 1 });
    const kickoff = new PrismaWorkspaceKickoff(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const replacement = await kickoff.proposeKickoffReplacement(
      'iteration-1',
      3,
      { ...proposalInput, title: 'Narrower Story' },
    );

    expect(replacement.description()).toMatchObject({
      sequence: 2,
      origin: 'requirements_analyst',
    });
    expect(store.kickoffProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sequence: 2,
        origin: 'requirements_analyst',
        citations: [expect.objectContaining({ inboxRevisionId: 'revision-1' })],
      }),
    });

    const outsideStore = mockPrismaStore();
    outsideStore.iteration.findFirst.mockResolvedValue(
      iterationRow({ stage: 'candidate_drafting', version: 3 }),
    );
    outsideStore.iterationIntake.findFirst.mockResolvedValue(intakeRow());
    const outside = new PrismaWorkspaceKickoff(
      asStore(outsideStore),
      'workspace-1',
    );
    await expect(
      outside.proposeKickoffReplacement('iteration-1', 3, {
        ...proposalInput,
        citations: [
          {
            inboxItemId: 'inbox-2',
            revisionSha256,
            locator: 'whole-source',
          },
        ],
      }),
    ).rejects.toThrow('outside Frozen Intake');
  });

  it('creates Story authority and a non-codable baseline Revision only on human confirm', async () => {
    const store = mockPrismaStore();
    store.iteration.findFirst
      .mockResolvedValueOnce(iterationRow())
      .mockResolvedValueOnce(
        iterationRow({
          loop: 'understand',
          stage: 'tqa',
          version: 3,
          story: { id: 'story-1' },
        }),
      );
    store.kickoffProposal.findFirst.mockResolvedValue(proposalRow());
    store.workspaceSequence.upsert.mockResolvedValue(sequenceRow());
    store.iteration.updateMany.mockResolvedValue({ count: 1 });
    store.kickoffDecision.findFirst.mockResolvedValue(
      decisionRow({ action: 'confirm', reason: null }),
    );
    store.problemStatementRevision.findFirst.mockResolvedValue(problemRow());
    store.storyCardRevision.findFirst.mockResolvedValue(cardRow());
    const kickoff = new PrismaWorkspaceKickoff(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const result = await kickoff.decideKickoff(
      'iteration-1',
      {
        proposalId: 'proposal-1',
        proposalSha256,
        expectedIterationVersion: 2,
        action: 'confirm',
      },
      'user-1',
    );

    expect(result.iteration.description()).toMatchObject({
      loop: 'understand',
      stage: 'tqa',
      activeStory: expect.objectContaining({}),
    });
    expect(result.problemStatement?.description()).toMatchObject({
      problem: proposalInput.problem,
      revisionNumber: 1,
    });
    expect(result.storyCard?.description()).toMatchObject({
      reference: 'US-001',
      role: proposalInput.role,
      goal: proposalInput.goal,
      value: proposalInput.value,
    });
    expect(store.story.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        iterationId: 'iteration-1',
        reference: 'US-001',
        latestRevisionId: null,
      }),
    });
    expect(store.storyRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storyId: expect.any(String),
        revisionNumber: 1,
        sourceCandidateId: null,
        createdByUserId: 'user-1',
      }),
    });
    expect(store.storyRevisionCitation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inboxRevisionId: 'revision-1',
          position: 0,
        }),
      ],
    });
    expect(store.story.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: { latestRevisionId: expect.any(String) },
    });
    expect(store.storyScenario.createMany).not.toHaveBeenCalled();
    expect(store.problemStatementRevision.create).toHaveBeenCalledTimes(1);
    expect(store.storyCardRevision.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a second Story for the same Iteration', async () => {
    const store = mockPrismaStore();
    store.iteration.findFirst.mockResolvedValue(
      iterationRow({ story: { id: 'story-existing' } }),
    );
    store.kickoffProposal.findFirst.mockResolvedValue(proposalRow());
    store.workspaceSequence.upsert.mockResolvedValue(sequenceRow());
    const kickoff = new PrismaWorkspaceKickoff(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    await expect(
      kickoff.decideKickoff(
        'iteration-1',
        {
          proposalId: 'proposal-1',
          proposalSha256,
          expectedIterationVersion: 2,
          action: 'confirm',
        },
        'user-1',
      ),
    ).rejects.toThrow('cannot create more than one Story');
    expect(store.story.create).not.toHaveBeenCalled();
  });
});
