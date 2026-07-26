import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  IntakeAgentEvent,
  IterationResource,
  KickoffDecisionResultResource,
  KickoffResource,
  State,
} from '@evidence/api-client';
import { IterationDetailView, KickoffDetailView } from './iteration-views';

const candidateHash = `sha256:${'a'.repeat(64)}`;
const intakeHash = `sha256:${'b'.repeat(64)}`;
const proposalHash = `sha256:${'c'.repeat(64)}`;
const revisionHash = `sha256:${'d'.repeat(64)}`;
const commitSha = 'e'.repeat(40);

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

function kickoffData(
  overrides: Partial<KickoffResource['data']> = {},
): KickoffResource['data'] {
  return {
    iteration: { _links: {}, ...iterationData() },
    intake: {
      _links: {},
      iterationId: 'iteration-1',
      candidate: {
        candidateId: 'candidate-1',
        candidateReference: 'CAND-0001',
        extractionId: 'extraction-1',
        title: 'Local coding agent',
        problem: 'Hosted services must not receive source code.',
        role: 'Workspace maintainer',
        goal: 'Run coding work locally.',
        value: 'Credentials remain local.',
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
          title: 'Local coding agent',
          body: 'Run Pi locally.',
          contentType: 'text/markdown',
          uri: null,
          providerMetadata: {},
          sourceUpdatedAt: null,
          capturedAt: '2026-07-24T09:00:00.000Z',
          contentSha256: revisionHash,
          locatorLinks: {},
        },
      ],
      requirementsProjection: 'As a Workspace maintainer…',
      contentSha256: intakeHash,
      frozenAt: '2026-07-24T10:00:00.000Z',
    },
    currentProposal: {
      _links: {},
      id: 'proposal-1',
      reference: 'KICKOFF-CAND-001',
      sequence: 1,
      origin: 'inbox_candidate',
      title: 'Local coding agent',
      problem: 'Hosted services must not receive source code.',
      role: 'Workspace maintainer',
      goal: 'Run coding work locally.',
      value: 'Credentials remain local.',
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
  return {
    data: {
      iteration: {
        _links: {},
        ...iterationData(
          action === 'confirm'
            ? {
                loop: 'understand',
                stage: 'tqa',
                version: 3,
                activeStoryId: 'story-1',
              }
            : { stage: 'candidate_drafting', version: 3 },
        ),
      },
      decision: {
        _links: {},
        id: 'decision-1',
        reference: 'DECISION-0001',
        proposalId: 'proposal-1',
        proposalSha256: proposalHash,
        action,
        reason: action === 'confirm' ? null : 'Narrow the goal.',
        decidedByUserId: 'user-1',
        decidedAt: '2026-07-24T11:00:00.000Z',
        contentSha256: `sha256:${'f'.repeat(64)}`,
      },
      problemStatement:
        action === 'confirm'
          ? {
              id: 'problem-1',
              storyId: 'story-1',
              revisionNumber: 1,
              title: 'Local coding agent',
              problem: 'Hosted services must not receive source code.',
              cognitiveMode: 'complicated',
              citations: [],
              contentSha256: `sha256:${'1'.repeat(64)}`,
              createdAt: '2026-07-24T11:00:00.000Z',
            }
          : null,
      storyCard:
        action === 'confirm'
          ? {
              id: 'card-1',
              reference: 'US-001' as const,
              storyId: 'story-1',
              revisionNumber: 1,
              title: 'Local coding agent',
              role: 'Workspace maintainer',
              goal: 'Run coding work locally.',
              value: 'Credentials remain local.',
              problemStatementId: 'problem-1',
              contentSha256: `sha256:${'2'.repeat(64)}`,
              createdAt: '2026-07-24T11:00:00.000Z',
            }
          : null,
    },
  } as unknown as State<KickoffDecisionResultResource>;
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
    expect(screen.getByRole('link', { name: 'Open Kickoff' })).toBeTruthy();
  });

  it('creates US-001 only after the explicit human confirm Decision', async () => {
    const refreshed = kickoffState({
      data: kickoffData({
        iteration: {
          _links: {},
          ...iterationData({ loop: 'understand', stage: 'tqa', version: 3 }),
        },
      }),
    });
    const post = vi.fn().mockResolvedValue(decisionResult('confirm'));
    const refresh = vi.fn().mockResolvedValue(refreshed);
    const state = kickoffState({ post, refresh });

    render(
      <MemoryRouter>
        <KickoffDetailView resourceState={state} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm as US-001' }));

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
    expect(await screen.findByText(/US-001: Local coding agent/)).toBeTruthy();
  });

  it('records human revise before invoking the local replacement Analyst', async () => {
    const replacement = kickoffState({
      data: kickoffData({
        iteration: {
          _links: {},
          ...iterationData({ version: 4 }),
        },
        currentProposal: {
          ...kickoffData().currentProposal!,
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

    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Narrow the goal.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record revise' }));

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
