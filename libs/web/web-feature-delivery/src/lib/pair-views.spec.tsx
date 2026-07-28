import type { ReactNode } from 'react';
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
import { MemoryRouter } from 'react-router-dom';
import type { PairResource, State } from '@evidence/api-client';
import { PairDetailView } from './pair-views';

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
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('PairDetailView', () => {
  it('resumes automation only through the Desktop bridge', async () => {
    const refresh = vi.fn().mockResolvedValue(pairState(pairData('exception')));
    const resumePair = vi.fn(async (_request, onEvent) => {
      onEvent({
        requestId: 'pair:request',
        event: 'checkpoint',
        message: 'Pair reached exception.',
        checkpoint: 'exception',
      });
      return {} as never;
    });
    window.evidenceDesktop = { resumePair } as never;

    renderPair(
      <PairDetailView
        resourceState={pairState(pairData('running'), { refresh })}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: '继续 Approved Pair Plan' }),
    );

    await waitFor(() =>
      expect(resumePair).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          iterationId: 'iteration-1',
        }),
        expect.any(Function),
      ),
    );
    expect((await screen.findAllByText('Green 失败')).length).toBeGreaterThan(
      0,
    );
  });

  it('loads the complete local diff before creating the approved commit', async () => {
    const approved = pairState(pairData('approved'));
    const refresh = vi.fn().mockResolvedValue(approved);
    const reviewPair = vi.fn().mockResolvedValue({
      manifestSha256: sha('m'),
      diffSha256: sha('d'),
      changedFileCount: 1,
      changedPaths: ['apps/desktop/src/pair.ts'],
      diff: 'diff --git a/apps/desktop/src/pair.ts b/apps/desktop/src/pair.ts',
    });
    const approvePair = vi.fn().mockResolvedValue({});
    window.evidenceDesktop = { reviewPair, approvePair } as never;

    renderPair(
      <PairDetailView
        resourceState={pairState(pairData('approval_required'), { refresh })}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: '加载并校验本地 Story Diff' }),
    );
    expect(await screen.findByText(/diff --git/)).toBeTruthy();
    expect(
      screen.getByRole('region', { name: '本地 Story Diff 审查' }),
    ).toBeTruthy();
    expect(screen.queryByText('SERVER 唯一 NEXT ACTION')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: '批准并创建本地 Commit' }),
    );
    fireEvent.change(screen.getByLabelText('编码审查决定理由'), {
      target: { value: '已逐文件审查本地 Diff 与全部 bounded evidence。' },
    });
    fireEvent.click(screen.getByLabelText(/我已审查完整本地 Story Diff/));
    fireEvent.click(
      screen.getByRole('button', { name: '创建本地 commit 并批准 Pair' }),
    );

    await waitFor(() =>
      expect(approvePair).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedManifestSha256: sha('m'),
          expectedDiffSha256: sha('d'),
          commitMessage: 'feat(desktop): implement us-001',
          reason: '已逐文件审查本地 Diff 与全部 bounded evidence。',
        }),
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'US-001 · Pair 已批准' }),
    ).toBeTruthy();
  });

  it('keeps exception routing available in browser-only mode', async () => {
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(pairState(pairData('cancelled')));

    renderPair(
      <PairDetailView
        resourceState={pairState(pairData('exception'), { post, refresh })}
      />,
    );

    fireEvent.change(screen.getByLabelText('决定理由'), {
      target: { value: '返回精确实现边界并保留旧证据。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '退回实现' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          expectedPairVersion: 4,
          action: 'back_implementation',
          reason: '返回精确实现边界并保留旧证据。',
          manifestSha256: null,
          diffSha256: null,
          commitSha: null,
        },
      }),
    );
  });

  it('supports every approval return route without requiring Desktop', async () => {
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(pairState(pairData('running')));

    renderPair(
      <PairDetailView
        resourceState={pairState(pairData('approval_required'), {
          post,
          refresh,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '退回实现' }));
    fireEvent.change(screen.getByLabelText('决定理由'), {
      target: { value: '实现仍未满足确认的 Scenario。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认退回实现' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expectedPairVersion: 4,
          action: 'back_implementation',
          reason: '实现仍未满足确认的 Scenario。',
        }),
      }),
    );
    expect(
      await screen.findByRole('button', { name: '继续 Approved Pair Plan' }),
    ).toBeTruthy();
  });
});

function pairData(
  status:
    | 'running'
    | 'exception'
    | 'approval_required'
    | 'approved'
    | 'cancelled',
): PairResource['data'] {
  const manifestAvailable =
    status === 'approval_required' || status === 'approved';
  const checkpoint =
    status === 'exception'
      ? 'exception'
      : status === 'approval_required'
        ? 'quality_gates_passed'
        : status === 'approved'
          ? 'approved'
          : 'plan_confirmed';
  return {
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: status === 'cancelled' ? 'halted' : 'active',
      loop: 'pair',
      stage: checkpoint,
      version: 12,
    },
    story: { id: 'story-1', reference: 'US-001' },
    storyRevision: {
      id: 'revision-2',
      revisionNumber: 2,
      contentSha256: sha('s'),
    },
    approvedPlan: { id: 'plan-1', contentSha256: sha('p') },
    run: {
      id: 'pair-1',
      reference: 'PAIR-0001',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
      storyId: 'story-1',
      storyRevisionId: 'revision-2',
      storyRevisionSha256: sha('s'),
      approvedTaskingPlanId: 'plan-1',
      approvedTaskingPlanSha256: sha('p'),
      baseCommitSha: 'b'.repeat(40),
      branchName: 'evidence/iter-0001',
      status,
      checkpoint,
      version: 4,
      cursor: {
        unitIndex: 0,
        pendingRefactorStepKey: null,
        refactorVerificationIndex: 0,
        qualityGateIndex: 0,
        repairMode: null,
        repairDiagnosticObservationId: null,
        repairDecisionId: null,
        repairInstruction: null,
      },
      completedTestIds: manifestAvailable ? ['TEST-001'] : [],
      completedStepKeys: manifestAvailable ? ['runtime:step'] : [],
      budgetUsage: {
        agentCalls: 3,
        checkpoints: manifestAvailable ? 8 : 1,
        repeatedFingerprintCount: 0,
        noProgressCheckpoints: 0,
      },
      executionBudget: {
        policyId: 'pair-default',
        policyVersion: 2,
        policySha256: sha('e'),
        activityTimeoutMs: 3_600_000,
        commandTimeoutMs: 600_000,
        maxAgentCalls: 8,
        maxCheckpoints: 24,
        maxRetriesPerFingerprint: 2,
        maxNoProgressCheckpoints: 3,
      },
      leaseOwnerId: null,
      leaseExpiresAt: null,
      currentDiffSha256: manifestAvailable ? sha('d') : null,
      finalManifestSha256: manifestAvailable ? sha('m') : null,
      approvedCommitSha: status === 'approved' ? 'c'.repeat(40) : null,
      startedAt: '2026-07-24T12:00:00.000Z',
      updatedAt: '2026-07-24T12:30:00.000Z',
      completedAt:
        status === 'approved' || status === 'cancelled'
          ? '2026-07-24T12:30:00.000Z'
          : null,
    },
    driverAttempts: [],
    commandObservations: [],
    redReviews: [],
    currentException:
      status === 'exception'
        ? {
            id: 'exception-1',
            pairRunId: 'pair-1',
            actionId: 'ACT-exception',
            kind: 'green_failed',
            summary: '聚焦 Green 命令失败。',
            failureFingerprint: sha('f'),
            allowedRoutes: ['back_implementation', 'back_tasking', 'cancel'],
            raisedAt: '2026-07-24T12:20:00.000Z',
            resolvedAt: null,
            recordSha256: sha('x'),
          }
        : null,
    manifest: manifestAvailable
      ? {
          id: 'manifest-1',
          pairRunId: 'pair-1',
          approvedTaskingPlanSha256: sha('p'),
          storyRevisionSha256: sha('s'),
          baseCommitSha: 'b'.repeat(40),
          completedTestIds: ['TEST-001'],
          completedStepKeys: ['runtime:step'],
          driverAttemptIds: [],
          commandObservationIds: [],
          redReviewIds: [],
          changedPaths: ['apps/desktop/src/pair.ts'],
          finalDiffSha256: sha('d'),
          evidenceChainSha256: sha('h'),
          generatedAt: '2026-07-24T12:25:00.000Z',
          contentSha256: sha('m'),
        }
      : null,
    decisions:
      status === 'approved'
        ? [
            {
              id: 'decision-1',
              pairRunId: 'pair-1',
              action: 'approve',
              reason: '已审查完整本地 Story Diff。',
              manifestSha256: sha('m'),
              diffSha256: sha('d'),
              commitSha: 'c'.repeat(40),
              decidedByUserId: 'user-1',
              decidedAt: '2026-07-24T12:30:00.000Z',
              contentSha256: sha('z'),
            },
          ]
        : [],
    nextAction:
      status === 'exception'
        ? {
            kind: 'resolve_exception',
            actionId: 'ACT-exception',
            expectedPairVersion: 4,
            exceptionId: 'exception-1',
            allowedRoutes: ['back_implementation', 'back_tasking', 'cancel'],
          }
        : status === 'approval_required'
          ? {
              kind: 'await_human',
              actionId: 'ACT-approval',
              expectedPairVersion: 4,
              manifestSha256: sha('m'),
            }
          : status === 'running'
            ? {
                kind: 'run_driver',
                actionId: 'ACT-driver',
                expectedPairVersion: 4,
                role: 'production',
                mode: 'implement',
                workUnit: null,
                stepKey: null,
                allowedTestRoots: [],
                allowedProductionRoots: ['apps/desktop/src'],
                frozenTestPaths: [],
                diagnosticObservationId: null,
                repairDecisionId: null,
                repairInstruction: null,
              }
            : null,
  } as unknown as PairResource['data'];
}

function pairState(
  data: PairResource['data'],
  {
    post = vi.fn(),
    refresh = vi.fn(),
  }: {
    post?: ReturnType<typeof vi.fn>;
    refresh?: ReturnType<typeof vi.fn>;
  } = {},
): State<PairResource> {
  return {
    data,
    getLink: (relation: string) => {
      const links: Record<string, string> = {
        self: '/api/workspaces/workspace-1/iterations/iteration-1/pair',
        iteration: '/api/workspaces/workspace-1/iterations/iteration-1',
        story: '/api/workspaces/workspace-1/stories/story-1',
        tasking: '/api/workspaces/workspace-1/iterations/iteration-1/tasking',
        decide:
          '/api/workspaces/workspace-1/iterations/iteration-1/pair/decisions',
      };
      return links[relation] ? { href: links[relation] } : undefined;
    },
    follow: (relation: string) => ({
      refresh: relation === 'self' ? refresh : vi.fn(),
      post: relation === 'decide' ? post : vi.fn(),
    }),
  } as unknown as State<PairResource>;
}

function renderPair(view: ReactNode) {
  return render(<MemoryRouter>{view}</MemoryRouter>);
}
