import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  RespondResource,
  RespondResourceData,
  State,
} from '@evidence/api-client';
import { RespondDetailView } from './respond-views';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

afterEach(() => {
  delete window.evidenceDesktop;
  vi.restoreAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

describe('RespondDetailView', () => {
  it('runs the Learner only through Desktop', () => {
    render(
      <RespondDetailView
        resourceState={respondState(respondData('drafting'))}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: '运行 Respond Learner' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByText('请在 Evidence Desktop 中运行本地 Learner。'),
    ).toBeTruthy();
  });

  it('refreshes after the local read-only Learner proposes a Candidate', async () => {
    const runRespondLearner = vi.fn().mockResolvedValue({});
    window.evidenceDesktop = { runRespondLearner } as never;
    const refresh = vi
      .fn()
      .mockResolvedValue(respondState(respondData('decision')));
    render(
      <RespondDetailView
        resourceState={respondState(respondData('drafting'), { refresh })}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: '运行 Respond Learner' }),
    );

    await waitFor(() =>
      expect(runRespondLearner).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          iterationId: 'iteration-1',
        }),
        expect.any(Function),
      ),
    );
    expect(await screen.findByText('RESP-0001')).toBeTruthy();
  });

  it('requires explicit human confirmation of the exact Candidate', async () => {
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi
      .fn()
      .mockResolvedValue(respondState(respondData('accepted')));
    render(
      <RespondDetailView
        resourceState={respondState(respondData('decision'), { post, refresh })}
      />,
    );

    fireEvent.change(screen.getByLabelText('决定理由'), {
      target: { value: '已审查空 promotion 理由与具体 next Probe。' },
    });
    expect(
      screen
        .getByRole('button', { name: '确认 approve' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(
      screen.getByLabelText('我已审查精确 Candidate 与 next Probe'),
    );
    fireEvent.click(screen.getByRole('button', { name: '确认 approve' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          expectedIterationVersion: 31,
          candidateId: 'respond-candidate-1',
          candidateSha256: sha('k'),
          authoritySha256: sha('a'),
          action: 'approve',
          reason: '已审查空 promotion 理由与具体 next Probe。',
        },
      }),
    );
    expect(
      await screen.findByText('Iteration learning boundary 已完成'),
    ).toBeTruthy();
  });
});

function respondState(
  data: RespondResourceData,
  operations: {
    refresh?: ReturnType<typeof vi.fn>;
    post?: ReturnType<typeof vi.fn>;
  } = {},
): State<RespondResource> {
  const refresh = operations.refresh ?? vi.fn().mockResolvedValue(undefined);
  const post = operations.post ?? vi.fn().mockResolvedValue(undefined);
  return {
    data,
    getLink: (relation: string) =>
      relation === 'iteration'
        ? { href: '/api/workspaces/workspace-1/iterations/iteration-1' }
        : { href: `/api/respond/${relation}` },
    follow: (relation: string) => ({
      refresh,
      post: relation === 'decide' ? post : vi.fn(),
    }),
  } as unknown as State<RespondResource>;
}

function respondData(
  stage: 'drafting' | 'decision' | 'accepted',
): RespondResourceData {
  const candidate = {
    id: 'respond-candidate-1',
    reference: 'RESP-0001',
    sequence: 1,
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-1',
    showcaseRunId: 'showcase-1',
    showcaseDecisionId: 'showcase-decision-1',
    authority: authority(),
    promotions: [],
    noPromotionReason: '本轮没有可复用知识需要提升。',
    observedOutcomes: ['领域专家确认 Story 价值。'],
    residualRisks: [],
    nextProbe: {
      question: '下一轮应学习哪一个产品风险？',
      whyNow: '本轮留下一个非阻塞风险。',
      evidenceRefs: ['showcase:risk-Q4'],
      firstAction: '由人决定是否收集进 Inbox。',
    },
    proposedAt: '2026-08-04T00:00:00.000Z',
    contentSha256: sha('k'),
  };
  return {
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      loop: 'respond',
      stage,
      version: stage === 'drafting' ? 30 : stage === 'decision' ? 31 : 32,
    } as never,
    story: { id: 'story-1', reference: 'US-001' } as never,
    storyRevision: { id: 'revision-1', title: 'Accepted Story' } as never,
    showcaseRun: {} as never,
    showcaseDecision: {} as never,
    authority: authority(),
    candidates: stage === 'drafting' ? [] : [candidate],
    decisions:
      stage === 'accepted'
        ? [
            {
              id: 'respond-decision-1',
              candidateId: candidate.id,
              action: 'approve',
              reason: 'Accepted.',
              candidateSha256: sha('k'),
              authoritySha256: sha('a'),
              decidedByUserId: 'user-1',
              decidedAt: '2026-08-04T00:01:00.000Z',
              contentSha256: sha('d'),
            },
          ]
        : [],
    nextAction:
      stage === 'drafting'
        ? {
            kind: 'run_learner',
            actionId: 'respond:iteration-1:30',
            expectedIterationVersion: 30,
            authoritySha256: sha('a'),
            showcaseRunId: 'showcase-1',
            showcaseDecisionId: 'showcase-decision-1',
          }
        : stage === 'decision'
          ? {
              kind: 'await_human',
              actionId: 'respond-decision:respond-candidate-1:31',
              expectedIterationVersion: 31,
              authoritySha256: sha('a'),
              candidateId: candidate.id,
              candidateSha256: sha('k'),
            }
          : null,
  };
}

function authority() {
  return {
    storyRevisionSha256: sha('s'),
    approvedTaskingPlanSha256: sha('p'),
    pairManifestSha256: sha('m'),
    approvedCommitSha: 'c'.repeat(40),
    showcaseEvidenceBundleSha256: sha('e'),
    showcaseReviewSha256: sha('r'),
    showcaseDecisionSha256: sha('d'),
    authoritySha256: sha('a'),
  };
}
