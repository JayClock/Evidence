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
import type { State, TaskingResource } from '@evidence/api-client';
import { TaskingDetailView } from './tasking-views';

const sha = (character: string) => `sha256:${character.repeat(64)}`;
const executionBudget = {
  policyId: 'pair-default' as const,
  policyVersion: 2 as const,
  policySha256: sha('e'),
  activityTimeoutMs: 3_600_000,
  commandTimeoutMs: 600_000,
  maxAgentCalls: 10,
  maxCheckpoints: 34,
  maxRetriesPerFingerprint: 2,
  maxNoProgressCheckpoints: 3,
};

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

describe('TaskingDetailView', () => {
  it('runs the Tasking Analyst only through the Desktop bridge', async () => {
    const refreshed = taskingState(taskingData('desk_check'));
    const refresh = vi.fn().mockResolvedValue(refreshed);
    const runTaskingAnalyst = vi.fn(async () => undefined);
    window.evidenceDesktop = { runTaskingAnalyst } as never;

    renderTasking(
      <TaskingDetailView
        resourceState={taskingState(taskingData('drafting'), { refresh })}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: '运行本地 Tasking Analyst' }),
    );

    await waitFor(() =>
      expect(runTaskingAnalyst).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          iterationId: 'iteration-1',
        }),
        expect.any(Function),
      ),
    );
    expect((await screen.findAllByText('TCAND-001')).length).toBeGreaterThan(0);
  });

  it('approves the exact Candidate without starting Pair', async () => {
    const approved = taskingState(taskingData('approved'));
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(approved);

    renderTasking(
      <TaskingDetailView
        resourceState={taskingState(taskingData('desk_check'), {
          post,
          refresh,
        })}
      />,
    );

    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(screen.getByText('Q1 / Q2 测试清单 · 2')).toBeTruthy();
    expect(screen.getByText('流程与命令 · 1')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    const reason = screen.getByLabelText('修订或缺口路由理由') as unknown as {
      getAttribute: (name: string) => string | null;
    };
    expect(reason.getAttribute('aria-invalid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '批准精确计划' }));
    fireEvent.click(screen.getByLabelText(/我已检查 Scenario/));
    fireEvent.click(screen.getByRole('button', { name: '确认批准计划' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          expectedIterationVersion: 5,
          candidateId: 'tasking-1',
          candidateSha256: sha('c'),
          action: 'approve',
          reason: null,
        },
      }),
    );
    expect(await screen.findByText('PLAN v2 已批准')).toBeTruthy();
    expect(window.evidenceDesktop?.startPair).toBeUndefined();
  });

  it('starts only the exact approved Plan through the Desktop Pair bridge', async () => {
    const startPair = vi.fn().mockResolvedValue({
      status: 'approval_required',
      checkpoint: 'quality_gates_passed',
    });
    window.evidenceDesktop = { startPair } as never;

    renderTasking(
      <TaskingDetailView
        resourceState={taskingState(taskingData('approved'))}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: '在 Desktop 启动 Approved Pair Plan',
      }),
    );

    await waitFor(() =>
      expect(startPair).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          iterationId: 'iteration-1',
        }),
        expect.any(Function),
      ),
    );
  });

  it('requires a reason for every Desk Check return route', async () => {
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi
      .fn()
      .mockResolvedValue(taskingState(taskingData('knowledge_gap')));

    renderTasking(
      <TaskingDetailView
        resourceState={taskingState(taskingData('desk_check'), {
          post,
          refresh,
        })}
      />,
    );

    const routeButton = screen.getByRole('button', { name: '工序缺口' });
    expect(routeButton.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('修订或缺口路由理由'), {
      target: { value: '现有 v3 process 未覆盖此技术边界。' },
    });
    fireEvent.click(routeButton);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'process_gap',
          reason: '现有 v3 process 未覆盖此技术边界。',
        }),
      }),
    );
  });
});

function taskingData(
  stage: 'drafting' | 'desk_check' | 'knowledge_gap' | 'approved',
): TaskingResource['data'] {
  const candidate = taskingCandidate();
  return {
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      loop: 'tasking',
      stage,
      version: stage === 'drafting' ? 4 : stage === 'desk_check' ? 5 : 6,
    },
    story: { id: 'story-1', reference: 'US-001' },
    storyRevision: {
      id: 'revision-2',
      revisionNumber: 2,
      contentSha256: sha('s'),
    },
    noModelImpactDecision: {
      id: 'no-model-1',
      reference: 'NMI-001',
      storyId: 'story-1',
      storyRevisionId: 'revision-2',
      storyRevisionSha256: sha('s'),
      subject: 'tool',
      method: 'none',
      modelChangeRequired: false,
      reason: 'This Story changes only local workflow glue.',
      decidedByUserId: 'user-1',
      decidedAt: '2026-07-24T11:30:00.000Z',
      contentSha256: sha('n'),
    },
    currentCandidate: stage === 'desk_check' ? candidate : null,
    decisions: [],
    approvedPlan:
      stage === 'approved'
        ? {
            id: 'plan-1',
            storyId: 'story-1',
            storyRevisionId: 'revision-2',
            taskingCandidateId: candidate.id,
            deskCheckDecisionId: 'decision-1',
            plan: candidate,
            contentSha256: sha('a'),
            approvedByUserId: 'user-1',
            approvedAt: '2026-07-24T12:00:00.000Z',
          }
        : null,
    processCatalog: [],
  } as unknown as TaskingResource['data'];
}

function taskingCandidate() {
  return {
    id: 'tasking-1',
    planVersion: 2,
    reference: 'TCAND-001',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    storyRevisionSha256: sha('s'),
    baseCommitSha: 'b'.repeat(40),
    noModelImpactDecisionId: 'no-model-1',
    noModelImpactDecisionSha256: sha('n'),
    sequence: 1,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['test', 'typecheck', 'lint'],
        },
      ],
    },
    projectCatalogSha256: sha('j'),
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q2',
        intent: 'The confirmed Scenario reaches Desk Check.',
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        stepId: 'electron-package-q2',
        projectId: '@evidence/desktop',
        testFilter: 'tasking authority',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'A complete Candidate awaits Desk Check',
        businessData: ['iterationId'],
        modelRefs: { entities: [], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q1',
        intent: 'The allowlist is serialized deterministically.',
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        stepId: 'electron-shell-q1',
        projectId: '@evidence/desktop',
        testFilter: 'tasking allowlist',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: null,
        businessData: [],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    processes: [
      {
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        processVersion: 3,
        definitionSha256: sha('d'),
        functionalContexts: ['delivery'],
        technicalBoundaries: ['electron-main'],
        selectedStepIds: ['electron-package-q2', 'electron-shell-q1'],
        projectIds: ['@evidence/desktop'],
        projectCatalogSha256: sha('j'),
        focusedCommands: [
          {
            testId: 'TEST-001',
            stepId: 'electron-package-q2',
            projectId: '@evidence/desktop',
            command:
              'pnpm nx test @evidence/desktop --run --testNamePattern=tasking',
          },
        ],
        qualityGates: [
          {
            projectId: '@evidence/desktop',
            target: 'package-smoke',
            command: 'pnpm nx run @evidence/desktop:package-smoke',
          },
        ],
        materializedSha256: sha('m'),
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive the package outcome.',
        testIds: ['TEST-001', 'TEST-002'],
        dependsOn: [],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    executionBudget,
    contentSha256: sha('c'),
    proposedBy: 'tasking-analyst',
    proposedAt: '2026-07-24T11:45:00.000Z',
  };
}

function taskingState(
  data: TaskingResource['data'],
  {
    post = vi.fn(),
    refresh = vi.fn(),
  }: {
    post?: ReturnType<typeof vi.fn>;
    refresh?: ReturnType<typeof vi.fn>;
  } = {},
): State<TaskingResource> {
  return {
    data,
    getLink: (relation: string) => {
      const links: Record<string, string> = {
        self: '/api/workspaces/workspace-1/iterations/iteration-1/tasking',
        iteration: '/api/workspaces/workspace-1/iterations/iteration-1',
        story: '/api/workspaces/workspace-1/stories/story-1',
      };
      if (data.iteration.stage === 'desk_check') {
        links.decide = `${links.self}/decisions`;
      }
      if (data.iteration.stage === 'approved') {
        links.pair = '/api/workspaces/workspace-1/iterations/iteration-1/pair';
      }
      return links[relation] ? { href: links[relation] } : undefined;
    },
    follow: (relation: string) => ({
      post,
      refresh: relation === 'self' ? refresh : vi.fn(),
    }),
  } as unknown as State<TaskingResource>;
}

function renderTasking(view: ReactNode) {
  return render(<MemoryRouter>{view}</MemoryRouter>);
}
