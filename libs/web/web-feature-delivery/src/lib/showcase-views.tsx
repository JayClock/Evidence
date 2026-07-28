import { useState } from 'react';
import type {
  DecideShowcaseInput,
  RecordShowcaseEvaluationInput,
  RecordShowcaseProductObservationInput,
  RecordShowcaseRiskDecisionInput,
  ShowcaseResource,
  State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  EvidencePage,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  Spinner,
  toast,
  Workbench,
  WorkbenchMain,
  WorkbenchRail,
} from '@evidence/ui';
import {
  DeliveryAuthorityProgress,
  iterationStageLabel,
} from './delivery-authority-progress';
import {
  ShowcaseActionPanel,
  type ShowcaseHumanDecision,
} from './showcase-action-panel';
import { ShowcaseEvidence } from './showcase-evidence';

export function ShowcaseDetailView({
  resourceState,
}: {
  resourceState: State<ShowcaseResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showcase = state.data;
  const bridge = window.evidenceDesktop;

  async function refresh() {
    const refreshed = (await state
      .follow('self')
      .refresh()) as State<ShowcaseResource>;
    setState(refreshed);
    return refreshed;
  }

  async function recordProductObservation(
    input: RecordShowcaseProductObservationInput,
  ) {
    await mutate(async () => {
      await state.follow('record-product-observation').post({ data: input });
      toast.success('产品观察已追加记录');
    });
  }

  async function recordRiskDecision(input: RecordShowcaseRiskDecisionInput) {
    await mutate(async () => {
      await state.follow('record-risk-decision').post({ data: input });
      toast.success(`${input.quadrant} 风险决定已记录`);
    });
  }

  async function recordEvaluation(input: RecordShowcaseEvaluationInput) {
    await mutate(async () => {
      await state.follow('record-evaluation').post({ data: input });
      toast.success(`${input.activity} 评价已追加`);
    });
  }

  async function decide(decision: ShowcaseHumanDecision) {
    const input: DecideShowcaseInput = {
      expectedShowcaseVersion: showcase.run.version,
      action: decision.action,
      reason: decision.reason,
      feedbackTarget: decision.feedbackTarget,
      evidenceBundleSha256: showcase.run.evidenceBundleSha256,
      reviewSha256: showcase.review?.contentSha256 ?? null,
    };
    await mutate(async () => {
      await state.follow('decide').post({ data: input });
      toast.success(showcaseDecisionMessage[decision.action]);
    });
  }

  async function runLocal(kind: 'q2' | 'reviewer') {
    if (pending) return;
    const run =
      kind === 'q2' ? bridge?.runShowcaseChecks : bridge?.runShowcaseReviewer;
    if (!run) {
      setError('此步骤只能在 Evidence Desktop 中执行。');
      return;
    }
    setPending(true);
    setError(null);
    setProgress(
      kind === 'q2'
        ? '正在锁定 approved commit…'
        : '正在启动独立只读 Reviewer…',
    );
    try {
      await run(
        {
          id: showcaseRequestId(kind),
          workspaceId: workspaceId(state),
          iterationId: showcase.iteration.id,
        },
        (event) => setProgress(event.message),
      );
      await refresh();
      toast.success(kind === 'q2' ? 'Q2 观察已记录' : '独立 Review 已记录');
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          kind === 'q2' ? 'Q2 执行失败。' : 'Reviewer 无法完成。',
        ),
      );
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function mutate(operation: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, '无法记录 Showcase 证据。'));
    } finally {
      setPending(false);
    }
  }

  return (
    <EvidencePage>
      <PageHeader className="px-4 pt-3.5 pb-[0.6875rem]">
        <PageHeaderCopy>
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>
              {showcase.iteration.reference} · version{' '}
              {showcase.iteration.version}
            </PageEyebrow>
            <Badge>{iterationStageLabel(showcase.iteration)}</Badge>
            <Badge variant="outline">Attempt {showcase.run.attempt}</Badge>
          </div>
          <PageTitle className="leading-7">
            {showcase.story.reference} · Showcase
          </PageTitle>
          <PageDescription>
            在锁定的 approved commit 上重跑 Q2，人工观察产品价值，再由独立
            Reviewer 给出非权威建议。
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>

      <DeliveryAuthorityProgress iteration={showcase.iteration} />

      <Workbench className="lg:grid-cols-[minmax(0,1fr)_23rem]">
        <WorkbenchMain>
          <div className="flex flex-col gap-3 p-3">
            <ShowcaseEvidence showcase={showcase} />
          </div>
        </WorkbenchMain>
        <WorkbenchRail>
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-medium">Server 授权的下一步</h2>
              <p className="text-sm text-muted-foreground">
                Browser 与 Desktop 不复制状态机；当前只开放一个 nextAction。
              </p>
            </div>
            <ShowcaseActionPanel
              desktopAvailable={Boolean(bridge)}
              key={actionKey(showcase)}
              nextAction={showcase.nextAction}
              onDecide={decide}
              onRecordEvaluation={recordEvaluation}
              onRecordProductObservation={recordProductObservation}
              onRecordRiskDecision={recordRiskDecision}
              onRunLocal={runLocal}
              pending={pending}
              showcase={showcase}
            />
            {progress ? (
              <p
                aria-live="polite"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Spinner />
                {progress}
              </p>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>操作未完成</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Alert>
              <AlertTitle>人工权威边界</AlertTitle>
              <AlertDescription>
                Q2 和 Reviewer 不能替代领域专家的产品观察；Reviewer 也不能提交
                Accept、Revise 或 Reject。
              </AlertDescription>
            </Alert>
          </div>
        </WorkbenchRail>
      </Workbench>
    </EvidencePage>
  );
}

function workspaceId(state: State<ShowcaseResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Showcase 缺少 Workspace identity。');
  return decodeURIComponent(match[1]);
}

function showcaseRequestId(kind: 'q2' | 'reviewer'): string {
  return `showcase:${kind}:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function actionKey(showcase: ShowcaseResource['data']): string {
  return `${showcase.run.id}:${showcase.nextAction?.kind ?? 'complete'}:${showcase.run.evidenceBundleSha256 ?? 'open'}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const showcaseDecisionMessage: Record<ShowcaseHumanDecision['action'], string> =
  {
    accept: 'Showcase 已接受，Iteration 进入 Respond',
    revise: '反馈已路由，旧 Showcase Attempt 保留',
    reject: 'Showcase 已拒绝，Iteration 已停止',
  };
