import { describe, expect, it, vi } from 'vitest';
import {
  DeskCheckDecision,
  Iteration,
  NoModelImpactDecision,
  Ref,
  TaskingCandidate,
  type Workspace,
} from '@evidence/server-domain';
import type { ResourceResolver } from './resource-resolver.service';
import { TaskingController } from './tasking.controller';

const timestamp = '2026-08-01T00:00:00.000Z';
const sha256 = `sha256:${'a'.repeat(64)}`;

function noModelImpact() {
  return new NoModelImpactDecision('no-model-1', {
    reference: 'NMI-001',
    iteration: new Ref('iteration-1'),
    story: new Ref('story-1'),
    storyRevision: new Ref('revision-2'),
    storyRevisionSha256: sha256,
    subject: 'tool',
    method: 'none',
    modelChangeRequired: false,
    reason: 'This Story changes only local workflow glue.',
    decidedBy: new Ref('user-1'),
    decidedAt: timestamp,
    contentSha256: sha256,
  });
}

function candidate() {
  return new TaskingCandidate('tasking-1', {
    reference: 'TASKING-001',
    iteration: new Ref('iteration-1'),
    story: new Ref('story-1'),
    storyRevision: new Ref('revision-2'),
    storyRevisionSha256: sha256,
    baseCommitSha: 'b'.repeat(40),
    noModelImpactDecision: new Ref('no-model-1'),
    noModelImpactDecisionSha256: sha256,
    sequence: 1,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['test'],
        },
      ],
    },
    projectCatalogSha256: sha256,
    tests: [],
    tasks: [],
    processes: [],
    contentSha256: sha256,
    proposedBy: 'tasking-analyst',
    proposedAt: timestamp,
  });
}

function iteration() {
  return new Iteration('iteration-1', {
    workspace: new Ref('workspace-1'),
    reference: 'ITER-0001',
    sourceCandidate: new Ref('source-candidate-1'),
    sourceCandidateSha256: sha256,
    lifecycle: 'active',
    loop: 'tasking',
    stage: 'approved',
    lane: 'discovery',
    version: 6,
    baseCommitSha: 'b'.repeat(40),
    branchName: 'evidence/iter-iteration-1',
    provisioningFailureSummary: null,
    activeStory: new Ref('story-1'),
    admittedBy: new Ref('user-1'),
    admittedAt: timestamp,
    updatedAt: timestamp,
  });
}

function fixture() {
  const tasking = {
    findTasking: vi.fn(),
    recordNoModelImpact: vi.fn(async () => noModelImpact()),
    proposeTasking: vi.fn(async () => candidate()),
    decideTasking: vi.fn(async () => ({
      iteration: iteration(),
      decision: new DeskCheckDecision('decision-1', {
        reference: 'DC-001',
        iteration: new Ref('iteration-1'),
        candidate: new Ref('tasking-1'),
        candidateSha256: sha256,
        action: 'approve',
        reason: null,
        decidedBy: new Ref('user-1'),
        decidedAt: timestamp,
        contentSha256: sha256,
      }),
      approvedPlan: null,
    })),
  };
  const workspace = { tasking: () => tasking } as unknown as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    currentUserId: vi.fn(() => 'user-1'),
  } as unknown as ResourceResolver;
  return { controller: new TaskingController(resolver), tasking };
}

function proposalBody() {
  return {
    expectedIterationVersion: 4,
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    noModelImpactDecisionId: 'no-model-1',
    noModelImpactDecisionSha256: sha256,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['lint', 'test'],
        },
      ],
    },
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: 'typescript',
        functionalContexts: ['delivery'],
        technicalBoundaries: ['electron-main'],
        projectIds: ['@evidence/desktop'],
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'Drive one local boundary.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'electron-shell-q1',
        testFilter: 'tasking-shell',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: [],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive one test.',
        testIds: ['TEST-001'],
        dependsOn: [],
      },
    ],
  };
}

describe('TaskingController', () => {
  it('records only an explicit human No Model Impact command', async () => {
    const { controller, tasking } = fixture();

    const model = await controller.recordNoModelImpact(
      'workspace-1',
      'iteration-1',
      {
        expectedIterationVersion: 3,
        storyId: 'story-1',
        storyRevisionId: 'revision-2',
        storyRevisionSha256: sha256,
        reason: 'This Story changes only local workflow glue.',
      },
    );

    expect(model).toMatchObject({
      subject: 'tool',
      method: 'none',
      modelChangeRequired: false,
    });
    expect(tasking.recordNoModelImpact).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({ expectedIterationVersion: 3 }),
      'user-1',
    );
  });

  it('parses the bounded Tasking Candidate payload without repository data', async () => {
    const { controller, tasking } = fixture();

    await controller.proposeCandidate(
      'workspace-1',
      'iteration-1',
      proposalBody(),
    );

    expect(tasking.proposeTasking).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        projectCatalog: {
          projects: [expect.objectContaining({ root: 'apps/desktop' })],
        },
        runtimes: [expect.objectContaining({ runtime: 'typescript' })],
      }),
    );
  });

  it('records the current user as the Desk Check decision maker', async () => {
    const { controller, tasking } = fixture();

    const model = await controller.decide('workspace-1', 'iteration-1', {
      expectedIterationVersion: 5,
      candidateId: 'tasking-1',
      candidateSha256: sha256,
      action: 'approve',
    });

    expect(tasking.decideTasking).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({ action: 'approve', reason: null }),
      'user-1',
    );
    expect(model.iteration.stage).toBe('approved');
  });
});
