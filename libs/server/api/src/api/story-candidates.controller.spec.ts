import { describe, expect, it, vi } from 'vitest';
import {
  InboxCandidateDecision,
  InboxStoryCandidate,
  Iteration,
  Ref,
  type Workspace,
  type WorkspaceInboxWorkflow,
  type WorkspaceIterations,
} from '@evidence/server-domain';
import type { ResourceResolver } from './resource-resolver.service';
import { InboxStoryCandidatesController } from './story-candidates.controller';

const timestamp = '2026-01-01T00:00:00.000Z';
const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const candidateSha256 = `sha256:${'b'.repeat(64)}`;
const baseCommitSha = 'c'.repeat(40);

function candidate(status: 'ready' | 'stale' | 'deferred' = 'ready') {
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
    status,
    proposedBy: 'inbox-analyst',
    proposedAt: timestamp,
    terminalDecision: status === 'deferred' ? new Ref('decision-1') : null,
    selectedIteration: null,
  });
}

function decision() {
  return new InboxCandidateDecision('decision-1', {
    reference: 'DECISION-0001',
    workspace: new Ref('workspace-1'),
    candidate: new Ref('candidate-1'),
    candidateSha256,
    action: 'defer',
    reason: 'Not now.',
    decidedBy: new Ref('user-1'),
    decidedAt: timestamp,
    contentSha256: `sha256:${'d'.repeat(64)}`,
  });
}

function iteration() {
  return new Iteration('iteration-1', {
    reference: 'ITER-0001',
    workspace: new Ref('workspace-1'),
    sourceCandidate: new Ref('candidate-1'),
    sourceCandidateSha256: candidateSha256,
    lifecycle: 'provisioning',
    loop: 'kickoff',
    stage: 'candidate_review',
    lane: 'discovery',
    version: 1,
    baseCommitSha,
    branchName: null,
    provisioningFailureSummary: null,
    activeStory: null,
    admittedBy: new Ref('user-1'),
    admittedAt: timestamp,
    updatedAt: timestamp,
  });
}

function fixture() {
  const inboxWorkflow = {
    listCandidates: vi.fn(async () => [[candidate()], 1]),
    findCandidate: vi.fn(async () => candidate()),
    decideCandidate: vi.fn(async () => ({
      candidate: candidate('deferred'),
      decision: decision(),
    })),
  } as unknown as WorkspaceInboxWorkflow;
  const iterations = {
    selectCandidate: vi.fn(async () => ({
      iteration: iteration(),
      intake: {},
      proposal: {},
    })),
  } as unknown as WorkspaceIterations;
  const workspace = {
    inboxWorkflow: () => inboxWorkflow,
    iterations: () => iterations,
  } as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    currentUserId: vi.fn(() => 'user-1'),
  } as unknown as ResourceResolver;
  return {
    controller: new InboxStoryCandidatesController(resolver),
    inboxWorkflow,
    iterations,
  };
}

describe('InboxStoryCandidatesController', () => {
  it('lists only the requested derived Candidate status', async () => {
    const { controller, inboxWorkflow } = fixture();

    const collection = await controller.listCandidates(
      'workspace-1',
      '1',
      '20',
      'ready',
    );

    expect(inboxWorkflow.listCandidates).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'ready',
    });
    expect(collection._embedded.storyCandidates[0]).toMatchObject({
      status: 'ready',
      _links: {
        defer: expect.any(Object),
        reject: expect.any(Object),
        select: expect.any(Object),
      },
    });
  });

  it('requires a reason and exact hash for terminal human decisions', async () => {
    const { controller, inboxWorkflow } = fixture();

    const result = await controller.deferCandidate(
      'workspace-1',
      'candidate-1',
      { candidateSha256, reason: ' Not now. ' },
    );

    expect(inboxWorkflow.decideCandidate).toHaveBeenCalledWith(
      'candidate-1',
      candidateSha256,
      'defer',
      'Not now.',
      'user-1',
    );
    expect(result).toMatchObject({
      status: 'deferred',
      terminalDecisionId: 'decision-1',
    });
    expect(result._links).not.toHaveProperty('select');
  });

  it('selects a ready Candidate without creating a Story', async () => {
    const { controller, iterations } = fixture();
    const response = { setHeader: vi.fn() };

    const result = await controller.selectCandidate(
      'workspace-1',
      'candidate-1',
      { candidateSha256, baseCommitSha },
      response,
    );

    expect(iterations.selectCandidate).toHaveBeenCalledWith(
      { candidateId: 'candidate-1', candidateSha256, baseCommitSha },
      'user-1',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/workspaces/workspace-1/iterations/iteration-1',
    );
    expect(result).toMatchObject({
      id: 'iteration-1',
      lifecycle: 'provisioning',
      activeStoryId: null,
    });
  });

  it('rejects the retired confirmed status', async () => {
    const { controller, inboxWorkflow } = fixture();

    await expect(
      controller.listCandidates('workspace-1', '1', '20', 'confirmed'),
    ).rejects.toThrow('unsupported Inbox Candidate status');
    expect(inboxWorkflow.listCandidates).not.toHaveBeenCalled();
  });
});
