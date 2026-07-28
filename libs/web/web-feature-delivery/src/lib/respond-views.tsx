import { useState } from 'react';
import type {
  DecideRespondInput,
  RespondResource,
  RespondResourceData,
  State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  EvidencePage,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  Separator,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
  ToggleGroup,
  ToggleGroupItem,
  Workbench,
  WorkbenchMain,
  WorkbenchRail,
} from '@evidence/ui';
import {
  DeliveryAuthorityProgress,
  iterationStageLabel,
} from './delivery-authority-progress';

export function RespondDetailView({
  resourceState,
}: {
  resourceState: State<RespondResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const respond = state.data;
  const bridge = window.evidenceDesktop;
  const nextAction = respond.nextAction;
  const decisionCandidate =
    nextAction?.kind === 'await_human'
      ? (respond.candidates.find(
          (item) => item.id === nextAction.candidateId,
        ) ?? null)
      : null;

  async function refresh() {
    const refreshed = (await state
      .follow('self')
      .refresh()) as State<RespondResource>;
    setState(refreshed);
  }

  async function runLearner() {
    if (!bridge?.runRespondLearner || pending) return;
    setPending(true);
    setError(null);
    setProgress('正在锁定 accepted Showcase 与 approved commit…');
    try {
      await bridge.runRespondLearner(
        {
          id: respondRequestId(),
          workspaceId: workspaceId(state),
          iterationId: respond.iteration.id,
        },
        (event) => setProgress(event.message),
      );
      await refresh();
      toast.success('Respond Learner 已提出一份 Candidate');
    } catch (caught) {
      setError(errorMessage(caught, 'Respond Learner 无法完成。'));
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function decide(action: 'approve' | 'revise', reason: string) {
    const next = respond.nextAction;
    if (next?.kind !== 'await_human' || pending) return;
    const input: DecideRespondInput = {
      expectedIterationVersion: next.expectedIterationVersion,
      candidateId: next.candidateId,
      candidateSha256: next.candidateSha256,
      authoritySha256: next.authoritySha256,
      action,
      reason,
    };
    setPending(true);
    setError(null);
    try {
      await state.follow('decide').post({ data: input });
      await refresh();
      toast.success(
        action === 'approve'
          ? 'Respond 已由人批准，Iteration 边界完成'
          : '旧 Candidate 已保留，等待新的 Learner 提案',
      );
    } catch (caught) {
      setError(errorMessage(caught, '无法保存 Respond 决定。'));
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
              {respond.iteration.reference} · version{' '}
              {respond.iteration.version}
            </PageEyebrow>
            <Badge>{iterationStageLabel(respond.iteration)}</Badge>
            <Badge variant="outline">
              {respond.candidates.length} Candidates
            </Badge>
          </div>
          <PageTitle className="leading-7">
            {respond.story.reference} · Respond
          </PageTitle>
          <PageDescription>
            只提升本 Story 实际使用且经执行与人工 Showcase
            验证的知识；人工批准后输出一个 next Probe。
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>

      <DeliveryAuthorityProgress iteration={respond.iteration} />

      <Workbench className="lg:grid-cols-[minmax(0,1fr)_23rem]">
        <WorkbenchMain>
          <div className="flex flex-col gap-3 p-3">
            <RespondCandidateHistory respond={respond} />
            <RespondAuthority respond={respond} />
          </div>
        </WorkbenchMain>
        <WorkbenchRail>
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-medium">Server 授权的下一步</h2>
              <p className="text-sm text-muted-foreground">
                Learner 只有提案权；知识确认与完成 Iteration 只能由人执行。
              </p>
            </div>
            {respond.nextAction?.kind === 'run_learner' ? (
              <LearnerAction
                desktopAvailable={Boolean(bridge?.runRespondLearner)}
                onRun={() => void runLearner()}
                pending={pending}
              />
            ) : null}
            {respond.nextAction?.kind === 'await_human' ? (
              <RespondDecisionForm
                candidate={decisionCandidate}
                onDecide={decide}
                pending={pending}
              />
            ) : null}
            {!respond.nextAction ? (
              <Alert>
                <AlertTitle>Iteration learning boundary 已完成</AlertTitle>
                <AlertDescription>
                  next Probe 不会自动进入 Inbox，也不会自动创建下一张 Story。
                </AlertDescription>
              </Alert>
            ) : null}
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
              <AlertTitle>不自动污染权威知识</AlertTitle>
              <AlertDescription>
                deferred / rejected 只保留理由；即使
                promoted，也必须由人批准精确 Candidate。
              </AlertDescription>
            </Alert>
          </div>
        </WorkbenchRail>
      </Workbench>
    </EvidencePage>
  );
}

function LearnerAction({
  desktopAvailable,
  pending,
  onRun,
}: {
  desktopAvailable: boolean;
  pending: boolean;
  onRun: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Badge className="w-fit" variant="outline">
        Read-only Learner
      </Badge>
      <p className="text-sm text-muted-foreground">
        Learner 可读取 approved worktree，但没有命令、写入、批准、commit、merge
        或 push 工具。
      </p>
      <Button
        disabled={!desktopAvailable || pending}
        onClick={onRun}
        type="button"
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? '正在运行…' : '运行 Respond Learner'}
      </Button>
      {!desktopAvailable ? (
        <Alert>
          <AlertDescription>
            请在 Evidence Desktop 中运行本地 Learner。
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function RespondDecisionForm({
  candidate,
  pending,
  onDecide,
}: {
  candidate: RespondResourceData['candidates'][number] | null;
  pending: boolean;
  onDecide: (action: 'approve' | 'revise', reason: string) => Promise<void>;
}) {
  const [action, setAction] = useState<'approve' | 'revise'>('approve');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const valid = Boolean(candidate && reason.trim() && confirmed);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void onDecide(action, reason.trim());
      }}
    >
      <div className="flex flex-col gap-1">
        <Badge className="w-fit" variant="outline">
          Human knowledge decision
        </Badge>
        <h3 className="text-sm font-medium">
          审查 {candidate?.reference ?? 'Candidate'}
        </h3>
        <p className="text-sm text-muted-foreground">
          approve 完成本轮边界；revise 保留旧 Candidate 并重新开放 Learner。
        </p>
      </div>
      <ToggleGroup
        onValueChange={(value) => {
          if (value === 'approve' || value === 'revise') {
            setAction(value);
            setConfirmed(false);
          }
        }}
        type="single"
        value={action}
        variant="outline"
      >
        <ToggleGroupItem value="approve">Approve</ToggleGroupItem>
        <ToggleGroupItem value="revise">Revise</ToggleGroupItem>
      </ToggleGroup>
      <Field data-invalid={!reason.trim()}>
        <FieldLabel htmlFor="respond-decision-reason">决定理由</FieldLabel>
        <FieldDescription>
          明确说明知识处置与 next Probe 为什么可接受或需修订。
        </FieldDescription>
        <Textarea
          aria-invalid={!reason.trim()}
          id="respond-decision-reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          checked={confirmed}
          id="respond-human-authority"
          onCheckedChange={(value) => setConfirmed(value === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor="respond-human-authority">
            我已审查精确 Candidate 与 next Probe
          </FieldLabel>
          <FieldDescription>Learner 不能代替此人工知识决定。</FieldDescription>
        </FieldContent>
      </Field>
      <Button disabled={pending || !valid} type="submit">
        {pending ? <Spinner data-icon="inline-start" /> : null}确认 {action}
      </Button>
    </form>
  );
}

function RespondCandidateHistory({
  respond,
}: {
  respond: RespondResourceData;
}) {
  if (respond.candidates.length === 0) {
    return (
      <Alert>
        <AlertTitle>尚无 Respond Candidate</AlertTitle>
        <AlertDescription>
          accepted Showcase 已锁定，等待本地只读 Learner 提案。
        </AlertDescription>
      </Alert>
    );
  }
  const decisions = new Map(
    respond.decisions.map((item) => [item.candidateId, item]),
  );
  return (
    <div className="flex flex-col gap-3">
      {[...respond.candidates].reverse().map((candidate) => {
        const decision = decisions.get(candidate.id);
        return (
          <Card key={candidate.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{candidate.reference}</CardTitle>
                <Badge
                  variant={
                    decision?.action === 'approve' ? 'default' : 'secondary'
                  }
                >
                  {decision ? decision.action : '等待人工决定'}
                </Badge>
              </div>
              <CardDescription>
                Candidate #{String(candidate.sequence)} ·{' '}
                {candidate.contentSha256}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">已观察结果</h3>
                {candidate.observedOutcomes.map((value) => (
                  <p className="text-sm" key={value}>
                    • {value}
                  </p>
                ))}
              </section>
              <Separator />
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Knowledge response</h3>
                {candidate.promotions.length === 0 ? (
                  <Alert>
                    <AlertTitle>本轮无 promotion</AlertTitle>
                    <AlertDescription>
                      {candidate.noPromotionReason}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kind</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead>Source / target</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidate.promotions.map((promotion, index) => (
                        <TableRow
                          key={`${promotion.sourceRef}:${String(index)}`}
                        >
                          <TableCell>
                            <Badge variant="outline">{promotion.kind}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge>{promotion.decision}</Badge>
                          </TableCell>
                          <TableCell className="max-w-64 break-all text-xs">
                            {promotion.sourceRef}
                            <br />→{' '}
                            {promotion.canonicalTarget ?? 'no authority change'}
                          </TableCell>
                          <TableCell>{promotion.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="flex flex-col gap-2 rounded-lg border p-3">
                  <h3 className="text-sm font-medium">Residual risks</h3>
                  {candidate.residualRisks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">none</p>
                  ) : null}
                  {candidate.residualRisks.map((risk) => (
                    <p className="text-sm" key={risk}>
                      • {risk}
                    </p>
                  ))}
                </section>
                <section className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Next Probe</h3>
                    <Badge variant="outline">不会自动收集</Badge>
                  </div>
                  <p className="text-sm font-medium">
                    {candidate.nextProbe.question}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {candidate.nextProbe.whyNow}
                  </p>
                  <p className="text-sm">
                    第一步 · {candidate.nextProbe.firstAction}
                  </p>
                </section>
              </div>
              {decision ? (
                <Alert>
                  <AlertTitle>人工决定 · {decision.action}</AlertTitle>
                  <AlertDescription>{decision.reason}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RespondAuthority({ respond }: { respond: RespondResourceData }) {
  const facts = [
    ['Story Revision', respond.authority.storyRevisionSha256],
    ['Approved Plan', respond.authority.approvedTaskingPlanSha256],
    ['Pair Manifest', respond.authority.pairManifestSha256],
    ['Approved commit', respond.authority.approvedCommitSha],
    ['Showcase bundle', respond.authority.showcaseEvidenceBundleSha256],
    ['Showcase Review', respond.authority.showcaseReviewSha256],
    ['Showcase accept', respond.authority.showcaseDecisionSha256],
    ['Respond authority', respond.authority.authoritySha256],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Respond 一致性 Authority</CardTitle>
        <CardDescription>
          Candidate 与人工决定都锁定同一 accepted Story 增量。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {facts.map(([label, value]) => (
          <div className="flex min-w-0 flex-col gap-1" key={label}>
            <span className="text-xs font-medium text-muted-foreground">
              {label}
            </span>
            <code className="break-all text-xs">{value}</code>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function workspaceId(state: State<RespondResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Respond 缺少 Workspace identity。');
  return decodeURIComponent(match[1]);
}

function respondRequestId(): string {
  return `respond:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
