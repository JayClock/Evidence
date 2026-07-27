import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  DecidePairInput,
  DesktopPairDecisionAction,
  PairActionResultResource,
  PairLocalReview,
  PairResource,
  State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EvidencePage,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
} from '@evidence/ui';
import {
  ApprovalAuthority,
  ApprovedAuthority,
  ExceptionAuthority,
  RunningAuthority,
} from './pair-authority-panels';
import {
  PairAuthorityProgress,
  PairEvidenceTabs,
  PairFacts,
  PairRunNavigation,
  ServerActionStrip,
} from './pair-evidence';
import {
  allowedPairRoute,
  pairAuthorityTitle,
  pairCheckpointLabel,
  pairDecisionLabel,
  pairDescription,
  pairErrorMessage,
  pairRequest,
  pairRequestId,
  pairStatusLabel,
  pairTitle,
  reviewMatchesManifest,
} from './pair-workbench-format';

export function PairDetailView({
  resourceState,
}: {
  resourceState: State<PairResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [commitMessage, setCommitMessage] = useState(
    `feat(desktop): implement ${resourceState.data.story.reference.toLowerCase()}`,
  );
  const [review, setReview] = useState<PairLocalReview | null>(null);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState(
    resourceState.data.run.status === 'approval_required' ? 'diff' : 'timeline',
  );
  const activeRequestId = useRef<string | null>(null);
  const pair = state.data;
  const bridge = window.evidenceDesktop;

  async function refresh() {
    const refreshed = (await state
      .follow('self')
      .refresh()) as State<PairResource>;
    setState(refreshed);
    return refreshed;
  }

  async function resume() {
    if (!bridge?.resumePair || pending || pair.run.status !== 'running') return;
    const id = pairRequestId();
    activeRequestId.current = id;
    setPending(true);
    setError(null);
    setProgress('正在取得受限 Pair lease…');
    try {
      await bridge.resumePair(pairRequest(pair, id), (event) =>
        setProgress(event.message),
      );
      await refresh();
    } catch (caught) {
      setError(pairErrorMessage(caught, 'Pair 无法继续。'));
    } finally {
      activeRequestId.current = null;
      setPending(false);
      setProgress(null);
    }
  }

  async function loadReview() {
    if (!bridge?.reviewPair || !pair.manifest || pending) return;
    setPending(true);
    setError(null);
    setAuthorityConfirmed(false);
    try {
      const loaded = await bridge.reviewPair({
        ...pairRequest(pair, pairRequestId()),
        expectedManifestSha256: pair.manifest.contentSha256,
      });
      setReview(loaded);
      setEvidenceTab('diff');
      if (!reviewMatchesManifest(loaded, pair.manifest)) {
        setError('本地 Story Diff 与当前 Manifest 不匹配；不能执行编码审批。');
      }
    } catch (caught) {
      setError(pairErrorMessage(caught, '无法加载完整本地 Story Diff。'));
    } finally {
      setPending(false);
    }
  }

  async function route(action: DesktopPairDecisionAction) {
    if (!allowedPairRoute(pair, action) || !reason.trim() || pending) return;
    setPending(true);
    setError(null);
    setProgress(`正在记录 ${pairDecisionLabel(action)}…`);
    try {
      if (bridge?.decidePair) {
        const id = pairRequestId();
        activeRequestId.current = id;
        await bridge.decidePair(
          {
            ...pairRequest(pair, id),
            action,
            reason: reason.trim(),
            resume: action !== 'back_tasking' && action !== 'cancel',
          },
          (event) => setProgress(event.message),
        );
      } else {
        const input: DecidePairInput = {
          expectedPairVersion:
            pair.nextAction?.expectedPairVersion ?? pair.run.version,
          action,
          reason: reason.trim(),
          manifestSha256: null,
          diffSha256: null,
          commitSha: null,
        };
        (await state
          .follow('decide')
          .post({ data: input })) as State<PairActionResultResource>;
      }
      setReason('');
      invalidateReview();
      await refresh();
    } catch (caught) {
      setError(pairErrorMessage(caught, '无法记录 Pair 人工路由。'));
    } finally {
      activeRequestId.current = null;
      setPending(false);
      setProgress(null);
    }
  }

  async function approve() {
    if (
      !bridge?.approvePair ||
      !pair.manifest ||
      !review ||
      !reviewMatchesManifest(review, pair.manifest) ||
      !authorityConfirmed ||
      !reason.trim() ||
      !commitMessage.trim() ||
      pending
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await bridge.approvePair({
        ...pairRequest(pair, pairRequestId()),
        expectedManifestSha256: review.manifestSha256,
        expectedDiffSha256: review.diffSha256,
        commitMessage: commitMessage.trim(),
        reason: reason.trim(),
      });
      setReason('');
      setAuthorityConfirmed(false);
      await refresh();
    } catch (caught) {
      setError(pairErrorMessage(caught, 'Pair 批准或本地 commit 创建失败。'));
    } finally {
      setPending(false);
    }
  }

  function invalidateReview() {
    setReview(null);
    setAuthorityConfirmed(false);
    setEvidenceTab('timeline');
  }

  function cancelController() {
    if (activeRequestId.current && bridge?.cancelPair) {
      void bridge.cancelPair(activeRequestId.current);
    }
  }

  const storyHref = state.getLink('story')?.href;
  const taskingHref = state.getLink('tasking')?.href;

  return (
    <EvidencePage>
      <PageHeader>
        <PageHeaderCopy>
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>
              EVD-005 · {pair.run.reference} · version {pair.run.version}
            </PageEyebrow>
            <Badge>{pairStatusLabel(pair.run.status)}</Badge>
            <Badge variant="outline">
              {pairCheckpointLabel(pair.run.checkpoint)}
            </Badge>
          </div>
          <PageTitle>
            {pair.story.reference} · {pairTitle(pair.run.status)}
          </PageTitle>
          <PageDescription>{pairDescription(pair.run.status)}</PageDescription>
        </PageHeaderCopy>
        <PageActions>
          {storyHref ? (
            <Button asChild variant="outline">
              <Link to={storyHref}>返回 Story</Link>
            </Button>
          ) : null}
          {taskingHref ? (
            <Button asChild variant="outline">
              <Link to={taskingHref}>查看 Approved Plan</Link>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      <PairAuthorityProgress pair={pair} />

      <div className="grid min-h-[46rem] shrink-0 overflow-hidden bg-card xl:min-h-0 xl:flex-1 xl:grid-cols-[14.125rem_minmax(0,1fr)_19rem]">
        <PairRunNavigation pair={pair} />
        <div className="min-h-0 overflow-y-auto bg-secondary">
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <ServerActionStrip pair={pair} />
            <Alert>
              <AlertTitle>Server 只保存受限执行事实</AlertTitle>
              <AlertDescription>
                角色、相对 changed paths、终止状态、exit
                code、hash、字节数与预算可共享；源码、完整 Diff、stdout / stderr
                正文、Prompt、消息、Session、推理、凭据与绝对路径留在 Desktop。
              </AlertDescription>
            </Alert>
            <PairEvidenceTabs
              onTabChange={setEvidenceTab}
              pair={pair}
              review={review}
              tab={evidenceTab}
            />
          </div>
        </div>

        <aside className="min-h-0 border-t bg-card xl:overflow-y-auto xl:border-t-0 xl:border-l">
          <div className="flex flex-col gap-5 p-4">
            <div>
              <h2 className="text-base font-medium">
                {pairAuthorityTitle(pair.run.status)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Desktop 只执行 Server 发布的 nextAction；Driver
                不能运行命令或推进状态。
              </p>
            </div>

            {pair.run.status === 'running' ? (
              <RunningAuthority
                desktopAvailable={Boolean(bridge?.resumePair)}
                nextAction={pair.nextAction}
                onResume={resume}
                pending={pending}
              />
            ) : null}
            {pair.run.status === 'exception' && pair.currentException ? (
              <ExceptionAuthority
                exception={pair.currentException}
                onReasonChange={setReason}
                onRoute={route}
                pending={pending}
                reason={reason}
              />
            ) : null}
            {pair.run.status === 'approval_required' && pair.manifest ? (
              <ApprovalAuthority
                authorityConfirmed={authorityConfirmed}
                commitMessage={commitMessage}
                desktopAvailable={Boolean(
                  bridge?.reviewPair && bridge?.approvePair,
                )}
                manifest={pair.manifest}
                onApprove={approve}
                onAuthorityChange={setAuthorityConfirmed}
                onCommitMessageChange={setCommitMessage}
                onLoadReview={loadReview}
                onReasonChange={setReason}
                onRoute={route}
                pending={pending}
                reason={reason}
                review={review}
              />
            ) : null}
            {pair.run.status === 'approved' ? (
              <ApprovedAuthority pair={pair} />
            ) : null}
            {pair.run.status === 'cancelled' ? (
              <Alert>
                <AlertTitle>Pair 已取消</AlertTitle>
                <AlertDescription>
                  旧 Plan、PairRun、Manifest revision
                  与人工决定保持不可变；没有下一自动动作。
                </AlertDescription>
              </Alert>
            ) : null}

            {progress ? (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {progress}
              </p>
            ) : null}
            {pending && activeRequestId.current && bridge?.cancelPair ? (
              <Button
                onClick={cancelController}
                type="button"
                variant="outline"
              >
                停止本地 Controller
              </Button>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>操作未完成</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Alert>
              <AlertTitle>Pair 人工权威边界</AlertTitle>
              <AlertDescription>
                接受只创建一个本地 commit；不会自动 Showcase、Respond、merge 或
                push。所有退回与取消路由都要求理由并追加决定。
              </AlertDescription>
            </Alert>
            <PairFacts pair={pair} />
          </div>
        </aside>
      </div>
    </EvidencePage>
  );
}
