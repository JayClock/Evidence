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
  ShowcaseNextAction,
  ShowcaseResourceData,
} from '@evidence/api-client';
import { ShowcaseActionPanel } from './showcase-action-panel';

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

afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

describe('ShowcaseActionPanel', () => {
  it('records human-observed outcomes and evidence for the exact Scenario', async () => {
    const onRecordProductObservation = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      nextAction: {
        kind: 'observe_scenario',
        actionId: 'action-observe-1',
        expectedShowcaseVersion: 4,
        scenarioId: 'scenario-1',
        scenarioReference: 'SC-001',
      },
      onRecordProductObservation,
    });

    fireEvent.change(screen.getByLabelText('Then 1 的实际结果'), {
      target: { value: '用户看到新的交付状态。' },
    });
    fireEvent.change(screen.getByLabelText('观察事实'), {
      target: { value: '在真实界面完成了一次交付。' },
    });
    fireEvent.change(screen.getByLabelText('价值反馈'), {
      target: { value: '领域专家确认原问题已被解决。' },
    });
    fireEvent.change(screen.getByLabelText('Evidence refs'), {
      target: {
        value: 'screen:delivery-complete\nobservation:domain-expert-1',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '记录人工产品观察' }));

    await waitFor(() =>
      expect(onRecordProductObservation).toHaveBeenCalledWith({
        expectedShowcaseVersion: 4,
        scenarioId: 'scenario-1',
        observedOutcomes: ['用户看到新的交付状态。'],
        observation: '在真实界面完成了一次交付。',
        valueFeedback: '领域专家确认原问题已被解决。',
        evidenceRefs: [
          'screen:delivery-complete',
          'observation:domain-expert-1',
        ],
      }),
    );
  });

  it('requires explicit human confirmation before accepting reviewer advice', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      nextAction: {
        kind: 'await_human',
        actionId: 'action-decide-1',
        expectedShowcaseVersion: 9,
        reviewId: 'review-1',
        reviewSha256: sha('r'),
      },
      onDecide,
    });

    fireEvent.change(screen.getByLabelText('决定理由'), {
      target: { value: '已逐项观察产品价值并审阅独立建议。' },
    });
    expect(
      screen
        .getByRole('button', { name: '确认 accept' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('我确认这是人工产品决定'));
    fireEvent.click(screen.getByRole('button', { name: '确认 accept' }));

    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith({
        action: 'accept',
        reason: '已逐项观察产品价值并审阅独立建议。',
        feedbackTarget: null,
      }),
    );
  });

  it('does not expose implementation routes before deterministic worktree recovery exists', () => {
    renderPanel({
      nextAction: {
        kind: 'resolve_failure',
        actionId: 'action-failure-1',
        expectedShowcaseVersion: 5,
        observationId: 'q2-observation-1',
        allowedActions: ['revise', 'reject'],
      },
    });

    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByText(/test \/ implementation \/ refactor/)).toBeTruthy();
    expect(screen.queryByText(/Implementation → Pair/)).toBeNull();
  });

  it('keeps local Q2 execution unavailable outside Desktop', () => {
    renderPanel({
      desktopAvailable: false,
      nextAction: {
        kind: 'execute_q2',
        actionId: 'action-q2-1',
        expectedShowcaseVersion: 2,
        testId: 'TEST-001',
        scenarioIds: ['scenario-1'],
        processId: 'TP-001',
        stepId: 'STEP-001',
        projectId: ':server-java:domain',
        command: 'pnpm nx test :server-java:domain',
        timeoutMs: 60_000,
        approvedCommitSha: 'a'.repeat(40),
      },
    });

    expect(
      screen
        .getByRole('button', { name: '在 Desktop 重跑 Q2' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByText('Browser 不执行仓库命令，也不运行 Pi Reviewer。'),
    ).toBeTruthy();
  });
});

function renderPanel(
  overrides: Partial<Parameters<typeof ShowcaseActionPanel>[0]> = {},
) {
  const nextAction: ShowcaseNextAction = overrides.nextAction ?? {
    kind: 'decide_risk',
    actionId: 'action-risk-1',
    expectedShowcaseVersion: 3,
    quadrant: 'Q3',
  };
  const props: Parameters<typeof ShowcaseActionPanel>[0] = {
    showcase: showcaseData(nextAction),
    nextAction,
    desktopAvailable: true,
    pending: false,
    onRunLocal: vi.fn().mockResolvedValue(undefined),
    onRecordProductObservation: vi.fn().mockResolvedValue(undefined),
    onRecordRiskDecision: vi.fn().mockResolvedValue(undefined),
    onRecordEvaluation: vi.fn().mockResolvedValue(undefined),
    onDecide: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(<ShowcaseActionPanel {...props} />);
}

function showcaseData(nextAction: ShowcaseNextAction): ShowcaseResourceData {
  return {
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      loop: 'showcase',
      stage: 'reviewing',
      version: 7,
    } as never,
    story: { id: 'story-1', reference: 'US-001' } as never,
    storyRevision: {
      _links: {},
      id: 'revision-1',
      revisionNumber: 1,
      title: '观察交付价值',
      problem: '交付价值尚未被实际观察。',
      role: '领域专家',
      goal: '观察交付结果',
      value: '确认 Story 价值',
      cognitiveMode: 'complicated',
      citations: [],
      scenarios: [
        {
          id: 'scenario-1',
          reference: 'SC-001',
          sourceDraftId: 'draft-1',
          title: '交付成功',
          given: ['存在已批准变更'],
          when: '领域专家执行交付流程',
          then: ['用户看到新的交付状态'],
          businessData: ['workspace'],
        },
      ],
      contentSha256: sha('s'),
      createdByUserId: 'user-1',
      createdAt: '2026-08-03T00:00:00.000Z',
    },
    approvedPlan: {} as never,
    pairRun: {} as never,
    pairManifest: {} as never,
    run: {
      id: 'showcase-1',
      reference: 'SHOW-0001',
      attempt: 1,
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
      storyId: 'story-1',
      storyRevisionId: 'revision-1',
      storyRevisionSha256: sha('s'),
      approvedTaskingPlanId: 'plan-1',
      approvedTaskingPlanSha256: sha('p'),
      pairRunId: 'pair-1',
      pairManifestId: 'manifest-1',
      pairManifestSha256: sha('m'),
      approvedCommitSha: 'a'.repeat(40),
      stage: 'reviewing',
      version: 3,
      evidenceBundleSha256: null,
      startedAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
      completedAt: null,
    },
    q2Observations: [],
    productObservations: [],
    riskDecisions: [],
    evaluations: [],
    review: null,
    decision: null,
    nextAction,
  };
}
