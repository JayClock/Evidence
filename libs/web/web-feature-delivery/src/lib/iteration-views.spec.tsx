import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type {
  IntakeAgentEvent,
  IterationResource,
  KickoffDecisionResultResource,
  KickoffResource,
  State,
} from '@evidence/api-client';
import { IterationDetailView } from './iteration-views';
import { KickoffDetailView } from './kickoff-view';

const candidateHash = `sha256:${'a'.repeat(64)}`;
const intakeHash = `sha256:${'b'.repeat(64)}`;
const proposalHash = `sha256:${'c'.repeat(64)}`;
const revisionHash = `sha256:${'d'.repeat(64)}`;
const commitSha = 'e'.repeat(40);

class ResizeObserverStub {
  observe() {
    // jsdom does not implement ResizeObserver.
  }

  unobserve() {
    // jsdom does not implement ResizeObserver.
  }

  disconnect() {
    // jsdom does not implement ResizeObserver.
  }
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function iterationData(
  overrides: Partial<IterationResource['data']> = {},
): IterationResource['data'] {
  return {
    id: 'iteration-1',
    reference: 'ITER-0001',
    sourceCandidateId: 'candidate-1',
    sourceCandidateSha256: candidateHash,
    lifecycle: 'active',
    loop: 'kickoff',
    stage: 'candidate_review',
    lane: 'discovery',
    version: 2,
    baseCommitSha: commitSha,
    branchName: 'evidence/iter-iteration-1',
    provisioningFailureSummary: null,
    activeStoryId: null,
    admittedByUserId: 'user-1',
    admittedAt: '2026-07-24T10:00:00.000Z',
    updatedAt: '2026-07-24T10:01:00.000Z',
    ...overrides,
  };
}

function embeddedIteration(overrides: Partial<IterationResource['data']> = {}) {
  return {
    _links: {
      candidate: {
        href: '/api/workspaces/workspace-1/story-candidates/candidate-1',
      },
      ...(overrides.activeStoryId
        ? {
            story: {
              href: `/api/workspaces/workspace-1/stories/${overrides.activeStoryId}`,
            },
          }
        : {}),
    },
    ...iterationData(overrides),
  };
}

function kickoffData(
  overrides: Partial<KickoffResource['data']> = {},
): KickoffResource['data'] {
  return {
    iteration: embeddedIteration(),
    intake: {
      _links: {},
      iterationId: 'iteration-1',
      candidate: {
        candidateId: 'candidate-1',
        candidateReference: 'CAND-0001',
        extractionId: 'extraction-1',
        title: '本地编码智能体',
        problem: '托管服务不能接收源码。',
        role: '工作区维护者',
        goal: '在本地运行受限的编码工作。',
        value: '凭据和仓库内容保持在本地。',
        cognitiveMode: 'complicated',
        citations: [],
        contentSha256: candidateHash,
        proposedAt: '2026-07-24T09:00:00.000Z',
      },
      sources: [
        {
          inboxItemId: 'item-1',
          inboxRevisionId: 'revision-1',
          revisionNumber: 1,
          sourceKind: 'manual_text',
          externalKey: 'manual:one',
          itemStatus: 'active',
          title: '本地编码智能体',
          body: '在本地运行 Pi。',
          contentType: 'text/markdown',
          uri: null,
          providerMetadata: {},
          sourceUpdatedAt: null,
          capturedAt: '2026-07-24T09:00:00.000Z',
          contentSha256: revisionHash,
          locatorLinks: {},
        },
      ],
      requirementsProjection: '作为工作区维护者…',
      contentSha256: intakeHash,
      frozenAt: '2026-07-24T10:00:00.000Z',
    },
    currentProposal: {
      _links: {},
      id: 'proposal-1',
      reference: 'KICKOFF-CAND-001',
      sequence: 1,
      origin: 'inbox_candidate',
      title: '本地编码智能体',
      problem: '托管服务不能接收源码。',
      role: '工作区维护者',
      goal: '在本地运行受限的编码工作。',
      value: '凭据和仓库内容保持在本地。',
      cognitiveMode: 'complicated',
      citations: [],
      contentSha256: proposalHash,
      proposedAt: '2026-07-24T10:00:00.000Z',
    },
    decisions: [],
    ...overrides,
  };
}

function kickoffState({
  data = kickoffData(),
  post = vi.fn(),
  refresh = vi.fn(),
}: {
  data?: KickoffResource['data'];
  post?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
} = {}) {
  const links: Record<string, { rel: string; href: string }> = {
    self: {
      rel: 'self',
      href: '/api/workspaces/workspace-1/iterations/iteration-1/kickoff',
    },
    iteration: {
      rel: 'iteration',
      href: '/api/workspaces/workspace-1/iterations/iteration-1',
    },
    intake: {
      rel: 'intake',
      href: '/api/workspaces/workspace-1/iterations/iteration-1/intake',
    },
  };
  if (data.currentProposal) {
    links.decide = {
      rel: 'decide',
      href: `${links.self.href}/decisions`,
    };
  }
  return {
    data,
    getLink: (relation: string) => links[relation],
    follow: (relation: string) => {
      if (relation === 'self') return { refresh };
      if (relation === 'decide') return { post };
      throw new Error(`Unexpected relation: ${relation}`);
    },
  } as unknown as State<KickoffResource>;
}

function decisionResult(action: 'confirm' | 'revise') {
  const confirmed = action === 'confirm';
  return {
    data: {
      iteration: embeddedIteration(
        confirmed
          ? {
              loop: 'understand',
              stage: 'tqa',
              version: 3,
              activeStoryId: 'story-1',
            }
          : { stage: 'candidate_drafting', version: 3 },
      ),
      decision: {
        _links: {},
        id: 'decision-1',
        reference: 'DECISION-0001',
        proposalId: 'proposal-1',
        proposalSha256: proposalHash,
        action,
        reason: confirmed ? null : '收窄目标。',
        decidedByUserId: 'user-1',
        decidedAt: '2026-07-24T11:00:00.000Z',
        contentSha256: `sha256:${'f'.repeat(64)}`,
      },
      problemStatement: confirmed
        ? {
            id: 'problem-1',
            storyId: 'story-1',
            revisionNumber: 1,
            title: '本地编码智能体',
            problem: '托管服务不能接收源码。',
            cognitiveMode: 'complicated',
            citations: [],
            contentSha256: `sha256:${'1'.repeat(64)}`,
            createdAt: '2026-07-24T11:00:00.000Z',
          }
        : null,
      storyCard: confirmed
        ? {
            id: 'card-1',
            reference: 'US-001' as const,
            storyId: 'story-1',
            revisionNumber: 1,
            title: '本地编码智能体',
            role: '工作区维护者',
            goal: '在本地运行受限的编码工作。',
            value: '凭据和仓库内容保持在本地。',
            problemStatementId: 'problem-1',
            contentSha256: `sha256:${'2'.repeat(64)}`,
            createdAt: '2026-07-24T11:00:00.000Z',
          }
        : null,
    },
  } as unknown as State<KickoffDecisionResultResource>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

afterEach(() => {
  delete window.evidenceDesktop;
});

describe('Iteration and Kickoff views', () => {
  it('shows the isolated Iteration and frozen workflow links', () => {
    const state = {
      data: iterationData(),
      getLink: (relation: string) =>
        relation === 'intake'
          ? {
              href: '/api/workspaces/workspace-1/iterations/iteration-1/intake',
            }
          : relation === 'kickoff'
            ? {
                href: '/api/workspaces/workspace-1/iterations/iteration-1/kickoff',
              }
            : undefined,
    } as unknown as State<IterationResource>;

    render(
      <MemoryRouter>
        <IterationDetailView resourceState={state} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'ITER-0001' })).toBeTruthy();
    expect(screen.getByText('evidence/iter-iteration-1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Frozen Intake' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '打开 Kickoff' })).toBeTruthy();
  });

  it('creates US-001 only after explicit human confirmation', async () => {
    const refreshed = kickoffState({
      data: kickoffData({
        iteration: embeddedIteration({
          loop: 'understand',
          stage: 'tqa',
          version: 3,
          activeStoryId: 'story-1',
        }),
        currentProposal: null,
      }),
    });
    const post = vi.fn().mockResolvedValue(decisionResult('confirm'));
    const refresh = vi.fn().mockResolvedValue(refreshed);
    const state = kickoffState({ post, refresh });

    render(
      <MemoryRouter initialEntries={['/kickoff']}>
        <KickoffDetailView resourceState={state} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '确认并创建 US-001' }));
    expect(screen.getByRole('button', { name: '创建 US-001' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '我确认当前 Proposal 可以成为权威 Story',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '创建 US-001' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          proposalId: 'proposal-1',
          proposalSha256: proposalHash,
          expectedIterationVersion: 2,
          action: 'confirm',
          reason: null,
        },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/api/workspaces/workspace-1/stories/story-1',
      ),
    );
  });

  it('records human revise before invoking the local replacement Analyst', async () => {
    const initialProposal = kickoffData().currentProposal;
    expect(initialProposal).not.toBeNull();
    if (!initialProposal) return;
    const replacement = kickoffState({
      data: kickoffData({
        iteration: embeddedIteration({ version: 4 }),
        currentProposal: {
          ...initialProposal,
          id: 'proposal-2',
          reference: 'KICKOFF-CAND-002',
        },
      }),
    });
    const post = vi.fn().mockResolvedValue(decisionResult('revise'));
    const refresh = vi.fn().mockResolvedValue(replacement);
    const runKickoffAnalyst = vi.fn(
      async (_request: unknown, onEvent: (event: IntakeAgentEvent) => void) => {
        onEvent({ id: 'kickoff:1', event: 'complete', data: '' });
      },
    );
    window.evidenceDesktop = { runKickoffAnalyst } as never;
    const state = kickoffState({ post, refresh });

    render(
      <MemoryRouter>
        <KickoffDetailView resourceState={state} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '修订' }));
    fireEvent.change(screen.getByLabelText('决定理由'), {
      target: { value: '收窄目标。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '记录修订决定' }));

    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(runKickoffAnalyst).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          iterationId: 'iteration-1',
        }),
        expect.any(Function),
      ),
    );
    expect(await screen.findByText('KICKOFF-CAND-002')).toBeTruthy();
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(
      runKickoffAnalyst.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });
});
