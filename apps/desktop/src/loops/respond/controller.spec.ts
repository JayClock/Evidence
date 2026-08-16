import { describe, expect, it, vi } from 'vitest';
import type {
  RespondResourceData,
  ShowcaseResourceData,
} from '@evidence/api-client';
import type { RemoteRespond } from './api-client';
import type { RemoteShowcase } from '../showcase/public';
import { RespondController } from './controller';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

describe('RespondController', () => {
  it('runs one read-only Learner and posts its bounded Candidate', async () => {
    const context = fixture();

    const summary = await context.controller.runLearner({
      id: 'respond-request-1',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    });

    expect(context.learner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'respond:iteration-1:30',
        authoritySha256: sha('a'),
        approvedCommitSha: 'c'.repeat(40),
        changedPaths: ['libs/server-java/domain/src/main/java/Respond.java'],
      }),
      expect.any(Function),
    );
    expect(context.respond.proposeCandidate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionId: 'respond:iteration-1:30',
        expectedIterationVersion: 30,
        authoritySha256: sha('a'),
        promotions: [],
        noPromotionReason: 'No reusable knowledge was validated.',
      }),
      expect.any(AbortSignal),
    );
    expect(summary).toEqual(
      expect.objectContaining({
        stage: 'decision',
        nextAction: 'await_human',
        candidateId: 'respond-candidate-1',
      }),
    );
  });

  it('rejects a Learner that changes the approved worktree', async () => {
    const context = fixture();
    context.worktrees.snapshotApproved
      .mockResolvedValueOnce({ worktreeSha256: sha('1') })
      .mockResolvedValueOnce({ worktreeSha256: sha('2') });

    await expect(
      context.controller.runLearner({
        id: 'respond-request-1',
        workspaceId: 'workspace-1',
        iterationId: 'iteration-1',
      }),
    ).rejects.toThrow('changed the approved worktree');

    expect(context.respond.proposeCandidate).not.toHaveBeenCalled();
  });

  it('rejects mismatched Showcase and Respond authority before starting Pi', async () => {
    const context = fixture();
    context.showcase.getShowcase.mockResolvedValueOnce({
      ...showcaseResource(),
      data: {
        ...showcaseResource().data,
        run: { ...showcaseResource().data.run, id: 'showcase-other' },
      },
    });

    await expect(
      context.controller.runLearner({
        id: 'respond-request-1',
        workspaceId: 'workspace-1',
        iterationId: 'iteration-1',
      }),
    ).rejects.toThrow('authority do not match');

    expect(context.learner.run).not.toHaveBeenCalled();
  });
});

function fixture() {
  const initial = respondResource('drafting');
  const proposed = respondResource('decision');
  const respond = {
    getRespond: vi.fn().mockResolvedValue(initial),
    proposeCandidate: vi.fn().mockResolvedValue(proposed),
  };
  const showcase = {
    getShowcase: vi.fn().mockResolvedValue(showcaseResource()),
  };
  const worktrees = {
    locate: vi.fn().mockReturnValue({
      iterationId: 'iteration-1',
      repositoryRoot: '/repo',
      worktreeRoot: '/worktree',
      branchName: 'evidence/iter-iteration-1',
      baseCommitSha: 'b'.repeat(40),
    }),
    recover: vi.fn().mockResolvedValue(undefined),
    snapshotApproved: vi.fn().mockResolvedValue({ worktreeSha256: sha('w') }),
  };
  const learner = {
    run: vi.fn(async (_request, onEvent) => {
      onEvent({
        id: 'respond:iteration-1:30',
        event: 'complete',
        data: '',
        details: {
          promotions: [],
          noPromotionReason: 'No reusable knowledge was validated.',
          observedOutcomes: ['The Story value was accepted.'],
          residualRisks: [],
          nextProbe: {
            question: 'Which risk should be learned next?',
            whyNow: 'One bounded risk remains.',
            evidenceRefs: ['showcase:risk-Q4'],
            firstAction: 'A human decides whether to capture it.',
          },
          agentCallCount: 1,
        },
      });
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return {
    respond,
    showcase,
    worktrees,
    learner,
    controller: new RespondController({
      apiBaseUrl: 'https://api.example.test/api',
      bindings: {
        find: vi.fn().mockResolvedValue({ repositoryRoot: '/repo' }),
      },
      worktrees: worktrees as never,
      respond: respond as never,
      showcase: showcase as never,
      learner: learner as never,
    }),
  };
}

function respondResource(stage: 'drafting' | 'decision'): RemoteRespond {
  const action =
    stage === 'drafting'
      ? {
          kind: 'run_learner' as const,
          actionId: 'respond:iteration-1:30',
          expectedIterationVersion: 30,
          authoritySha256: sha('a'),
          showcaseRunId: 'showcase-1',
          showcaseDecisionId: 'showcase-decision-1',
        }
      : {
          kind: 'await_human' as const,
          actionId: 'respond-decision:respond-candidate-1:31',
          expectedIterationVersion: 31,
          authoritySha256: sha('a'),
          candidateId: 'respond-candidate-1',
          candidateSha256: sha('k'),
        };
  const data = {
    iteration: {
      id: 'iteration-1',
      stage,
      version: stage === 'drafting' ? 30 : 31,
    },
    storyRevision: { id: 'revision-1', title: 'Accepted Story' },
    authority: {
      authoritySha256: sha('a'),
      approvedCommitSha: 'c'.repeat(40),
    },
    candidates: stage === 'decision' ? [{ id: 'respond-candidate-1' }] : [],
    decisions: [],
    nextAction: action,
  } as unknown as RespondResourceData;
  return { data, links: {}, raw: data as unknown as Record<string, unknown> };
}

function showcaseResource(): RemoteShowcase {
  const data = {
    iteration: { id: 'iteration-1' },
    run: {
      id: 'showcase-1',
      stage: 'accepted',
      approvedCommitSha: 'c'.repeat(40),
    },
    pairRun: {
      baseCommitSha: 'b'.repeat(40),
      branchName: 'evidence/iter-iteration-1',
    },
    pairManifest: {
      changedPaths: ['libs/server-java/domain/src/main/java/Respond.java'],
    },
  } as unknown as ShowcaseResourceData;
  return { data, links: {}, raw: data as unknown as Record<string, unknown> };
}
