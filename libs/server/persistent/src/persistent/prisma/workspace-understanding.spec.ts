import { describe, expect, it } from 'vitest';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceUnderstanding } from './workspace-understanding';

const contentSha256 = `sha256:${'a'.repeat(64)}`;

function iterationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'iteration-1',
    reference: 'ITER-0001',
    workspaceId: 'workspace-1',
    sourceCandidateId: 'candidate-1',
    sourceCandidateSha256: contentSha256,
    lifecycle: 'active',
    loop: 'understand',
    stage: 'tqa',
    lane: 'discovery',
    version: 3,
    baseCommitSha: 'b'.repeat(40),
    branchName: 'evidence/iter-iteration-1',
    provisioningFailureSummary: null,
    admittedByUserId: 'user-1',
    admittedAt: timestamp,
    updatedAt: timestamp,
    story: { id: 'story-1' },
    ...overrides,
  };
}

function revisionRow() {
  return {
    id: 'revision-1',
    storyId: 'story-1',
    revisionNumber: 1,
    title: 'Confirm the current model',
    problem: 'Collaborators cannot identify the current model.',
    role: 'Modeling lead',
    goal: 'Identify the confirmed model.',
    value: 'Collaborators use one version.',
    cognitiveMode: 'complicated',
    contentSha256,
    createdByUserId: 'user-1',
    createdAt: timestamp,
    understandingDecisionId: null,
    citations: [],
    scenarios: [],
  };
}

function storyRow() {
  return {
    id: 'story-1',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    reference: 'US-001',
    latestRevisionId: 'revision-1',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestRevision: { ...revisionRow(), _count: { scenarios: 0 } },
    _count: { revisions: 1 },
  };
}

function clarificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clarification-1',
    reference: 'Q-001',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-1',
    sequence: 1,
    target: 'story',
    question: 'Which role receives the value?',
    status: 'pending',
    askedAt: timestamp,
    answer: null,
    answeredByUserId: null,
    answeredAt: null,
    waivedReason: null,
    waivedByUserId: null,
    waivedAt: null,
    contentSha256,
    ...overrides,
  };
}

function contextStore() {
  const store = mockPrismaStore();
  store.iteration.findFirst.mockResolvedValue(iterationRow());
  store.story.findFirst.mockResolvedValue(storyRow());
  store.storyRevision.findUnique.mockResolvedValue(revisionRow());
  store.iteration.updateMany.mockResolvedValue({ count: 1 });
  return store;
}

describe('PrismaWorkspaceUnderstanding', () => {
  it('records exactly one pending question for the active Story Revision', async () => {
    const store = contextStore();
    store.storyClarification.findFirst.mockResolvedValue(null);
    store.storyClarification.count.mockResolvedValue(0);
    store.storyClarification.create.mockImplementation(async ({ data }) => ({
      ...clarificationRow(),
      ...data,
    }));
    const understanding = new PrismaWorkspaceUnderstanding(
      asStore(store),
      'workspace-1',
    );

    const question = await understanding.askClarification('iteration-1', {
      expectedIterationVersion: 3,
      storyId: 'story-1',
      storyRevisionId: 'revision-1',
      target: 'story',
      question: 'Which role receives the value?',
    });

    expect(question.description()).toMatchObject({
      reference: 'Q-001',
      status: 'pending',
      storyRevision: expect.objectContaining({}),
    });
    expect(store.iteration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 3, stage: { in: ['tqa'] } }),
      }),
    );
  });

  it('routes only an explicit story-target answer back to Kickoff', async () => {
    const store = contextStore();
    store.storyClarification.findFirst.mockResolvedValue(clarificationRow());
    store.storyClarification.update.mockImplementation(async ({ data }) => ({
      ...clarificationRow(),
      ...data,
    }));
    store.iteration.findFirst
      .mockResolvedValueOnce(iterationRow())
      .mockResolvedValueOnce(
        iterationRow({
          loop: 'kickoff',
          stage: 'candidate_drafting',
          version: 4,
        }),
      );
    const understanding = new PrismaWorkspaceUnderstanding(
      asStore(store),
      'workspace-1',
    );

    const result = await understanding.answerClarification(
      'iteration-1',
      {
        expectedIterationVersion: 3,
        clarificationId: 'clarification-1',
        answer: 'The collaboration lead receives the value.',
      },
      'user-1',
    );

    expect(result.clarification.description()).toMatchObject({
      status: 'answered',
      answer: 'The collaboration lead receives the value.',
    });
    expect(store.iteration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loop: 'kickoff',
          stage: 'candidate_drafting',
        }),
      }),
    );
    expect(result.iteration.description().loop).toBe('kickoff');
  });
});
