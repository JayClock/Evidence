import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  AnswerClarificationInput,
  NoModelImpactDecisionResource,
  RecordNoModelImpactInput,
  ScenarioProposalResourceData,
  State,
  UnderstandingDecisionInput,
  UnderstandingDecisionResultResource,
  UnderstandingResource,
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EvidencePage,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  Spinner,
  Textarea,
  toast,
  Workbench,
  WorkbenchMain,
  WorkbenchRail,
} from '@evidence/ui';
import {
  DeliveryAuthorityProgress,
  iterationStageLabel,
  shortHash,
} from './delivery-authority-progress';

type ScenarioDraft = ScenarioProposalResourceData['drafts'][number];
type DecisionAction = UnderstandingDecisionInput['action'];

export function UnderstandingDetailView({
  resourceState,
}: {
  resourceState: State<UnderstandingResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>(
    () =>
      resourceState.data.currentScenarioProposal?.drafts.map(({ id }) => id) ??
      [],
  );
  const [answer, setAnswer] = useState('');
  const [reason, setReason] = useState('');
  const [modelReason, setModelReason] = useState('');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const understanding = state.data;
  const proposal = understanding.currentScenarioProposal;
  const selectedDrafts = useMemo(
    () => new Set(selectedDraftIds),
    [selectedDraftIds],
  );
  const bridge = window.evidenceDesktop;

  async function refresh() {
    const refreshed = (await state
      .follow('self')
      .refresh()) as State<UnderstandingResource>;
    setState(refreshed);
    setSelectedDraftIds(
      refreshed.data.currentScenarioProposal?.drafts.map(({ id }) => id) ?? [],
    );
    return refreshed;
  }

  async function runAnalyst() {
    if (!bridge?.runUnderstandingAnalyst || pending) return;
    setPending(true);
    setError(null);
    setProgress('正在澄清当前 Story…');
    try {
      await bridge.runUnderstandingAnalyst(
        {
          id: requestId(),
          workspaceId: workspaceId(state),
          iterationId: understanding.iteration.id,
        },
        (event) => {
          if (event.event === 'progress') setProgress(event.data);
          if (event.event === 'tool-start') setProgress('正在记录提案…');
          if (event.event === 'error') setError(event.data);
        },
      );
      await refresh();
      toast.success('Requirements Analyst 本轮已完成');
    } catch (caught) {
      setError(errorMessage(caught, 'TQA Analyst 无法完成本轮。'));
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!understanding.pendingClarification || !answer.trim() || pending)
      return;
    setPending(true);
    setError(null);
    try {
      const input: AnswerClarificationInput = {
        expectedIterationVersion: understanding.iteration.version,
        answer: answer.trim(),
      };
      await state.follow('answer-question').post({ data: input });
      setAnswer('');
      const refreshed = await refresh();
      toast.success(
        refreshed.getLink('kickoff')
          ? '回答已按 story 路由返回 Kickoff'
          : '领域专家原文回答已记录',
      );
    } catch (caught) {
      setError(errorMessage(caught, '无法记录澄清回答。'));
    } finally {
      setPending(false);
    }
  }

  async function recordNoModelImpact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !state.getLink('record-no-model-impact') ||
      !modelReason.trim() ||
      pending
    )
      return;
    setPending(true);
    setError(null);
    try {
      const input: RecordNoModelImpactInput = {
        expectedIterationVersion: understanding.iteration.version,
        storyId: understanding.story.id,
        storyRevisionId: understanding.storyRevision.id,
        storyRevisionSha256: understanding.storyRevision.contentSha256,
        reason: modelReason.trim(),
      };
      (await state.follow('record-no-model-impact').post({
        data: input,
      })) as State<NoModelImpactDecisionResource>;
      setModelReason('');
      await refresh();
      toast.success('No Model Impact 决定已记录，Tasking 已开放');
    } catch (caught) {
      setError(errorMessage(caught, '无法记录 No Model Impact 决定。'));
    } finally {
      setPending(false);
    }
  }

  async function decide(action: DecisionAction) {
    if (!state.getLink('decide') || pending) return;
    const decisionReason = reason.trim();
    const needsReason =
      action !== 'confirm' ||
      Boolean(proposal && selectedDraftIds.length < proposal.drafts.length);
    if (
      (needsReason && !decisionReason) ||
      (action === 'confirm' && !selectedDraftIds.length)
    )
      return;

    setPending(true);
    setError(null);
    try {
      const input: UnderstandingDecisionInput = {
        expectedIterationVersion: understanding.iteration.version,
        action,
        proposalId: proposal?.id ?? null,
        proposalSha256: proposal?.contentSha256 ?? null,
        selectedDraftIds: action === 'confirm' ? selectedDraftIds : [],
        reason: decisionReason || null,
      };
      (await state.follow('decide').post({
        data: input,
      })) as State<UnderstandingDecisionResultResource>;
      setReason('');
      setConfirmOpen(false);
      await refresh();
      toast.success(decisionMessages[action]);
    } catch (caught) {
      setError(errorMessage(caught, '无法记录 Understand 人工决定。'));
    } finally {
      setPending(false);
    }
  }

  function toggleDraft(draftId: string, checked: boolean) {
    setSelectedDraftIds((current) =>
      checked
        ? current.includes(draftId)
          ? current
          : [...current, draftId]
        : current.filter((id) => id !== draftId),
    );
  }

  const canRun =
    understanding.iteration.lifecycle === 'active' &&
    understanding.iteration.loop === 'understand' &&
    understanding.iteration.stage === 'tqa' &&
    !understanding.pendingClarification;
  const partialSelection = Boolean(
    proposal && selectedDraftIds.length < proposal.drafts.length,
  );
  const storyHref = state.getLink('story')?.href;
  const kickoffHref = state.getLink('kickoff')?.href;
  const taskingHref = state.getLink('tasking')?.href;

  return (
    <EvidencePage>
      <PageHeader>
        <PageHeaderCopy>
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>
              {understanding.iteration.reference} · version{' '}
              {understanding.iteration.version}
            </PageEyebrow>
            <Badge>{iterationStageLabel(understanding.iteration)}</Badge>
            <Badge variant="outline">
              Story Revision v{understanding.storyRevision.revisionNumber}
            </Badge>
          </div>
          <PageTitle>
            {understanding.story.reference} · Understand / TQA
          </PageTitle>
          <PageDescription>
            Requirements Analyst 每轮只能提出一个业务问题或一组完整 Scenario
            Draft；回答、选择与路由决定始终由人类负责。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          {storyHref ? (
            <Button asChild variant="outline">
              <Link to={storyHref}>返回 Story</Link>
            </Button>
          ) : null}
          {kickoffHref ? (
            <Button asChild>
              <Link to={kickoffHref}>返回 Kickoff 修订 Story</Link>
            </Button>
          ) : null}
          {taskingHref ? (
            <Button asChild>
              <Link to={taskingHref}>进入 Tasking / Desk Check</Link>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      <DeliveryAuthorityProgress iteration={understanding.iteration} />

      <Workbench className="lg:grid-cols-[minmax(0,1fr)_20.375rem]">
        <WorkbenchMain>
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <Alert>
              <AlertTitle>{authorityNotice(understanding).title}</AlertTitle>
              <AlertDescription>
                {authorityNotice(understanding).description}
              </AlertDescription>
            </Alert>

            {canRun ? (
              <Card>
                <CardHeader>
                  <CardTitle>运行下一轮 Requirements Analyst</CardTitle>
                  <CardDescription>
                    当前没有 pending question 或待决定 Proposal。Agent 本轮只能
                    ask 或 propose。
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button
                    disabled={pending || !bridge?.runUnderstandingAnalyst}
                    onClick={() => void runAnalyst()}
                    type="button"
                  >
                    {pending ? <Spinner data-icon="inline-start" /> : null}
                    {pending ? '正在运行…' : '运行本地 TQA Analyst'}
                  </Button>
                  {!bridge?.runUnderstandingAnalyst ? (
                    <Alert>
                      <AlertDescription>
                        请在 Evidence Desktop 中继续；Browser 不会回退到 Server
                        Agent。
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {understanding.pendingClarification ? (
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>
                      {understanding.pendingClarification.reference}
                    </Badge>
                    <Badge variant="secondary">
                      {targetLabel(understanding.pendingClarification.target)}
                    </Badge>
                    <Badge variant="outline">PENDING</Badge>
                  </div>
                  <CardTitle>一个待回答的业务问题</CardTitle>
                  <CardDescription>
                    {shortHash(
                      understanding.pendingClarification.contentSha256,
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <blockquote className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 text-base font-medium">
                    {understanding.pendingClarification.question}
                  </blockquote>
                </CardContent>
              </Card>
            ) : null}

            {proposal ? (
              <ScenarioProposal
                onToggleDraft={toggleDraft}
                proposal={proposal}
                selectedDrafts={selectedDrafts}
              />
            ) : understanding.storyRevision.scenarios.length ? (
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>权威 Scenario Set</Badge>
                    <Badge variant="outline">
                      Story Revision v
                      {understanding.storyRevision.revisionNumber}
                    </Badge>
                  </div>
                  <CardTitle>
                    {understanding.storyRevision.scenarios.length} 个 Scenario
                    已确认
                  </CardTitle>
                  <CardDescription>
                    {shortHash(understanding.storyRevision.contentSha256)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {understanding.storyRevision.scenarios.map((scenario) => (
                    <div
                      className="flex items-center gap-2 rounded-lg border p-3"
                      key={scenario.id}
                    >
                      <Badge variant="secondary">{scenario.reference}</Badge>
                      <span className="font-medium">{scenario.title}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <UnderstandHistory understanding={understanding} />
          </div>
        </WorkbenchMain>

        <WorkbenchRail>
          <div className="flex flex-col gap-5 p-4">
            <div>
              <h2 className="text-base font-medium">Understand 人工决定</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                命令锁定 exact Story Revision、Iteration version 与 Proposal
                SHA-256。
              </p>
            </div>

            {understanding.pendingClarification ? (
              <>
                <form onSubmit={(event) => void submitAnswer(event)}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="clarification-answer">
                        领域专家回答
                      </FieldLabel>
                      <FieldDescription>
                        只回答业务规则、用户可见结果或外部交互；Agent 不会代答。
                      </FieldDescription>
                      <Textarea
                        id="clarification-answer"
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder="记录领域专家的完整原文回答…"
                        required
                        value={answer}
                      />
                    </Field>
                    <Button disabled={pending || !answer.trim()} type="submit">
                      {pending ? <Spinner data-icon="inline-start" /> : null}
                      记录原文回答
                    </Button>
                  </FieldGroup>
                </form>
                <FieldGroup>
                  <Field data-invalid={!reason.trim()}>
                    <FieldLabel htmlFor="question-route-reason">
                      不回答并终止本轮的理由
                    </FieldLabel>
                    <FieldDescription>
                      split 或 defer 会将 pending question 标记为 human-waived。
                    </FieldDescription>
                    <Textarea
                      aria-invalid={!reason.trim()}
                      id="question-route-reason"
                      onChange={(event) => setReason(event.target.value)}
                      value={reason}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pending || !reason.trim()}
                      onClick={() => void decide('split')}
                      type="button"
                      variant="destructive"
                    >
                      拆分 Story
                    </Button>
                    <Button
                      disabled={pending || !reason.trim()}
                      onClick={() => void decide('defer')}
                      type="button"
                      variant="outline"
                    >
                      暂缓 Story
                    </Button>
                  </div>
                </FieldGroup>
              </>
            ) : proposal ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                  <Badge>{selectedDraftIds.length}</Badge>
                  <span className="text-sm">
                    已选择 {selectedDraftIds.length} / {proposal.drafts.length}{' '}
                    个 Draft
                  </span>
                </div>
                <Field data-invalid={partialSelection && !reason.trim()}>
                  <FieldLabel htmlFor="understanding-reason">
                    省略 Draft 或其他路由的理由
                  </FieldLabel>
                  <FieldDescription>
                    confirm 全部 Draft 时可留空；其他情况必填。
                  </FieldDescription>
                  <Textarea
                    aria-invalid={partialSelection && !reason.trim()}
                    id="understanding-reason"
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                </Field>
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <Button
                    disabled={
                      pending ||
                      !selectedDraftIds.length ||
                      (partialSelection && !reason.trim())
                    }
                    onClick={() => setConfirmOpen(true)}
                    type="button"
                  >
                    确认 {selectedDraftIds.length} 个 Scenario Draft
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>确认完整 Scenario Set</DialogTitle>
                      <DialogDescription>
                        Server 将原子分配 SC-xxx 并追加不可变 Story Revision。
                      </DialogDescription>
                    </DialogHeader>
                    <Alert>
                      <AlertDescription>
                        本次选择 {selectedDraftIds.length} /{' '}
                        {proposal.drafts.length}个
                        Draft；确认后仍需人工处理模型影响。
                      </AlertDescription>
                    </Alert>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">
                          取消
                        </Button>
                      </DialogClose>
                      <Button
                        disabled={pending}
                        onClick={() => void decide('confirm')}
                        type="button"
                      >
                        确认并追加 Story Revision
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <div className="grid gap-2">
                  {(['continue', 'split', 'defer'] as const).map((action) => (
                    <Button
                      disabled={pending || !reason.trim()}
                      key={action}
                      onClick={() => void decide(action)}
                      type="button"
                      variant={action === 'split' ? 'destructive' : 'outline'}
                    >
                      {decisionLabels[action]}
                    </Button>
                  ))}
                </div>
                <Alert>
                  <AlertDescription>
                    只有人工 confirm 会创建 SC-xxx；存在 Scenario 也不会直接提供
                    Pair admission。
                  </AlertDescription>
                </Alert>
              </>
            ) : understanding.iteration.stage === 'modeling' ? (
              <form onSubmit={(event) => void recordNoModelImpact(event)}>
                <FieldGroup>
                  <Alert>
                    <AlertTitle>只开放显式无模型影响路径</AlertTitle>
                    <AlertDescription>
                      subject=tool · method=none · modelChangeRequired=false。
                      领域影响存在或不确定时不得使用。
                    </AlertDescription>
                  </Alert>
                  <Field data-invalid={!modelReason.trim()}>
                    <FieldLabel htmlFor="no-model-impact-reason">
                      为何此 Story 不需要模型变更
                    </FieldLabel>
                    <FieldDescription>
                      理由会成为不可改写的人类权威证据。
                    </FieldDescription>
                    <Textarea
                      aria-invalid={!modelReason.trim()}
                      id="no-model-impact-reason"
                      onChange={(event) => setModelReason(event.target.value)}
                      required
                      value={modelReason}
                    />
                  </Field>
                  <Button
                    disabled={pending || !modelReason.trim()}
                    type="submit"
                  >
                    记录决定并进入 Tasking
                  </Button>
                </FieldGroup>
              </form>
            ) : (
              <Alert>
                <AlertTitle>当前没有待处理的 Understand 决定</AlertTitle>
                <AlertDescription>
                  继续动作只来自 Server 当前发布的 HAL relation。
                </AlertDescription>
              </Alert>
            )}

            {progress ? (
              <p aria-live="polite" className="text-sm">
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
                Requirements Analyst 只有 ask / propose 能力；answer、Scenario
                与 no-model-impact 决定只能由认证用户触发。
              </AlertDescription>
            </Alert>
            <AuthorityFacts understanding={understanding} />
          </div>
        </WorkbenchRail>
      </Workbench>
    </EvidencePage>
  );
}

function ScenarioProposal({
  proposal,
  selectedDrafts,
  onToggleDraft,
}: {
  proposal: ScenarioProposalResourceData;
  selectedDrafts: Set<string>;
  onToggleDraft: (draftId: string, checked: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{proposal.reference}</Badge>
          <Badge variant="secondary">非权威 Proposal</Badge>
          <Badge variant="outline">{proposal.drafts.length} 个 Draft</Badge>
        </div>
        <CardTitle>完整 Scenario Proposal</CardTitle>
        <CardDescription>{shortHash(proposal.contentSha256)}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend>选择完整 Scenario Set</FieldLegend>
          <FieldDescription>
            省略任一 Draft 时必须记录理由；Draft 本身不可编辑。
          </FieldDescription>
          <FieldGroup data-slot="checkbox-group">
            {proposal.drafts.map((draft) => (
              <ScenarioDraftCard
                checked={selectedDrafts.has(draft.id)}
                draft={draft}
                key={draft.id}
                onCheckedChange={(checked) => onToggleDraft(draft.id, checked)}
              />
            ))}
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  );
}

function ScenarioDraftCard({
  draft,
  checked,
  onCheckedChange,
}: {
  draft: ScenarioDraft;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const checkboxId = `scenario-draft-${draft.id}`;
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <Checkbox
            aria-label={`选择 ${draft.reference}`}
            checked={checked}
            id={checkboxId}
            onCheckedChange={(value) => onCheckedChange(value === true)}
          />
          <FieldLabel htmlFor={checkboxId}>
            <Badge variant="outline">{draft.reference}</Badge>
            {draft.title}
          </FieldLabel>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <ScenarioPhase label="GIVEN" values={draft.given} />
        <ScenarioPhase label="WHEN" values={[draft.when]} />
        <div className="md:col-span-2">
          <ScenarioPhase label="THEN" values={draft.then} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {draft.businessData.map((value) => (
          <Badge key={value} variant="outline">
            {value}
          </Badge>
        ))}
      </CardFooter>
    </Card>
  );
}

function ScenarioPhase({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-sm">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function UnderstandHistory({
  understanding,
}: {
  understanding: UnderstandingResource['data'];
}) {
  const empty =
    !understanding.clarifications.length && !understanding.decisions.length;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>append-only Understand 历史</CardTitle>
        <CardDescription>
          旧回答、Proposal 决定与理由不会被覆盖。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {empty ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>尚无澄清或决定</EmptyTitle>
              <EmptyDescription>
                从一个问题或完整 Scenario Proposal 开始。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {understanding.clarifications.map((item) => (
              <div className="rounded-lg border p-3" key={item.id}>
                <div className="flex flex-wrap gap-2">
                  <Badge>{item.reference}</Badge>
                  <Badge variant="outline">{statusLabel(item.status)}</Badge>
                  <Badge variant="secondary">{targetLabel(item.target)}</Badge>
                </div>
                <p className="mt-2 text-sm font-medium">{item.question}</p>
                {item.answer ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    回答：{item.answer}
                  </p>
                ) : null}
                {item.waivedReason ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    人工放弃：{item.waivedReason}
                  </p>
                ) : null}
              </div>
            ))}
            {understanding.decisions.map((decision) => (
              <div className="rounded-lg border p-3" key={decision.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{decision.reference}</Badge>
                  <Badge variant="secondary">
                    {decisionLabels[decision.action]}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortHash(decision.contentSha256)}
                  </span>
                </div>
                {decision.reason ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {decision.reason}
                  </p>
                ) : null}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AuthorityFacts({
  understanding,
}: {
  understanding: UnderstandingResource['data'];
}) {
  const facts = [
    [
      'Iteration',
      `${understanding.iteration.reference} · v${understanding.iteration.version}`,
    ],
    ['Story', understanding.story.reference],
    [
      'Story Revision',
      `v${understanding.storyRevision.revisionNumber} · ${shortHash(understanding.storyRevision.contentSha256)}`,
    ],
    [
      'Scenario Proposal',
      understanding.currentScenarioProposal
        ? shortHash(understanding.currentScenarioProposal.contentSha256)
        : 'none',
    ],
    [
      'Pending question',
      understanding.pendingClarification?.reference ?? 'none',
    ],
  ];
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">并发锁定事实</h3>
      <dl className="flex flex-col gap-2 text-xs">
        {facts.map(([label, value]) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border p-2.5"
            key={label}
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="max-w-[12rem] break-all text-right font-mono">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function authorityNotice(understanding: UnderstandingResource['data']) {
  if (understanding.iteration.lifecycle === 'halted')
    return {
      title: '本 Iteration 已由人工停止',
      description: '已有澄清、Proposal 与决定仍可审计，但 Agent 不会继续本轮。',
    };
  if (understanding.pendingClarification)
    return {
      title: '当前有且只有一个 pending clarification',
      description:
        '回答或人工 split / defer 前，Agent 不能再次 ask，也不能提出 Scenario Proposal。',
    };
  if (understanding.currentScenarioProposal)
    return {
      title: '当前是非权威 Scenario Proposal',
      description:
        '只有人工可以选择 Draft 并执行 confirm / continue / split / defer。',
    };
  if (understanding.iteration.stage === 'modeling')
    return {
      title: '完整 Scenario Set 已由人工确认',
      description:
        '不可变 Story Revision 已追加；进入 Tasking 前仍需显式处理模型影响。',
    };
  return {
    title: 'Understand authority 已记录',
    description: '下一步只由 Server 当前发布的 HAL relation 决定。',
  };
}

function workspaceId(state: State<UnderstandingResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Understanding 缺少 Workspace identity。');
  return decodeURIComponent(match[1]);
}

function requestId(): string {
  return `tqa:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function targetLabel(value: string): string {
  return (
    {
      business_context: '业务上下文',
      story: 'Story 修正',
      history: '历史补充',
    }[value] ?? value
  );
}

function statusLabel(value: string): string {
  return (
    { pending: '等待回答', answered: '已回答', waived: '人工放弃' }[value] ??
    value
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const decisionLabels: Record<DecisionAction, string> = {
  confirm: '确认 Scenario Set',
  continue: '继续澄清',
  split: '拆分 Story',
  defer: '暂缓 Story',
};

const decisionMessages: Record<DecisionAction, string> = {
  confirm: 'Scenario Set 已确认并追加新的 Story Revision',
  continue: '已返回 TQA，旧 Proposal 保留为历史证据',
  split: 'Story 已拆分，本 Iteration 已停止',
  defer: 'Story 已暂缓，本 Iteration 已停止',
};
