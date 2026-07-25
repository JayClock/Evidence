import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  CodingRunCollectionResource,
  CodingRunResource,
  State,
} from '@evidence/api-client';
import {
  CodingRunCollectionView,
  CodingRunDetailView,
} from './coding-run-views';

const diffSha256 = `sha256:${'a'.repeat(64)}`;

function runState(status: 'running' | 'review_required' = 'review_required') {
  return {
    data: {
      id: 'run-1',
      storyId: 'story-1',
      storyRevisionId: 'revision-2',
      requestedByUserId: 'user-1',
      status,
      version: status === 'running' ? 1 : 2,
      baseCommitSha: 'b'.repeat(40),
      diffSha256: status === 'running' ? null : diffSha256,
      changedFileCount: status === 'running' ? null : 2,
      qualityChecks:
        status === 'running'
          ? []
          : [
              {
                name: 'pnpm test',
                status: 'passed' as const,
                durationMs: 1200,
                summary: 'Gate passed.',
              },
            ],
      commitSha: null,
      failureCode: null,
      failureSummary: null,
      decisionReason: null,
      startedAt: '2026-07-24T00:00:00.000Z',
      executionFinishedAt:
        status === 'running' ? null : '2026-07-24T00:01:00.000Z',
      decidedByUserId: null,
      decidedAt: null,
    },
    getLink: (relation: string) =>
      relation === 'self'
        ? {
            rel: 'self',
            href: '/api/workspaces/workspace-1/coding-runs/run-1',
          }
        : undefined,
  } as unknown as State<CodingRunResource>;
}

describe('Coding Run views', () => {
  afterEach(() => {
    delete window.evidenceDesktop;
  });

  it('renders persisted Coding Run status and quality facts', () => {
    const collection = {
      data: {
        page: { number: 1, size: 20, totalElements: 1, totalPages: 1 },
      },
      collection: [runState()],
      getLink: () => undefined,
    } as unknown as State<CodingRunCollectionResource>;

    render(
      <MemoryRouter>
        <CodingRunCollectionView resourceState={collection} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Coding Runs' })).toBeTruthy();
    expect(screen.getByText('Review Required')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/coding-runs/run-1');
  });

  it('reports a local diff recovery failure', async () => {
    window.evidenceDesktop = {
      getApiBaseUrl: vi.fn(async () => '/api'),
      chooseRepository: vi.fn(async () => null),
      bindWorkspace: vi.fn(async () => undefined),
      runDiagramAgent: vi.fn(async () => undefined),
      cancelDiagramAgent: vi.fn(async () => undefined),
      runCodingAgent: vi.fn(async () => undefined),
      cancelCodingAgent: vi.fn(async () => undefined),
      getCodingReview: vi.fn(async () => {
        throw new Error('The stored diff no longer matches its worktree.');
      }),
      acceptCodingRun: vi.fn(async () => ({ status: 'accepted' })),
      rejectCodingRun: vi.fn(async () => ({ status: 'rejected' })),
    };

    render(
      <MemoryRouter>
        <CodingRunDetailView resourceState={runState()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load local diff' }));

    expect(
      await screen.findByText(
        'The stored diff no longer matches its worktree.',
      ),
    ).toBeTruthy();
  });

  it('loads the full diff locally and commits only after acceptance', async () => {
    const acceptCodingRun = vi.fn(async () => ({ status: 'accepted' }));
    window.evidenceDesktop = {
      getApiBaseUrl: vi.fn(async () => '/api'),
      chooseRepository: vi.fn(async () => null),
      bindWorkspace: vi.fn(async () => undefined),
      runDiagramAgent: vi.fn(async () => undefined),
      cancelDiagramAgent: vi.fn(async () => undefined),
      runCodingAgent: vi.fn(async () => undefined),
      cancelCodingAgent: vi.fn(async () => undefined),
      getCodingReview: vi.fn(async () => ({
        run: { id: 'run-1' },
        diff: 'diff --git a/file.ts b/file.ts',
        diffSha256,
        changedFileCount: 1,
      })),
      acceptCodingRun,
      rejectCodingRun: vi.fn(async () => ({ status: 'rejected' })),
    };

    render(
      <MemoryRouter>
        <CodingRunDetailView resourceState={runState()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load local diff' }));
    expect(
      await screen.findByRole('heading', { name: 'Local diff review' }),
    ).toBeTruthy();
    expect(screen.getByText(/diff --git a\/file.ts/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Accept and commit locally' }),
    );
    await waitFor(() => {
      expect(acceptCodingRun).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        runId: 'run-1',
        diffSha256,
      });
    });
  });
});
