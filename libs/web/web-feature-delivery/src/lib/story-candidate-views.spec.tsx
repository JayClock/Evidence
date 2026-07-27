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
    title: '本地编码智能体',
    problem: '托管服务不能接收源码。',
    role: '工作区维护者',
    goal: '在本地运行编码工作。',
    value: '凭据和仓库内容保持在本地。',
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
  const links: Record<string, { rel: string; href: string }> = {
    self: {
      rel: 'self',
      href: '/api/workspaces/workspace-1/story-candidates?page=1&pageSize=20&extractionId=extraction-1',
    },
    extraction: {
      rel: 'extraction',
      href: '/api/workspaces/workspace-1/inbox-extractions/extraction-1',
    },
  };
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
    getLink: (relation: string) => links[relation],
  } as unknown as State<StoryCandidateCollectionResource>;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">{`${location.pathname}${location.search}`}</output>
  );
}

afterEach(() => {
  delete window.evidenceDesktop;
});

describe('Story Candidate views', () => {
  it('renders one source-cited Candidate review workbench without Story authority', () => {
    render(
      <MemoryRouter>
        <StoryCandidateCollectionView resourceState={collectionState()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '故事候选' })).toBeTruthy();
    expect(screen.getAllByText('CAND-0001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('可选择').length).toBeGreaterThan(0);
    expect(screen.getByText(revisionHash)).toBeTruthy();
    expect(screen.getByText(/这不是 Story/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '查看提取' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/inbox-extractions/extraction-1');
  });

  it('preserves the Extraction scope when applying business text search', () => {
    render(
      <MemoryRouter initialEntries={['/candidates?extractionId=extraction-1']}>
        <StoryCandidateCollectionView resourceState={collectionState()} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('搜索候选'), {
      target: { value: '本地交付' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));

    expect(screen.getByTestId('location').textContent).toBe(
      '/api/workspaces/workspace-1/story-candidates?page=1&pageSize=20&extractionId=extraction-1&q=%E6%9C%AC%E5%9C%B0%E4%BA%A4%E4%BB%98',
    );
  });

  it('records terminal rejection with the exact Candidate hash and reason', async () => {
    const rejected = candidateState({ status: 'rejected' });
    const post = vi.fn().mockResolvedValue(rejected);
    const state = candidateState({ actionPost: post });

    render(
      <MemoryRouter>
        <StoryCandidateDetailView resourceState={state} />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('button', { name: /确认并创建 Story/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    fireEvent.change(screen.getByLabelText('决定理由'), {
      target: { value: '不属于当前产品边界。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '记录拒绝决定' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          candidateSha256: candidateHash,
          reason: '不属于当前产品边界。',
        },
      }),
    );
    expect(await screen.findByText('已拒绝')).toBeTruthy();
  });

  it('confirms selection before delegating provisioning to Desktop', async () => {
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
      screen.getByRole('button', { name: '选择并开始 Iteration' }),
    );
    expect(
      screen.getByRole('heading', {
        name: '选择 Candidate 并开始 Iteration',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Story / US-001')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认选择' }));

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

  it('does not offer selection when live sources make the Candidate stale', () => {
    window.evidenceDesktop = { startIteration: vi.fn() } as never;

    render(
      <MemoryRouter>
        <StoryCandidateDetailView
          resourceState={candidateState({ status: 'stale' })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('来源已变化')).toBeTruthy();
    expect(screen.getByText(/此 Candidate 不能再被选择/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: '选择并开始 Iteration' }),
    ).toBeNull();
  });
});
