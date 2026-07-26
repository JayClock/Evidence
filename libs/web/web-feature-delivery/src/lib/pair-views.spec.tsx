import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PairResource, State } from '@evidence/api-client';
import { PairDetailView } from './pair-views';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

afterEach(() => {
  delete window.evidenceDesktop;
});

describe('PairDetailView', () => {
  it('resumes automation only through the Desktop bridge', async () => {
    const refresh = vi.fn().mockResolvedValue(pairState(pairData('exception')));
    const resumePair = vi.fn(async (_request, onEvent) => {
      onEvent({
        requestId: 'pair:request',
        event: 'checkpoint',
        message: 'Pair reached red_observed.',
        checkpoint: 'red_observed',
      });
      return {} as never;
    });
    window.evidenceDesktop = { resumePair } as never;
    render(
      <PairDetailView
        resourceState={pairState(pairData('running'), { refresh })}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Resume approved Pair Plan' }),
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
    expect(await screen.findByText(/Human exception route/)).toBeTruthy();
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
    render(
      <PairDetailView
        resourceState={pairState(pairData('approval_required'), { refresh })}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Load complete local Story diff' }),
    );
    expect(await screen.findByText(/diff --git/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Approval reason'), {
      target: { value: 'Reviewed every changed file and bounded evidence.' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create local commit and approve Pair',
      }),
    );

    await waitFor(() =>
      expect(approvePair).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedManifestSha256: sha('m'),
          expectedDiffSha256: sha('d'),
          commitMessage: 'feat(desktop): implement us-001',
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Story-level coding approval' }),
      ).toBeNull(),
    );
  });

  it('keeps exception routing available in browser-only mode', async () => {
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(pairState(pairData('cancelled')));
    render(
      <PairDetailView
        resourceState={pairState(pairData('exception'), { post, refresh })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Decision reason'), {
      target: { value: 'Return to the approved TEST boundary.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back Test' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'back_test',
          reason: 'Return to the approved TEST boundary.',
        }),
      }),
    );
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
  const approval = status === 'approval_required' || status === 'approved';
  return {
    iteration: { id: 'iteration-1' },
    story: { id: 'story-1', reference: 'US-001' },
    storyRevision: { id: 'revision-2' },
    approvedPlan: { id: 'plan-1' },
    run: {
      id: 'pair-1',
      reference: 'PAIR-0001',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
      approvedTaskingPlanSha256: sha('p'),
      storyRevisionSha256: sha('s'),
      status,
      checkpoint:
        status === 'exception'
          ? 'exception'
          : approval
            ? status === 'approved'
              ? 'approved'
              : 'quality_gates_passed'
            : 'plan_confirmed',
      version: 4,
      completedTestIds: approval ? ['TEST-001'] : [],
      completedStepKeys: approval ? ['runtime:step'] : [],
      budgetUsage: { agentCalls: 3 },
      executionBudget: { maxAgentCalls: 8 },
      approvedCommitSha: status === 'approved' ? 'c'.repeat(40) : null,
    },
    driverAttempts: [],
    commandObservations: [],
    redReviews: [],
    currentException:
      status === 'exception'
        ? {
            id: 'exception-1',
            kind: 'green_failed',
            summary: 'The focused Green command failed.',
            allowedRoutes: ['back_test', 'cancel'],
          }
        : null,
    manifest: approval
      ? {
          id: 'manifest-1',
          contentSha256: sha('m'),
          finalDiffSha256: sha('d'),
          changedPaths: ['apps/desktop/src/pair.ts'],
          completedTestIds: ['TEST-001'],
          completedStepKeys: ['runtime:step'],
        }
      : null,
    decisions: [],
    nextAction:
      status === 'exception'
        ? {
            kind: 'resolve_exception',
            actionId: 'ACT-exception',
            expectedPairVersion: 4,
            exceptionId: 'exception-1',
            allowedRoutes: ['back_test', 'cancel'],
          }
        : status === 'approval_required'
          ? {
              kind: 'await_human',
              actionId: 'ACT-approval',
              expectedPairVersion: 4,
              manifestSha256: sha('m'),
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
    getLink: (relation: string) =>
      relation === 'self' || relation === 'decide'
        ? {
            href: `/api/workspaces/workspace-1/iterations/iteration-1/pair${relation === 'decide' ? '/decisions' : ''}`,
          }
        : undefined,
    follow: (relation: string) => ({
      refresh: relation === 'self' ? refresh : vi.fn(),
      post: relation === 'decide' ? post : vi.fn(),
    }),
  } as unknown as State<PairResource>;
}
