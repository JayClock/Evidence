import { Link } from 'react-router-dom';
import type {
  IterationIntakeResource,
  IterationResource,
  State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EvidenceCanvas,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  Separator,
} from '@evidence/ui';

export function IterationDetailView({
  resourceState,
}: {
  resourceState: State<IterationResource>;
}) {
  const iteration = resourceState.data;
  return (
    <EvidenceCanvas>
      <PageHeader>
        <PageHeaderCopy>
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>Iteration authority</PageEyebrow>
            <Badge>{iterationLifecycleLabel(iteration.lifecycle)}</Badge>
            <Badge variant="outline">
              {iterationLoopLabel(iteration.loop)} /{' '}
              {iterationStageLabel(iteration.stage)}
            </Badge>
          </div>
          <PageTitle>{iteration.reference}</PageTitle>
          <PageDescription>
            一张冻结 Candidate、一个隔离分支，以及最多一张权威 Story。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          {resourceState.getLink('intake') ? (
            <Button asChild variant="outline">
              <Link to={resourceState.getLink('intake')?.href ?? '#'}>
                Frozen Intake
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('kickoff') ? (
            <Button asChild>
              <Link to={resourceState.getLink('kickoff')?.href ?? '#'}>
                打开 Kickoff
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('understanding') ? (
            <Button asChild>
              <Link to={resourceState.getLink('understanding')?.href ?? '#'}>
                打开 Understand / TQA
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('tasking') ? (
            <Button asChild>
              <Link to={resourceState.getLink('tasking')?.href ?? '#'}>
                打开 Tasking / Desk Check
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('showcase') ? (
            <Button asChild>
              <Link to={resourceState.getLink('showcase')?.href ?? '#'}>
                打开 Showcase
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('respond') ? (
            <Button asChild>
              <Link to={resourceState.getLink('respond')?.href ?? '#'}>
                打开 Respond
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('story') ? (
            <Button asChild variant="outline">
              <Link to={resourceState.getLink('story')?.href ?? '#'}>
                打开 US-001
              </Link>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>
      <div className="p-4">
        <Card>
          <CardContent className="flex flex-col gap-5">
            {iteration.lifecycle === 'provisioning_failed' ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {iteration.provisioningFailureSummary ??
                    'Desktop provision 失败；Candidate 仍保持 selected，等待人工恢复。'}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Detail label="基准提交" value={iteration.baseCommitSha} mono />
              <Detail
                label="隔离分支"
                value={iteration.branchName ?? '尚未完成 provision'}
                mono
              />
              <Detail
                label="Candidate"
                value={iteration.sourceCandidateId}
                mono
              />
              <Detail
                label="Candidate SHA-256"
                value={iteration.sourceCandidateSha256}
                mono
              />
              <Detail
                label="准入时间"
                value={formatDateTime(iteration.admittedAt)}
              />
              <Detail
                label="Iteration version"
                value={String(iteration.version)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </EvidenceCanvas>
  );
}

export function IterationIntakeDetailView({
  resourceState,
}: {
  resourceState: State<IterationIntakeResource>;
}) {
  const intake = resourceState.data;
  return (
    <EvidenceCanvas>
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>{formatDateTime(intake.frozenAt)}</PageEyebrow>
          <PageTitle>Frozen Intake</PageTitle>
          <PageDescription>
            自包含 Candidate 与精确、不可变的 Inbox Revision 快照。
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>
      <div className="flex flex-col gap-4 p-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                后续校验只读取这份冻结内容，不回读 live Inbox Item、provider
                或可变 Candidate。
              </AlertDescription>
            </Alert>
            <Detail label="Intake SHA-256" value={intake.contentSha256} mono />
            <Separator />
            <CandidateSnapshot candidate={intake.candidate} />
          </CardContent>
        </Card>
        <FrozenSources sources={intake.sources} />
      </div>
    </EvidenceCanvas>
  );
}

function CandidateSnapshot({
  candidate,
}: {
  candidate: IterationIntakeResource['data']['candidate'];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Detail
        label="Candidate"
        value={`${candidate.candidateReference} · ${candidate.title}`}
      />
      <Detail label="角色" value={candidate.role} />
      <Detail label="问题" value={candidate.problem} />
      <Detail label="目标" value={candidate.goal} />
      <Detail label="价值" value={candidate.value} />
      <Detail label="Candidate SHA-256" value={candidate.contentSha256} mono />
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

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
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

function iterationLoopLabel(value: string): string {
  return (
    {
      kickoff: 'Kickoff',
      understand: 'Understand',
      tasking: 'Tasking',
      pair: 'Pair',
    }[value] ?? value
  );
}

function iterationStageLabel(value: string): string {
  return (
    {
      candidate_review: 'Candidate 审查',
      candidate_drafting: 'Proposal 修订',
      tqa: 'TQA',
      scenario_review: 'Scenario 审查',
      modeling: '模型影响决定',
      drafting: 'Tasking 起草',
      desk_check: 'Desk Check',
      knowledge_gap: '知识缺口',
      approved: '计划已批准',
      plan_confirmed: 'Pair 计划已锁定',
      quality_gates_passed: '质量门已通过',
      exception: '异常',
    }[value] ?? value
  );
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
