import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ApprovedTaskingPlanData,
  DeskCheckAction,
  DeskCheckDecisionInput,
  DeskCheckDecisionResultResource,
  State,
  TaskingResource,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

const returnActions: DeskCheckAction[] = [
  'revise',
  'architecture_gap',
  'process_gap',
  'scenario_gap',
];

type CandidatePlan =
  | NonNullable<TaskingResource['data']['currentCandidate']>
  | ApprovedTaskingPlanData['plan'];

export function TaskingDetailView({
  resourceState,
}: {
  resourceState: State<TaskingResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const navigate = useNavigate();
  const tasking = state.data;
  const candidate = tasking.currentCandidate;
  const approvedPlan = tasking.approvedPlan;
  const reviewPlan = candidate ?? approvedPlan?.plan ?? null;
  const bridge = window.evidenceDesktop;

  async function refresh() {
    const refreshed = (await state
      .follow('self')
      .refresh()) as State<TaskingResource>;
    setState(refreshed);
    return refreshed;
  }

  async function runAnalyst() {
    if (!bridge?.runTaskingAnalyst || pending) return;
    setPending(true);
    setError(null);
    setProgress('正在准备受限 Nx project catalog…');
    try {
      await bridge.runTaskingAnalyst(
        {
          id: requestId(),
          workspaceId: workspaceId(state),
          iterationId: tasking.iteration.id,
        },
        (event) => {
          if (event.event === 'progress') setProgress(event.data);
          if (event.event === 'tool-start') {
            setProgress('正在验证并记录完整 Tasking Candidate…');
          }
          if (event.event === 'error') setError(event.data);
        },
      );
      await refresh();
      toast.success('Tasking Analyst 已提出完整 Candidate');
    } catch (caught) {
      setError(errorMessage(caught, 'Tasking Analyst 无法完成本轮。'));
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function startPair() {
    const pairHref = state.getLink('pair')?.href;
    if (!bridge?.startPair || !pairHref || pending) return;
    setPending(true);
    setError(null);
    setProgress('正在启动锁定的 Pair execution plan…');
    try {
      await bridge.startPair(
        {
          id: pairRequestId(),
          workspaceId: workspaceId(state),
          iterationId: tasking.iteration.id,
        },
        (event) => setProgress(event.message),
      );
      navigate(appPath(pairHref));
    } catch (caught) {
      setError(errorMessage(caught, '无法启动 Approved Pair Plan。'));
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function decide(action: DeskCheckAction) {
    if (!candidate || !state.getLink('decide') || pending) return;
    if (action !== 'approve' && !reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      const input: DeskCheckDecisionInput = {
        expectedIterationVersion: tasking.iteration.version,
        candidateId: candidate.id,
        candidateSha256: candidate.contentSha256,
        action,
        reason: action === 'approve' ? null : reason.trim(),
      };
      (await state.follow('decide').post({
        data: input,
      })) as State<DeskCheckDecisionResultResource>;
      setReason('');
      setApprovalOpen(false);
      setAuthorityConfirmed(false);
      await refresh();
      toast.success(decisionMessages[action]);
    } catch (caught) {
      setError(errorMessage(caught, '无法保存 Desk Check 决定。'));
    } finally {
      setPending(false);
    }
  }

  function changeApprovalOpen(open: boolean) {
    setApprovalOpen(open);
    if (!open) setAuthorityConfirmed(false);
  }

  const canDraft =
    tasking.iteration.lifecycle === 'active' &&
    tasking.iteration.loop === 'tasking' &&
    ['drafting', 'knowledge_gap'].includes(tasking.iteration.stage);
  const canStartPair =
    tasking.iteration.loop === 'tasking' &&
    tasking.iteration.stage === 'approved' &&
    Boolean(approvedPlan);

  return (
    <EvidencePage>
      <PageHeader className="px-4 pt-3.5 pb-[0.6875rem]">
        <PageHeaderCopy>
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>
              {tasking.iteration.reference} · version{' '}
              {tasking.iteration.version}
            </PageEyebrow>
            <Badge>{iterationStageLabel(tasking.iteration)}</Badge>
            <Badge variant="outline">
              Story Revision v{tasking.storyRevision.revisionNumber}
            </Badge>
          </div>
          <PageTitle className="leading-7">
            {tasking.story.reference} · Tasking / Desk Check
          </PageTitle>
          <PageDescription>
            完整 Candidate 锁定 Scenario、Nx ownership、v3
            process、命令、质量门、TASK 与 Pair 预算。
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>

      <DeliveryAuthorityProgress iteration={tasking.iteration} />

      <Workbench className="lg:grid-cols-[minmax(0,1fr)_21.25rem]">
        <WorkbenchMain>
          <div className="flex flex-col gap-2.5 p-3">
            <Alert>
              <AlertTitle>
                {approvedPlan
                  ? 'Approved Tasking Plan v2 已锁定'
                  : candidate
                    ? 'Tasking Candidate 仍是非权威计划'
                    : '等待完整 Tasking Candidate'}
              </AlertTitle>
              <AlertDescription>
                {approvedPlan
                  ? 'Desk Check 只创建不可变 Approved Plan，不执行代码。Desktop 必须显式启动 Pair。'
                  : 'Tasking Analyst 只有 propose capability，不能执行 Desk Check；Browser 不会运行 Server Pi fallback。'}
                {tasking.noModelImpactDecision ? (
                  <span className="mt-2 flex items-center gap-2 text-xs">
                    <Badge>{tasking.noModelImpactDecision.reference}</Badge>
                    <span>{tasking.noModelImpactDecision.reason}</span>
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>

            {reviewPlan ? (
              <CandidateReview
                plan={reviewPlan}
                approved={Boolean(approvedPlan)}
              />
            ) : (
              <Empty className="min-h-64 rounded-xl border bg-card">
                <EmptyHeader>
                  <EmptyTitle>尚无 Tasking Candidate</EmptyTitle>
                  <EmptyDescription>
                    本地 Tasking Analyst 必须一次提交完整计划，不能逐段补齐。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </WorkbenchMain>

        <WorkbenchRail>
          <div className="flex flex-col gap-2.5 p-3">
            <div>
              <h2 className="text-base font-medium">
                {approvedPlan ? 'Approved Tasking Plan' : 'Human Desk Check'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                批准锁定 exact Candidate；所有返回路由都保留旧证据并要求理由。
              </p>
            </div>

            {canDraft ? (
              <div className="flex flex-col gap-3">
                <Alert>
                  <AlertDescription>
                    当前可以运行一次本地 Tasking Analyst，生成新的完整
                    Candidate。
                  </AlertDescription>
                </Alert>
                <Button
                  disabled={pending || !bridge?.runTaskingAnalyst}
                  onClick={() => void runAnalyst()}
                  type="button"
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  {pending ? '正在运行…' : '运行本地 Tasking Analyst'}
                </Button>
                {!bridge?.runTaskingAnalyst ? (
                  <Alert>
                    <AlertDescription>
                      请在 Evidence Desktop 中继续；Browser 不会回退到 Server
                      Agent。
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}

            {candidate && tasking.iteration.stage === 'desk_check' ? (
              <>
                <DeskCheckSummary candidate={candidate} />
                <Field>
                  <FieldLabel htmlFor="desk-check-reason">
                    修订或缺口路由理由
                  </FieldLabel>
                  <FieldDescription>
                    approve 可留空；revise、architecture_gap、process_gap、
                    scenario_gap 必填。
                  </FieldDescription>
                  <Textarea
                    id="desk-check-reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="明确说明需要修正的计划、知识或 Scenario 边界…"
                    value={reason}
                  />
                </Field>
                <ApprovalDialog
                  candidate={candidate}
                  confirmed={authorityConfirmed}
                  disabled={pending}
                  onConfirmedChange={setAuthorityConfirmed}
                  onOpenChange={changeApprovalOpen}
                  onSubmit={() => void decide('approve')}
                  open={approvalOpen}
                />
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {returnActions.map((action) => (
                    <Button
                      disabled={pending || !reason.trim()}
                      key={action}
                      onClick={() => void decide(action)}
                      type="button"
                      variant={
                        action === 'scenario_gap' ? 'destructive' : 'outline'
                      }
                    >
                      {decisionLabels[action]}
                    </Button>
                  ))}
                </div>
                <Alert>
                  <AlertDescription>
                    approve → tasking/approved；revise → drafting；architecture
                    / process gap → knowledge_gap；scenario gap →
                    understand/tqa。
                  </AlertDescription>
                </Alert>
              </>
            ) : null}

            {approvedPlan ? (
              <ApprovedPlanCard
                approvedPlan={approvedPlan}
                canStartPair={canStartPair}
                desktopAvailable={Boolean(bridge?.startPair)}
                pending={pending}
                onStartPair={startPair}
              />
            ) : null}

            {progress ? (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {progress}
              </p>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>操作未完成</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <DeskCheckHistory decisions={tasking.decisions} />
            <Alert>
              <AlertTitle>人工权威边界</AlertTitle>
              <AlertDescription>
                Tasking Analyst 只有 propose_tasking capability。Desk Check
                及所有 gap 路由只能由当前认证用户触发。
              </AlertDescription>
            </Alert>
            <TaskingFacts tasking={tasking} />
          </div>
        </WorkbenchRail>
      </Workbench>
    </EvidencePage>
  );
}

function CandidateReview({
  plan,
  approved,
}: {
  plan: CandidatePlan;
  approved: boolean;
}) {
  return (
    <>
      <TaskingTestsCard approved={approved} plan={plan} />
      <ProcessPlanCard plan={plan} />
      <PlanEvidenceDisclosure plan={plan} />
    </>
  );
}

function TaskingTestsCard({
  plan,
  approved,
}: {
  plan: CandidatePlan;
  approved: boolean;
}) {
  const q2Count = plan.tests.filter(({ quadrant }) => quadrant === 'Q2').length;
  return (
    <Card size="sm">
      <CardHeader className="border-b !pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{plan.reference}</Badge>
          <Badge variant={approved ? 'default' : 'secondary'}>
            {approved ? 'Approved Plan' : '非权威 Candidate'}
          </Badge>
          <Badge variant="outline">
            Q2 × {q2Count} · Q1 × {plan.tests.length - q2Count}
          </Badge>
        </div>
        <CardTitle>Q1 / Q2 测试清单 · {plan.tests.length}</CardTitle>
        <CardDescription>
          每个 Scenario Then 有独立 Q2；公共 Q1 去重并支撑 Q2。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TEST</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>行为意图</TableHead>
              <TableHead>Scenario / Ownership</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.tests.map((test) => (
              <TableRow key={test.id}>
                <TableCell className="font-mono text-xs">{test.id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{test.quadrant}</Badge>
                </TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  <p className="text-xs font-medium">{test.intent}</p>
                  {test.scenarioOutcome ? (
                    <p className="mt-1 line-clamp-1 text-[0.6875rem] text-muted-foreground">
                      Then：{test.scenarioOutcome}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="min-w-44 whitespace-normal text-xs">
                  <p>{test.scenarioIds.join(', ') || '公共 Q1'}</p>
                  <code className="text-[0.6875rem] text-muted-foreground">
                    {test.projectId ?? test.processId}
                  </code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProcessPlanCard({ plan }: { plan: CandidatePlan }) {
  return (
    <Card size="sm">
      <CardHeader className="border-b !pb-3">
        <CardTitle>流程与命令 · {plan.processes.length}</CardTitle>
        <CardDescription>
          每个技术边界唯一匹配的 v3 test process。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>v3 test process</TableHead>
              <TableHead>聚焦命令与质量门</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.processes.map((process) => (
              <TableRow key={process.runtimePlanId}>
                <TableCell className="font-mono text-xs">
                  {process.runtimePlanId}
                </TableCell>
                <TableCell className="min-w-52 whitespace-normal">
                  <p className="text-xs font-medium">
                    {process.processId} · v{process.processVersion}
                  </p>
                  <code className="text-[0.6875rem] text-muted-foreground">
                    {shortHash(process.definitionSha256)}
                  </code>
                </TableCell>
                <TableCell className="min-w-72 whitespace-normal">
                  <div className="flex flex-col gap-1 font-mono text-[0.6875rem]">
                    {process.focusedCommands.map(({ command }) => (
                      <code className="break-all" key={command}>
                        {command}
                      </code>
                    ))}
                    {process.qualityGates.map(({ command }) => (
                      <code
                        className="break-all text-muted-foreground"
                        key={command}
                      >
                        Gate · {command}
                      </code>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PlanEvidenceDisclosure({ plan }: { plan: CandidatePlan }) {
  return (
    <Collapsible>
      <Card size="sm">
        <CardHeader>
          <CollapsibleTrigger asChild>
            <Button className="w-full justify-between" variant="ghost">
              TASK 与锁定证据
              <Badge variant="outline">TASK {plan.tasks.length} · 证据 6</Badge>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>TASK</TableHead>
                  <TableHead>TEST</TableHead>
                  <TableHead>实现意图</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-mono text-xs">
                      {task.id}
                    </TableCell>
                    <TableCell className="text-xs">
                      {task.testIds.join(', ')}
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs">
                      {task.description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="grid gap-2 sm:grid-cols-2">
              <EvidenceFact
                label="Story Revision"
                value={shortHash(plan.storyRevisionSha256)}
              />
              <EvidenceFact
                label="No Model Impact"
                value={shortHash(plan.noModelImpactDecisionSha256)}
              />
              <EvidenceFact
                label="Git baseline"
                value={shortHash(plan.baseCommitSha)}
              />
              <EvidenceFact
                label="Project catalog"
                value={shortHash(plan.projectCatalogSha256)}
              />
              <EvidenceFact
                label="Pair budget policy"
                value={`${plan.executionBudget.policyId} v${plan.executionBudget.policyVersion} · Agent ${plan.executionBudget.maxAgentCalls} · checkpoint ${plan.executionBudget.maxCheckpoints}`}
              />
              <EvidenceFact
                label="Candidate SHA-256"
                value={shortHash(plan.contentSha256)}
              />
            </dl>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function SmallFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 p-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-mono">{value}</dd>
    </div>
  );
}

function EvidenceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs">{value}</dd>
    </div>
  );
}

function DeskCheckSummary({
  candidate,
}: {
  candidate: NonNullable<TaskingResource['data']['currentCandidate']>;
}) {
  const q2 = candidate.tests.filter(({ quadrant }) => quadrant === 'Q2').length;
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">待批准 Candidate</span>
        <code className="text-xs">{candidate.reference}</code>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
        <SmallFact
          label="Q2 / Q1"
          value={`${q2} / ${candidate.tests.length - q2}`}
        />
        <SmallFact label="TASK" value={String(candidate.tasks.length)} />
        <SmallFact
          label="Process"
          value={`${candidate.processes.length} · v3`}
        />
        <SmallFact
          label="Gate"
          value={String(
            candidate.processes.reduce(
              (sum, process) => sum + process.qualityGates.length,
              0,
            ),
          )}
        />
      </dl>
    </div>
  );
}

function ApprovalDialog({
  candidate,
  open,
  confirmed,
  disabled,
  onOpenChange,
  onConfirmedChange,
  onSubmit,
}: {
  candidate: NonNullable<TaskingResource['data']['currentCandidate']>;
  open: boolean;
  confirmed: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmedChange: (confirmed: boolean) => void;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmed && !disabled) onSubmit();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button onClick={() => onOpenChange(true)} type="button">
        批准精确计划
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>批准精确 Tasking Plan</DialogTitle>
          <DialogDescription>
            Server 将重新验证 Candidate 与所有锁定输入，并原子创建不可变
            Approved Plan。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Alert>
              <AlertDescription>
                {candidate.reference} · {shortHash(candidate.contentSha256)} ·
                下一状态 tasking / approved。此决定不会写代码或执行命令。
              </AlertDescription>
            </Alert>
            <Field orientation="horizontal">
              <Checkbox
                checked={confirmed}
                id="confirm-tasking-authority"
                onCheckedChange={(value) => onConfirmedChange(value === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="confirm-tasking-authority">
                  我已检查 Scenario → TEST → TASK 追踪、Nx ownership、v3
                  process、命令与质量门，并确认批准这张精确 Candidate。
                </FieldLabel>
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
              {disabled ? <Spinner data-icon="inline-start" /> : null}
              确认批准计划
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApprovedPlanCard({
  approvedPlan,
  canStartPair,
  desktopAvailable,
  pending,
  onStartPair,
}: {
  approvedPlan: NonNullable<TaskingResource['data']['approvedPlan']>;
  canStartPair: boolean;
  desktopAvailable: boolean;
  pending: boolean;
  onStartPair: () => Promise<void>;
}) {
  const budget = approvedPlan.plan.executionBudget;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-primary/5 p-3">
      <div>
        <Badge>PLAN v{approvedPlan.plan.planVersion} 已批准</Badge>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {shortHash(approvedPlan.contentSha256)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <SmallFact label="Agent calls" value={`最多 ${budget.maxAgentCalls}`} />
        <SmallFact
          label="Checkpoints"
          value={`最多 ${budget.maxCheckpoints}`}
        />
        <SmallFact
          label="单命令 timeout"
          value={durationLabel(budget.commandTimeoutMs)}
        />
        <SmallFact
          label="重复 fingerprint"
          value={`最多 ${budget.maxRetriesPerFingerprint}`}
        />
      </dl>
      {canStartPair ? (
        <Button
          disabled={pending || !desktopAvailable}
          onClick={() => void onStartPair()}
          type="button"
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? '正在启动 Pair…' : '在 Desktop 启动 Approved Pair Plan'}
        </Button>
      ) : null}
      {canStartPair && !desktopAvailable ? (
        <Alert>
          <AlertDescription>
            请在 Evidence Desktop 的隔离 Iteration worktree 中启动 Pair；Browser
            只能查看 Server evidence。
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function DeskCheckHistory({
  decisions,
}: {
  decisions: TaskingResource['data']['decisions'];
}) {
  if (!decisions.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Desk Check 历史</h3>
      {decisions.map((decision) => (
        <div className="rounded-lg border p-3" key={decision.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{decision.reference}</Badge>
            <Badge variant="outline">{decisionLabels[decision.action]}</Badge>
          </div>
          {decision.reason ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {decision.reason}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TaskingFacts({ tasking }: { tasking: TaskingResource['data'] }) {
  const facts = [
    [
      'Iteration',
      `${tasking.iteration.reference} · v${tasking.iteration.version}`,
    ],
    [
      'Story Revision',
      `v${tasking.storyRevision.revisionNumber} · ${shortHash(tasking.storyRevision.contentSha256)}`,
    ],
    [
      'Candidate',
      tasking.currentCandidate
        ? shortHash(tasking.currentCandidate.contentSha256)
        : 'none',
    ],
    [
      'Base commit',
      tasking.currentCandidate?.baseCommitSha ??
        tasking.approvedPlan?.plan.baseCommitSha ??
        'none',
    ],
    ['Model refs', 'entities [] · associations []'],
    [
      'Approved Plan',
      tasking.approvedPlan
        ? shortHash(tasking.approvedPlan.contentSha256)
        : 'none',
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

function workspaceId(state: State<TaskingResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Tasking 缺少 Workspace identity。');
  return decodeURIComponent(match[1]);
}

function requestId(): string {
  return `tasking:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function pairRequestId(): string {
  return `pair:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function appPath(href: string): string {
  const url = new URL(href, window.location.origin);
  return `${url.pathname}${url.search}`;
}

function durationLabel(milliseconds: number): string {
  return milliseconds % 60_000 === 0
    ? `${String(milliseconds / 60_000)} 分钟`
    : `${String(milliseconds)} ms`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const decisionLabels: Record<DeskCheckAction, string> = {
  approve: '批准精确计划',
  revise: '修订计划',
  architecture_gap: '架构缺口',
  process_gap: '工序缺口',
  scenario_gap: 'Scenario 缺口',
};

const decisionMessages: Record<DeskCheckAction, string> = {
  approve: 'Approved Tasking Plan v2 已锁定',
  revise: '已返回 Tasking drafting，旧 Candidate 保留',
  architecture_gap: '已路由到架构知识缺口',
  process_gap: '已路由到工序知识缺口',
  scenario_gap: '已返回 Understand / TQA',
};
