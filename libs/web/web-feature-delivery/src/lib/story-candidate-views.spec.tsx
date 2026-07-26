import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type {
  State,
  StoryCandidateCollectionResource,
  StoryCandidateResource,
} from '@evidence/api-client';
import {
  StoryCandidateCollectionView,
  StoryCandidateDetailView,
} from './story-candidate-views';

const revisionHash = `sha256:${'a'.repeat(64)}`;
const candidateHash = `sha256:${'b'.repeat(64)}`;

function candidateState({
  status = 'ready',
  actionPost,
  refresh,
}: {
  status?: StoryCandidateResource['data']['status'];
  actionPost?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
} = {}) {
  const data: StoryCandidateResource['data'] = {
    id: 'candidate-1',
    reference: 'CAND-0001',
    extractionId: 'extraction-1',
    title: 'Local coding agent',
    problem: 'Hosted services must not receive source code.',
    role: 'Workspace maintainer',
    goal: 'Run coding work locally.',
    value: 'Credentials remain local.',
    cognitiveMode: 'complicated',
    citations: [
      {
        _links: {},
        inboxItemId: 'item-1',
        inboxRevisionId: 'revision-1',
        revisionNumber: 1,
        revisionSha256: revisionHash,
        locator: 'whole-source',
      },
    ],
    contentSha256: candidateHash,
    status,
    proposedBy: 'inbox-analyst',
    proposedAt: '2026-07-24T10:00:00.000Z',
    terminalDecisionId: status === 'rejected' ? 'decision-1' : null,
    selectedIterationId: status === 'selected' ? 'iteration-1' : null,
  };
  const links: Record<string, { rel: string; href: string }> = {
    self: {
      rel: 'self',
      href: '/api/workspaces/workspace-1/story-candidates/candidate-1',
    },
    workspace: {
      rel: 'workspace',
      href: '/api/workspaces/workspace-1',
    },
  };
  if (status === 'ready' || status === 'stale') {
    links.defer = { rel: 'defer', href: `${links.self.href}/defer` };
    links.reject = { rel: 'reject', href: `${links.self.href}/reject` };
  }
  if (status === 'ready') {
    links.select = { rel: 'select', href: `${links.self.href}/select` };
  }
  if (status === 'selected') {
    links.iteration = {
      rel: 'iteration',
      href: '/api/workspaces/workspace-1/iterations/iteration-1',
    };
  }
  return {
    data,
    getLink: (relation: string) => links[relation],
    follow: (relation: string) => {
      if (relation === 'self') return { refresh };
      if (relation === 'defer' || relation === 'reject') {
        return { post: actionPost };
      }
      throw new Error(`Unexpected relation: ${relation}`);
    },
  } as unknown as State<StoryCandidateResource>;
}

function collectionState(items = [candidateState()]) {
  return {
    data: {
      page: {
        number: 1,
        size: 20,
        totalElements: items.length,
        totalPages: items.length === 0 ? 0 : 1,
      },
    },
    collection: items,
    getLink: () => undefined,
  } as unknown as State<StoryCandidateCollectionResource>;
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

afterEach(() => {
  delete window.evidenceDesktop;
});

describe('Story Candidate views', () => {
  it('renders source-cited Candidate authority and status', () => {
    render(
      <MemoryRouter>
        <StoryCandidateCollectionView resourceState={collectionState()} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Story Candidates' }),
    ).toBeTruthy();
    expect(screen.getByText('CAND-0001')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Review' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/story-candidates/candidate-1');
  });

  it('records terminal rejection with exact Candidate hash and reason', async () => {
    const rejected = candidateState({ status: 'rejected' });
    const post = vi.fn().mockResolvedValue(rejected);
    const state = candidateState({ actionPost: post });

    render(
      <MemoryRouter>
        <StoryCandidateDetailView resourceState={state} />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('button', { name: /Confirm as Story/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Outside the current product boundary.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record reject' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          candidateSha256: candidateHash,
          reason: 'Outside the current product boundary.',
        },
      }),
    );
    expect(await screen.findByText('Rejected')).toBeTruthy();
  });

  it('delegates selection and worktree provisioning to Desktop', async () => {
    const selected = candidateState({ status: 'selected' });
    const refresh = vi.fn().mockResolvedValue(selected);
    const state = candidateState({ refresh });
    const startIteration = vi.fn().mockResolvedValue({
      iterationId: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      branchName: 'evidence/iter-iteration-1',
      baseCommitSha: 'c'.repeat(40),
    });
    window.evidenceDesktop = { startIteration } as never;

    render(
      <MemoryRouter initialEntries={['/candidate']}>
        <StoryCandidateDetailView resourceState={state} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select and start Iteration' }),
    );

    await waitFor(() =>
      expect(startIteration).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          candidateId: 'candidate-1',
        }),
      ),
    );
    expect(refresh).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/api/workspaces/workspace-1/iterations/iteration-1',
      ),
    );
  });
});
