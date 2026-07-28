import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  useResource,
  type State,
  type StoryCollectionResource,
  type StoryResource,
  type StoryRevisionCollectionResource,
  type StoryRevisionResource,
} from '@evidence/api-client';
import type { Mock } from 'vitest';
import { StoryCollectionView } from './story-board';
import { StoryDetailView } from './story-detail-view';
import {
  StoryRevisionCollectionView,
  StoryRevisionDetailView,
} from './story-views';

vi.mock('@evidence/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@evidence/api-client')>();
  return { ...actual, useResource: vi.fn() };
});

const inboxHash = `sha256:${'a'.repeat(64)}`;
const revisionHash = `sha256:${'b'.repeat(64)}`;

const revisionState = {
  data: {
    id: 'story-revision-1',
    revisionNumber: 1,
    title: '本地编码智能体',
    problem: '托管服务不能接收本地源码。',
    role: '工作区维护者',
    goal: '在本地运行受限的编码工作。',
    value: '凭据和仓库内容保持在本地。',
    cognitiveMode: 'complicated',
    citations: [
      {
        _links: {
          item: { href: '/api/workspaces/workspace-1/inbox-items/item-1' },
          revision: {
            href: '/api/workspaces/workspace-1/inbox-items/item-1/revisions/inbox-revision-1',
          },
        },
        inboxItemId: 'item-1',
        inboxRevisionId: 'inbox-revision-1',
        inboxRevisionNumber: 2,
        contentSha256: inboxHash,
        locator: 'whole-source',
      },
    ],
    scenarios: [],
    contentSha256: revisionHash,
    createdByUserId: 'user-1',
    createdAt: '2026-07-24T11:00:00.000Z',
  },
  getLink: (relation: string) =>
    relation === 'self'
      ? {
          rel: relation,
          href: '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-1',
        }
      : undefined,
} as unknown as State<StoryRevisionResource>;

function storyState(
  overrides: Partial<StoryResource['data']> = {},
): State<StoryResource> {
  const data: StoryResource['data'] = {
    id: 'story-1',
    iterationId: 'iteration-1',
    iterationReference: 'ITER-0001',
    iterationLifecycle: 'active',
    iterationLoop: 'understand',
    iterationStage: 'tqa',
    reference: 'US-001',
    title: '本地编码智能体',
    goal: '在本地运行受限的编码工作。',
    latestRevisionId: 'story-revision-1',
    latestRevisionNumber: 1,
    latestScenarioCount: 0,
    latestCitationCount: 1,
    pendingClarificationReference: 'Q-001',
    authority: { owner: 'human', nextAction: 'answer_clarification' },
    revisionCount: 1,
    version: 1,
    createdAt: '2026-07-24T11:00:00.000Z',
    updatedAt: '2026-07-24T11:00:00.000Z',
    ...overrides,
  };
  const links: Record<string, { rel: string; href: string }> = {
    self: {
      rel: 'self',
      href: '/api/workspaces/workspace-1/stories/story-1',
    },
    collection: {
      rel: 'collection',
      href: '/api/workspaces/workspace-1/stories',
    },
    revisions: {
      rel: 'revisions',
      href: '/api/workspaces/workspace-1/stories/story-1/revisions',
    },
    understanding: {
      rel: 'understanding',
      href: '/api/workspaces/workspace-1/iterations/iteration-1/understanding',
    },
    tasking: {
      rel: 'tasking',
      href: '/api/workspaces/workspace-1/iterations/iteration-1/tasking',
    },
    pair: {
      rel: 'pair',
      href: '/api/workspaces/workspace-1/iterations/iteration-1/pair',
    },
  };
  return {
    data,
    getLink: (relation: string) => links[relation],
    follow: (relation: string) => {
      if (relation !== 'latest-revision') {
        throw new Error(`Unexpected relation: ${relation}`);
      }
      return { kind: 'latest-revision' };
    },
  } as unknown as State<StoryResource>;
}

const acceptanceRevisionState = {
  ...revisionState,
  data: {
    ...revisionState.data,
    id: 'story-revision-2',
    revisionNumber: 2,
    scenarios: [
      {
        id: 'scenario-1',
        reference: 'SC-001',
        sourceDraftId: 'scenario-draft-1',
        title: '创建隔离工作树',
        given: ['Workspace 已绑定可访问的 Git repository。'],
        when: '人工 Desk Check 批准精确 Tasking Plan。',
        then: ['创建专用分支与工作树。', '主工作树保持不变。'],
        businessData: ['ITER-0001', 'US-001'],
      },
    ],
  },
} as unknown as State<StoryRevisionResource>;

const revisionCollectionState = {
  data: {
    page: { number: 1, size: 20, totalElements: 1, totalPages: 1 },
  },
  collection: [revisionState],
  getLink: () => undefined,
} as unknown as State<StoryRevisionCollectionResource>;

const useResourceMock = useResource as unknown as Mock;

describe('Story views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResourceMock.mockReturnValue({
      loading: false,
      error: null,
      data: revisionState.data,
      resourceState: revisionState,
      resource: { kind: 'latest-revision' },
    });
  });

  it('lists confirmed Story identities with their Iteration workflow stage', () => {
    const collection = {
      data: {
        page: { number: 1, size: 20, totalElements: 1, totalPages: 1 },
        summary: {
          humanAttention: 1,
          agentAttention: 0,
          approved: 0,
          stages: [{ loop: 'understand', stage: 'tqa', count: 1 }],
          actions: [{ action: 'answer_clarification', count: 1 }],
        },
      },
      collection: [storyState()],
      getLink: () => undefined,
    } as unknown as State<StoryCollectionResource>;

    render(
      <MemoryRouter>
        <StoryCollectionView resourceState={collection} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '故事交付看板' })).toBeTruthy();
    expect(screen.getByText('本地编码智能体')).toBeTruthy();
    expect(screen.getByText('US-001 · ITER-0001')).toBeTruthy();
    expect(screen.getByText('TQA 澄清')).toBeTruthy();
    expect(screen.getByText('当前阶段 · TQA 澄清')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: '快速查看 本地编码智能体' }),
    );
    expect(screen.getByText('回答一个业务问题')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '回答' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/iterations/iteration-1/understanding');
  });

  it('supports a deep-linked search and opens bounded authority details', () => {
    const approvalStory = storyState({
      id: 'story-47',
      iterationId: 'iteration-47',
      iterationReference: 'ITER-0047',
      iterationLoop: 'pair',
      iterationStage: 'quality_gates_passed',
      title: '保护本地交付隐私',
      goal: '完整 Diff 只由 Desktop 本地提供。',
      latestRevisionNumber: 3,
      latestScenarioCount: 3,
      authority: { owner: 'human', nextAction: 'review_pair_change' },
    });
    const collection = {
      data: {
        page: { number: 1, size: 20, totalElements: 2, totalPages: 1 },
        summary: {
          humanAttention: 2,
          agentAttention: 0,
          approved: 0,
          stages: [
            { loop: 'understand', stage: 'tqa', count: 1 },
            { loop: 'pair', stage: 'quality_gates_passed', count: 1 },
          ],
          actions: [
            { action: 'answer_clarification', count: 1 },
            { action: 'review_pair_change', count: 1 },
          ],
        },
      },
      collection: [storyState(), approvalStory],
      getLink: () => undefined,
    } as unknown as State<StoryCollectionResource>;

    render(
      <MemoryRouter initialEntries={['/?q=ITER-0047']}>
        <StoryCollectionView resourceState={collection} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('本地编码智能体')).toBeNull();
    expect(screen.getByText('保护本地交付隐私')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: '快速查看 保护本地交付隐私' }),
    );
    expect(screen.getByText('列位置不是可拖拽状态')).toBeTruthy();
    expect(screen.getByText('精确 Approved Plan')).toBeTruthy();
  });

  it('routes a baseline Story to Understand instead of direct coding', () => {
    render(
      <MemoryRouter>
        <StoryDetailView resourceState={storyState()} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'US-001 · 本地编码智能体',
      }),
    ).toBeTruthy();
    expect(screen.getByText('编码准入尚未开放')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '精确来源引用' })).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: '定义验收 Scenario' })
        .getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/iterations/iteration-1/understanding');
    expect(
      screen.getByText(
        `${revisionHash.slice(0, 14)}…${revisionHash.slice(-8)}`,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: /CodingRun/ })).toBeNull();
    expect(
      screen.getByRole('link', { name: '修订历史' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/stories/story-1/revisions');
  });

  it('keeps a confirmed Scenario in Understand for explicit modeling impact', () => {
    useResourceMock.mockReturnValue({
      loading: false,
      error: null,
      data: acceptanceRevisionState.data,
      resourceState: acceptanceRevisionState,
      resource: { kind: 'latest-revision' },
    });

    render(
      <MemoryRouter>
        <StoryDetailView
          resourceState={storyState({
            iterationStage: 'modeling',
            latestRevisionId: 'story-revision-2',
            latestRevisionNumber: 2,
            latestScenarioCount: 1,
            revisionCount: 2,
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Understand · 模型影响决定')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '继续 Understand / Modeling' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: '创建隔离工作树' }),
    ).toBeTruthy();
    expect(screen.getByText('GIVEN')).toBeTruthy();
    expect(screen.getByText('WHEN')).toBeTruthy();
    expect(screen.getByText('THEN')).toBeTruthy();
  });

  it('renders revision history and exact Inbox citation links', () => {
    const { rerender } = render(
      <MemoryRouter>
        <StoryRevisionCollectionView resourceState={revisionCollectionState} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Story 修订历史' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '打开' }).getAttribute('href'),
    ).toBe(
      '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-1',
    );

    rerender(
      <MemoryRouter>
        <StoryRevisionDetailView resourceState={acceptanceRevisionState} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '本地编码智能体' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: '创建隔离工作树' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '打开来源' }).getAttribute('href'),
    ).toBe(
      '/api/workspaces/workspace-1/inbox-items/item-1/revisions/inbox-revision-1',
    );
    expect(screen.getByText(inboxHash)).toBeTruthy();
  });
});
