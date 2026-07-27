import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  IterationIntakeResource,
  KickoffDecisionAction,
  KickoffDecisionInput,
  KickoffDecisionResultResource,
  KickoffResource,
  State,
  StoryCardResource,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EvidencePage,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  ScrollArea,
  Separator,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Workbench,
  WorkbenchMain,
  WorkbenchRail,
} from '@evidence/ui';

const decisionLabels: Record<KickoffDecisionAction, string> = {
  confirm: '确认',
  revise: '修订',
  split: '拆分',
  defer: '暂缓',
  stop: '停止',
};

export function KickoffDetailView({
  resourceState,
}: {
  resourceState: State<KickoffResource>;
}) {
  const navigate = useNavigate();
  const [kickoffState, setKickoffState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCard, setConfirmedCard] = useState<StoryCardResource | null>(
    null,
  );
  const kickoff = kickoffState.data;
  const proposal = kickoff.currentProposal;
  const bridge = window.evidenceDesktop;
  const candidateHref = embeddedHref(kickoff.iteration, 'candidate');
  const intakeHref = kickoffState.getLink('intake')?.href;

  const refresh = async () => {
    const refreshed = (await kickoffState
      .follow('self')
      .refresh()) as State<KickoffResource>;
    setKickoffState(refreshed);
    return refreshed;
  };

  const invokeAnalyst = async () => {
    if (!bridge?.runKickoffAnalyst) {
      throw new Error(
        '请在 Evidence Desktop 中运行本地 Kickoff Analyst。Browser 不执行 Agent。',
      );
    }
    await bridge.runKickoffAnalyst(
      {
        id: requestId('kickoff'),
        workspaceId: workspaceId(kickoffState),
        iterationId: kickoff.iteration.id,
      },
      (event) => {
        if (event.event === 'progress') setProgress(event.data);
        if (event.event === 'tool-start') {
          setProgress('正在提交受 Frozen Intake 约束的替代 Proposal…');
        }
        if (event.event === 'error') setError(event.data);
      },
    );
  };

  const runAnalyst = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    setProgress('正在基于 Frozen Intake 修订 Proposal…');
    try {
      await invokeAnalyst();
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, 'Kickoff Analyst 无法修订 Proposal。'));
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const decide = async (
    action: KickoffDecisionAction,
    reason: string | null,
  ) => {
    if (!proposal || !kickoffState.getLink('decide') || pending) return;
    setPending(true);
    setError(null);
    try {
      const input: KickoffDecisionInput = {
        proposalId: proposal.id,
        proposalSha256: proposal.contentSha256,
        expectedIterationVersion: kickoff.iteration.version,
        action,
        reason,
      };
      const result = (await kickoffState.follow('decide').post({
        data: input,
      })) as State<KickoffDecisionResultResource>;
      setConfirmedCard(result.data.storyCard);

      if (action === 'revise') {
        if (!bridge?.runKickoffAnalyst) {
          await refresh();
          setError(
            '修订决定已记录。请在 Evidence Desktop 中运行本地 Kickoff Analyst。',
          );
          return;
        }
        setProgress('人工修订决定已记录，正在起草替代 Proposal…');
        await invokeAnalyst();
        await refresh();
        return;
      }

      const refreshed = await refresh();
      if (action === 'confirm') {
        const storyHref =
          embeddedHref(result.data.iteration, 'story') ??
          embeddedHref(refreshed.data.iteration, 'story');
        if (storyHref) navigate(storyHref);
      }
    } catch (caught) {
      setError(errorMessage(caught, '无法记录 Kickoff 人工决定。'));
      throw caught;
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const drafting =
    kickoff.iteration.lifecycle === 'active' &&
    kickoff.iteration.loop === 'kickoff' &&
    kickoff.iteration.stage === 'candidate_drafting';
  const reviewing =
    kickoff.iteration.lifecycle === 'active' &&
    kickoff.iteration.loop === 'kickoff' &&
    kickoff.iteration.stage === 'candidate_review';

  return (
    <EvidencePage>
      <PageHeader>
        <PageHeaderCopy>
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>{kickoff.iteration.reference}</PageEyebrow>
            <Badge>
              {iterationLifecycleLabel(kickoff.iteration.lifecycle)}
            </Badge>
            <Badge variant="outline">Kickoff / Candidate Review</Badge>
          </div>
          <PageTitle>Kickoff 人工确认</PageTitle>
          <PageDescription>
            核对 Frozen Intake 限定的当前 Proposal。只有人工 confirm 才会创建本
            Iteration 唯一的 US-001。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          {candidateHref ? (
            <Button asChild variant="outline">
              <Link to={candidateHref}>返回 Candidate</Link>
            </Button>
          ) : null}
          {intakeHref ? (
            <Button asChild variant="outline">
              <Link to={intakeHref}>Frozen Intake</Link>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      <AuthorityProgress />

      <Workbench>
        <WorkbenchMain>
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <ProvisioningStatus iteration={kickoff.iteration} />

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {progress ? (
                <Alert>
                  <Spinner />
                  <AlertDescription aria-live="polite">
                    {progress}
                  </AlertDescription>
                </Alert>
              ) : null}
              {confirmedCard ? (
                <AuthoritativeStoryCard card={confirmedCard} />
              ) : null}

              {proposal ? (
                <ProposalCard proposal={proposal} />
              ) : drafting ? (
                <Card>
                  <CardHeader>
                    <CardTitle aria-level={2} role="heading">
                      等待替代 Proposal
                    </CardTitle>
                    <CardDescription>
                      上一条 revise 已成为权威记录；本地 Analyst 只能基于 Frozen
                      Intake 与决定历史继续。
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button
                      disabled={pending || !bridge?.runKickoffAnalyst}
                      type="button"
                      onClick={() => void runAnalyst()}
                    >
                      {pending ? <Spinner data-icon="inline-start" /> : null}
                      运行本地 Kickoff Analyst
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Alert>
                  <AlertDescription>
                    当前 Iteration 没有可供人工决定的 Proposal。
                  </AlertDescription>
                </Alert>
              )}

              <KickoffEvidenceTabs kickoff={kickoff} />
            </div>
          </ScrollArea>
        </WorkbenchMain>

        <WorkbenchRail>
          <DecisionPanel
            disabled={!reviewing || !proposal || pending}
            iteration={kickoff.iteration}
            proposal={proposal}
            onDecide={decide}
          />
        </WorkbenchRail>
      </Workbench>
    </EvidencePage>
  );
}

function AuthorityProgress() {
  const steps = [
    ['1', '来源已冻结', '精确 Revision', 'complete'],
    ['2', 'Candidate 已选择', 'Frozen Intake', 'complete'],
    ['3', 'Kickoff 人工决定', '当前阶段', 'current'],
    ['4', '创建 US-001', '仅 confirm', 'pending'],
  ] as const;
  return (
    <ol
      aria-label="Inbox 到 Story 权威流程"
      className="grid shrink-0 overflow-hidden border-b bg-card sm:grid-cols-2 xl:grid-cols-4"
    >
      {steps.map(([number, label, detail, state]) => (
        <li
          className="flex min-w-0 items-center gap-2 border-b px-3 py-2 last:border-b-0 xl:border-r xl:border-b-0 xl:last:border-r-0"
          key={number}
        >
          <Badge variant={state === 'pending' ? 'outline' : 'default'}>
            {number}
          </Badge>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {detail}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProvisioningStatus({
  iteration,
}: {
  iteration: KickoffResource['data']['iteration'];
}) {
  if (iteration.lifecycle === 'provisioning_failed') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Desktop provision 失败：
          {iteration.provisioningFailureSummary ?? '未提供失败摘要。'}
        </AlertDescription>
      </Alert>
    );
  }
  if (iteration.lifecycle === 'provisioning') {
    return (
      <Alert>
        <Spinner />
        <AlertDescription>
          Desktop 正在 provision 隔离分支与工作树。完成前不能进行 Kickoff 决定。
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <AlertDescription>
        <strong>Desktop 隔离工作树已 provision。</strong>
        <span className="mt-1 block text-muted-foreground">
          Server 只保存基准提交、分支名称与有限状态，不接收本地绝对路径。
        </span>
      </AlertDescription>
    </Alert>
  );
}

function ProposalCard({
  proposal,
}: {
  proposal: NonNullable<KickoffResource['data']['currentProposal']>;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {proposalOriginLabel(proposal.origin)}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {proposal.reference}
          </span>
        </div>
        <CardTitle aria-level={2} role="heading">
          {proposal.title}
        </CardTitle>
        <CardDescription>
          Proposal only · {shortHash(proposal.contentSha256)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <AlertDescription>
            当前只是 Proposal，没有 Story 权威。Agent 只能提出替代
            Proposal，不能执行 confirm、revise、split、defer 或 stop。
          </AlertDescription>
        </Alert>
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="角色" value={proposal.role} />
          <Detail
            label="认知模式"
            value={cognitiveModeLabel(proposal.cognitiveMode)}
          />
          <Detail label="问题" value={proposal.problem} wide />
          <Detail label="目标" value={proposal.goal} />
          <Detail label="价值" value={proposal.value} />
        </div>
        <div className="rounded-lg bg-primary/10 p-4 text-sm">
          <p className="mb-1 text-xs font-medium text-primary">
            若人工 confirm，将形成 Lean Story Card
          </p>
          <p>
            作为{proposal.role}，我希望{proposal.goal}，从而{proposal.value}。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function KickoffEvidenceTabs({
  kickoff,
}: {
  kickoff: KickoffResource['data'];
}) {
  return (
    <Tabs defaultValue="intake">
      <TabsList className="w-full" variant="line">
        <TabsTrigger value="intake">Frozen Intake</TabsTrigger>
        <TabsTrigger value="sources">
          冻结来源 · {kickoff.intake.sources.length}
        </TabsTrigger>
        <TabsTrigger value="decisions">
          决定记录 · {kickoff.decisions.length}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="intake">
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              冻结 Candidate
            </CardTitle>
            <CardDescription>
              后续 Proposal 只能在这份自包含 Intake 的业务边界内变化。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CandidateSnapshot candidate={kickoff.intake.candidate} />
            <Separator />
            <Detail
              label="Intake SHA-256"
              value={kickoff.intake.contentSha256}
              mono
            />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="sources">
        <FrozenSources sources={kickoff.intake.sources} />
      </TabsContent>
      <TabsContent value="decisions">
        <DecisionHistory decisions={kickoff.decisions} />
      </TabsContent>
    </Tabs>
  );
}

function DecisionPanel({
  disabled,
  iteration,
  proposal,
  onDecide,
}: {
  disabled: boolean;
  iteration: KickoffResource['data']['iteration'];
  proposal: KickoffResource['data']['currentProposal'];
  onDecide: (
    action: KickoffDecisionAction,
    reason: string | null,
  ) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">记录人工决定</h2>
        <p className="text-xs text-muted-foreground">
          决定按 Proposal hash 与 Iteration version
          并发校验，并永久追加到审计历史。
        </p>
      </div>

      <ConfirmKickoffDialog
        disabled={disabled}
        onConfirm={() => onDecide('confirm', null)}
      />
      <p className="-mt-3 text-center text-xs text-muted-foreground">
        创建 Problem Statement、Lean Story Card 与 baseline Revision v1
      </p>

      <Separator />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">需要其他处置？</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['revise', 'split', 'defer', 'stop'] as const).map((action) => (
            <KickoffDecisionDialog
              action={action}
              disabled={disabled}
              key={action}
              onDecide={onDecide}
            />
          ))}
        </div>
      </div>

      <Separator />
      <dl className="flex flex-col gap-3 text-xs">
        <DecisionDefinition
          action="confirm"
          outcome="创建本轮唯一 US-001，并进入 Understand / TQA。"
        />
        <DecisionDefinition
          action="revise"
          outcome="记录理由，再由本地 Analyst 基于 Frozen Intake 提出替代 Proposal。"
        />
        <DecisionDefinition
          action="split"
          outcome="终止本 Iteration；返回 Inbox 重新提取。"
        />
        <DecisionDefinition action="defer" outcome="终止并保留完整审计证据。" />
        <DecisionDefinition
          action="stop"
          outcome="停止本轮并保留完整审计证据。"
        />
      </dl>

      <Alert>
        <AlertDescription>
          所有 Kickoff 决定只能由当前认证用户触发。Agent 没有人工决定工具。
        </AlertDescription>
      </Alert>

      <dl className="flex flex-col gap-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <dt>Iteration version</dt>
          <dd className="font-mono text-foreground">{iteration.version}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Proposal SHA-256</dt>
          <dd className="font-mono text-foreground">
            {proposal ? shortHash(proposal.contentSha256) : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Story</dt>
          <dd className="font-mono text-foreground">
            {iteration.activeStoryId ? 'US-001' : '尚未创建'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ConfirmKickoffDialog({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmed || disabled) return;
    try {
      await onConfirm();
      setConfirmed(false);
      setOpen(false);
    } catch {
      // The owning workbench renders the authoritative command error.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setConfirmed(false);
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full" disabled={disabled} type="button">
          确认并创建 US-001
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>确认 Story 权威</DialogTitle>
          <DialogDescription>
            此人工决定将原子创建本 Iteration 唯一的 US-001、Problem
            Statement、Lean Story Card 与不含 Scenario 的 baseline Revision v1。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Alert>
              <AlertDescription>
                Candidate selection 本身没有创建 Story。confirm
                一经记录不可改写。
              </AlertDescription>
            </Alert>
            <Field orientation="horizontal">
              <Checkbox
                checked={confirmed}
                id="confirm-story-authority"
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="confirm-story-authority">
                  我确认当前 Proposal 可以成为权威 Story
                </FieldLabel>
                <FieldDescription>
                  baseline Revision v1 不含 Scenario，因此尚不能进入 Tasking 或
                  Pair。
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-5">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={!confirmed || disabled} type="submit">
              创建 US-001
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KickoffDecisionDialog({
  action,
  disabled,
  onDecide,
}: {
  action: Exclude<KickoffDecisionAction, 'confirm'>;
  disabled: boolean;
  onDecide: (
    action: KickoffDecisionAction,
    reason: string | null,
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim() || disabled) return;
    setError(null);
    try {
      await onDecide(action, reason.trim());
      setReason('');
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught, '无法记录 Kickoff 人工决定。'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} type="button" variant="outline">
          {decisionLabels[action]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{decisionLabels[action]}当前 Kickoff</DialogTitle>
          <DialogDescription>
            记录非空人工理由。此决定会永久追加，不会覆盖已有证据。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`kickoff-${action}-reason`}>
                决定理由
              </FieldLabel>
              <Textarea
                aria-invalid={Boolean(error)}
                id={`kickoff-${action}-reason`}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={!reason.trim() || disabled} type="submit">
              记录{decisionLabels[action]}决定
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DecisionDefinition({
  action,
  outcome,
}: {
  action: KickoffDecisionAction;
  outcome: string;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="font-mono font-medium">{action}</dt>
      <dd className="text-muted-foreground">{outcome}</dd>
    </div>
  );
}

function CandidateSnapshot({
  candidate,
}: {
  candidate: IterationIntakeResource['data']['candidate'];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Detail label="Candidate" value={candidate.candidateReference} />
      <Detail
        label="认知模式"
        value={cognitiveModeLabel(candidate.cognitiveMode)}
      />
      <Detail label="角色" value={candidate.role} />
      <Detail label="问题" value={candidate.problem} wide />
      <Detail label="目标" value={candidate.goal} />
      <Detail label="价值" value={candidate.value} />
      <Detail
        label="Candidate SHA-256"
        value={candidate.contentSha256}
        mono
        wide
      />
    </div>
  );
}

function FrozenSources({
  sources,
}: {
  sources: IterationIntakeResource['data']['sources'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          冻结来源
        </CardTitle>
        <CardDescription>
          {sources.length} 个精确、不可变的 Revision 快照。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sources.map((source, index) => (
          <div className="flex flex-col gap-3" key={source.inboxRevisionId}>
            {index > 0 ? <Separator /> : null}
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{source.title}</p>
              <Badge variant="outline">Revision {source.revisionNumber}</Badge>
              <Badge variant="secondary">{source.sourceKind}</Badge>
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {source.contentSha256}
            </p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
              {source.body}
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DecisionHistory({
  decisions,
}: {
  decisions: KickoffResource['data']['decisions'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          人工决定历史
        </CardTitle>
        <CardDescription>Append-only Kickoff 权威证据。</CardDescription>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未记录人工决定。</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {decisions.map((decision) => (
              <li className="rounded-lg border p-3 text-sm" key={decision.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {decisionLabels[decision.action as KickoffDecisionAction] ??
                      decision.action}
                  </Badge>
                  <span className="font-mono text-xs">
                    {decision.reference}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(decision.decidedAt)}
                  </span>
                </div>
                {decision.reason ? (
                  <p className="mt-2">{decision.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function AuthoritativeStoryCard({ card }: { card: StoryCardResource }) {
  return (
    <Alert>
      <AlertDescription>
        <strong>
          {card.reference} · {card.title}
        </strong>
        <span className="mt-1 block">
          Story 权威已创建：作为{card.role}，我希望{card.goal}，从而{card.value}
          。
        </span>
      </AlertDescription>
    </Alert>
  );
}

function Detail({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={
        wide
          ? 'flex min-w-0 flex-col gap-1 md:col-span-2'
          : 'flex min-w-0 flex-col gap-1'
      }
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={
          mono ? 'break-all font-mono text-xs' : 'whitespace-pre-wrap text-sm'
        }
      >
        {value}
      </p>
    </div>
  );
}

function embeddedHref(
  resource: { _links?: Record<string, { href?: string }> },
  relation: string,
): string | undefined {
  return resource._links?.[relation]?.href;
}

function workspaceId(state: State<KickoffResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Kickoff 缺少 Workspace identity。');
  return decodeURIComponent(match[1]);
}

function requestId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function iterationLifecycleLabel(value: string): string {
  return (
    {
      provisioning: 'Provision 中',
      active: 'Active',
      provisioning_failed: 'Provision 失败',
      halted: '已终止',
    }[value] ?? value
  );
}

function proposalOriginLabel(value: string): string {
  return value === 'inbox_candidate' ? 'Inbox Candidate' : '替代 Proposal';
}

function cognitiveModeLabel(value: string): string {
  return (
    {
      clear: '清晰',
      complicated: '繁杂',
      complex: '复杂',
    }[value] ?? value
  );
}

function shortHash(value: string): string {
  return value.length > 22 ? `${value.slice(0, 14)}…${value.slice(-8)}` : value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
