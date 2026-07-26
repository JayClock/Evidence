import { describe, expect, it, vi } from 'vitest';
import {
  Iteration,
  IterationIntake,
  KickoffDecision,
  KickoffProposal,
  Ref,
  type Workspace,
  type WorkspaceIterations,
} from '@evidence/server-domain';
import { IterationsController } from './iterations.controller';
import type { ResourceResolver } from './resource-resolver.service';

const timestamp = '2026-01-01T00:00:00.000Z';
const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const candidateSha256 = `sha256:${'b'.repeat(64)}`;
const proposalSha256 = `sha256:${'c'.repeat(64)}`;
const baseCommitSha = 'd'.repeat(40);

function iteration(
  overrides: Partial<ReturnType<Iteration['description']>> = {},
) {
  return new Iteration('iteration-1', {
    reference: 'ITER-0001',
    workspace: new Ref('workspace-1'),
    sourceCandidate: new Ref('candidate-1'),
    sourceCandidateSha256: candidateSha256,
    lifecycle: 'active',
    loop: 'kickoff',
    stage: 'candidate_review',
    lane: 'discovery',
    version: 2,
    baseCommitSha,
    branchName: 'evidence/iter-0001',
    provisioningFailureSummary: null,
    activeStory: null,
    admittedBy: new Ref('user-1'),
    admittedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  });
}

function frozenCitation() {
  return {
    inboxItem: new Ref('inbox-1'),
    inboxRevision: new Ref('revision-1'),
    revisionNumber: 2,
    revisionSha256,
    locator: 'whole-source',
  };
}

function intake() {
  return new IterationIntake('iteration-1', {
    iteration: new Ref('iteration-1'),
    candidate: {
      candidateId: 'candidate-1',
      candidateReference: 'CAND-0001',
      extractionId: 'extraction-1',
      title: 'One Story',
      problem: 'The source needs a bounded outcome.',
      role: 'Workspace maintainer',
      goal: 'Start one iteration.',
      value: 'Delivery remains traceable.',
      cognitiveMode: 'complicated',
      citations: [frozenCitation()],
      contentSha256: candidateSha256,
      proposedAt: timestamp,
    },
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
    requirementsProjection: '# One Story\n',
    contentSha256: `sha256:${'e'.repeat(64)}`,
    frozenAt: timestamp,
  });
}

function proposal(
  origin: 'inbox_candidate' | 'requirements_analyst' = 'inbox_candidate',
) {
  return new KickoffProposal('proposal-1', {
    reference: 'KICKOFF-0001',
    iteration: new Ref('iteration-1'),
    sequence: 1,
    origin,
    title: 'One Story',
    problem: 'The source needs a bounded outcome.',
    role: 'Workspace maintainer',
    goal: 'Start one iteration.',
    value: 'Delivery remains traceable.',
    cognitiveMode: 'complicated',
    citations: [frozenCitation()],
    contentSha256: proposalSha256,
    proposedAt: timestamp,
  });
}

function decision() {
  return new KickoffDecision('decision-1', {
    reference: 'DECISION-0001',
    iteration: new Ref('iteration-1'),
    proposal: new Ref('proposal-1'),
    proposalSha256,
    action: 'revise',
    reason: 'Narrow it.',
    decidedBy: new Ref('user-1'),
    decidedAt: timestamp,
    contentSha256: `sha256:${'f'.repeat(64)}`,
  });
}

function fixture() {
  const iterations = {
    findIteration: vi.fn(async () => iteration()),
    findIntake: vi.fn(async () => intake()),
    completeProvisioning: vi.fn(async () => iteration()),
    failProvisioning: vi.fn(async () =>
      iteration({
        lifecycle: 'provisioning_failed',
        provisioningFailureSummary: 'Worktree exists.',
      }),
    ),
    findKickoff: vi.fn(async () => ({
      iteration: iteration(),
      intake: intake(),
      currentProposal: proposal(),
      decisions: [],
    })),
    proposeKickoffReplacement: vi.fn(async () =>
      proposal('requirements_analyst'),
    ),
    decideKickoff: vi.fn(async () => ({
      iteration: iteration({ stage: 'candidate_drafting', version: 3 }),
      decision: decision(),
      problemStatement: null,
      storyCard: null,
    })),
  } as unknown as WorkspaceIterations;
  const workspace = { iterations: () => iterations } as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    currentUserId: vi.fn(() => 'user-1'),
  } as unknown as ResourceResolver;
  return {
    controller: new IterationsController(resolver),
    iterations,
  };
}

describe('IterationsController', () => {
  it('returns a bounded Iteration and self-contained Frozen Intake', async () => {
    const { controller } = fixture();

    const iterationModel = await controller.getIteration(
      'workspace-1',
      'iteration-1',
    );
    const intakeModel = await controller.getIntake(
      'workspace-1',
      'iteration-1',
    );

    expect(iterationModel).toMatchObject({
      reference: 'ITER-0001',
      lifecycle: 'active',
      activeStoryId: null,
    });
    expect(intakeModel).toMatchObject({
      iterationId: 'iteration-1',
      candidate: expect.objectContaining({
        candidateReference: 'CAND-0001',
      }),
      sources: [
        expect.objectContaining({
          body: 'Exact source body',
          contentSha256: revisionSha256,
        }),
      ],
    });
  });

  it('records provisioning outcomes without accepting a local path', async () => {
    const { controller, iterations } = fixture();

    await controller.completeProvisioning('workspace-1', 'iteration-1', {
      expectedVersion: 1,
      baseCommitSha,
      branchName: 'evidence/iter-0001',
    });
    await controller.failProvisioning('workspace-1', 'iteration-2', {
      expectedVersion: 1,
      reason: ' Worktree exists. ',
    });

    expect(iterations.completeProvisioning).toHaveBeenCalledWith(
      'iteration-1',
      {
        expectedVersion: 1,
        baseCommitSha,
        branchName: 'evidence/iter-0001',
      },
    );
    expect(iterations.failProvisioning).toHaveBeenCalledWith('iteration-2', {
      expectedVersion: 1,
      reason: 'Worktree exists.',
    });
  });

  it('renders the current Kickoff Proposal and human decision link', async () => {
    const { controller } = fixture();

    const model = await controller.getKickoff('workspace-1', 'iteration-1');

    expect(model.currentProposal).toMatchObject({
      id: 'proposal-1',
      contentSha256: proposalSha256,
      _links: { decide: expect.any(Object) },
    });
    expect(model._links).toHaveProperty('decide');
  });

  it('accepts a structured replacement Proposal only through the drafting command', async () => {
    const { controller, iterations } = fixture();
    const response = { setHeader: vi.fn() };

    const model = await controller.proposeKickoffReplacement(
      'workspace-1',
      'iteration-1',
      {
        expectedIterationVersion: 3,
        proposal: {
          title: ' Narrow Story ',
          problem: 'Narrow the frozen problem.',
          role: 'Workspace maintainer',
          goal: 'Start one reviewable Story.',
          value: 'Delivery remains bounded.',
          cognitiveMode: 'clear',
          citations: [
            {
              inboxItemId: 'inbox-1',
              revisionSha256,
              locator: 'paragraph 2',
            },
          ],
        },
      },
      response,
    );

    expect(iterations.proposeKickoffReplacement).toHaveBeenCalledWith(
      'iteration-1',
      3,
      expect.objectContaining({ title: 'Narrow Story' }),
    );
    expect(model.origin).toBe('requirements_analyst');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/workspaces/workspace-1/iterations/iteration-1/kickoff/proposals/proposal-1',
    );
  });

  it('records one explicit human Kickoff decision', async () => {
    const { controller, iterations } = fixture();

    const model = await controller.decideKickoff('workspace-1', 'iteration-1', {
      proposalId: 'proposal-1',
      proposalSha256,
      expectedIterationVersion: 2,
      action: 'revise',
      reason: ' Narrow it. ',
    });

    expect(iterations.decideKickoff).toHaveBeenCalledWith(
      'iteration-1',
      {
        proposalId: 'proposal-1',
        proposalSha256,
        expectedIterationVersion: 2,
        action: 'revise',
        reason: ' Narrow it. ',
      },
      'user-1',
    );
    expect(model).toMatchObject({
      iteration: { stage: 'candidate_drafting', version: 3 },
      decision: { action: 'revise', reason: 'Narrow it.' },
      problemStatement: null,
      storyCard: null,
    });
  });
});
