import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useResource,
  type State,
  type StoryResource,
  type StoryRevisionResource,
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
  Spinner,
} from '@evidence/ui';

export function StoryDetailView({
  resourceState,
}: {
  resourceState: State<StoryResource>;
}) {
  const latestResource = useMemo(
    () => resourceState.follow('latest-revision'),
    [resourceState],
  );
  const latest = useResource<StoryRevisionResource>(latestResource);
  const story = resourceState.data;
  const revisionsHref = resourceState.getLink('revisions')?.href;
  const workflow = workflowAction(resourceState);

  return (
    <EvidenceCanvas>
      <PageHeader className="px-6 pt-6 pb-[1.125rem]">
        <PageHeaderCopy>
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>{story.iterationReference}</PageEyebrow>
            <Badge>权威 Story</Badge>
            <Badge variant="outline">{workflowStageLabel(story)}</Badge>
          </div>
          <PageTitle>
            {story.reference} · {story.title}
          </PageTitle>
          <PageDescription>
            Kickoff confirm 已创建本 Iteration 唯一的 Story、Problem
            Statement、Lean Story Card 和不可编码的 baseline Revision v1。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          {revisionsHref ? (
            <Button asChild size="sm" variant="outline">
              <Link to={revisionsHref}>修订历史</Link>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      <AuthorityProgress />

      <div className="grid min-h-[42rem] shrink-0 gap-4 overflow-hidden bg-background p-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-2.5">
            <Alert>
              <AlertDescription>
                <strong>Story authority 已由人工 Kickoff confirm 创建。</strong>
                <span className="mt-1 block text-muted-foreground">
                  Candidate selection 本身没有创建 Story；所有后续修订都保留同一
                  US-001 identity。
                </span>
              </AlertDescription>
            </Alert>

            {latest.loading ? (
              <Card>
                <CardContent className="flex items-center gap-2 py-6 text-muted-foreground">
                  <Spinner />
                  正在读取 latest Story Revision…
                </CardContent>
              </Card>
            ) : latest.error ? (
              <Alert variant="destructive">
                <AlertDescription>{latest.error.message}</AlertDescription>
              </Alert>
            ) : latest.resourceState ? (
              <StoryAuthorityContent
                resourceState={latest.resourceState}
                revisionCount={story.revisionCount}
              />
            ) : null}
          </div>
        </div>

        <aside className="max-h-full self-start overflow-y-auto rounded-xl border bg-card">
          <StoryWorkflowPanel
            resourceState={resourceState}
            workflow={workflow}
          />
        </aside>
      </div>
    </EvidenceCanvas>
  );
}

function AuthorityProgress() {
  const steps = [
    ['1', '来源已冻结', '精确 Revision'],
    ['2', 'Candidate 已选择', 'Frozen Intake'],
    ['3', 'Kickoff 已确认', '人工决定'],
    ['4', 'US-001 已创建', 'baseline v1'],
  ] as const;
  return (
    <div className="h-[4.4375rem] shrink-0 px-6 py-3">
      <ol
        aria-label="Inbox 到 Story 权威流程"
        className="grid h-[2.9375rem] overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-4"
      >
        {steps.map(([number, label, detail]) => (
          <li
            className="flex min-w-0 items-center gap-2 border-b px-3 last:border-b-0 xl:border-r xl:border-b-0 xl:last:border-r-0"
            key={number}
          >
            <Badge>{number}</Badge>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium">{label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StoryAuthorityContent({
  resourceState,
  revisionCount,
}: {
  resourceState: State<StoryRevisionResource>;
  revisionCount: number;
}) {
  const revision = resourceState.data;
  return (
    <>
      <Card size="sm">
        <CardHeader className="border-b !pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="secondary">Lean Story Card · US-001</Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {shortHash(revision.contentSha256)}
            </span>
          </div>
          <CardTitle aria-level={2} role="heading">
            {revision.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-lg bg-primary/10 p-3 text-sm">
            作为{revision.role}，我希望{revision.goal}，从而{revision.value}。
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Detail label="角色" value={revision.role} />
            <Detail label="价值" value={revision.value} />
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline">Problem Statement</Badge>
            <span className="font-mono text-xs text-muted-foreground">
              PS · Revision {revision.revisionNumber}
            </span>
          </div>
          <CardTitle aria-level={2} role="heading">
            {revision.problem}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Detail
            label="认知模式"
            value={cognitiveModeLabel(revision.cognitiveMode)}
          />
          <Detail
            label="来源"
            value={`${revision.citations.length} 个精确 Inbox Revision citation`}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="border-b !pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Latest · v{revision.revisionNumber}</Badge>
            <Badge variant="outline">
              {revision.scenarios.length} 个 Scenario
            </Badge>
          </div>
          <CardTitle aria-level={2} role="heading">
            不可变 Story Revision
          </CardTitle>
          <CardDescription>
            共 {revisionCount} 个修订；每次人工权威变化都追加新 Revision。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {revision.scenarios.length === 0 ? (
            <Alert>
              <AlertDescription>
                Kickoff baseline Revision 不含 Scenario。下一步必须在 Understand
                / TQA 中由人工确认完整 Given / When / Then Scenario Set。
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-3">
              {revision.scenarios.map((scenario) => (
                <ScenarioSummary key={scenario.id} scenario={scenario} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SourceCitations citations={revision.citations} />
    </>
  );
}

function SourceCitations({
  citations,
}: {
  citations: StoryRevisionResource['data']['citations'];
}) {
  return (
    <Card size="sm">
      <CardHeader className="border-b !pb-3">
        <CardTitle aria-level={2} role="heading">
          精确来源引用
        </CardTitle>
        <CardDescription>
          Story Revision 锁定以下 Inbox Revision，不跟随 live 来源变化。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {citations.map((citation) => {
          const href = citation._links.revision?.href;
          return (
            <div
              className="flex flex-col gap-2 rounded-lg border p-3"
              key={`${citation.inboxRevisionId}:${citation.locator}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    Inbox Revision #{citation.inboxRevisionNumber}
                  </Badge>
                  <Badge variant="outline">{citation.locator}</Badge>
                </div>
                {href ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={href}>打开来源</Link>
                  </Button>
                ) : null}
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {citation.contentSha256}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ScenarioSummary({
  scenario,
}: {
  scenario: StoryRevisionResource['data']['scenarios'][number];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{scenario.reference}</Badge>
        <h3 className="font-medium">{scenario.title}</h3>
      </div>
      <ScenarioPhase label="GIVEN" steps={scenario.given} />
      <ScenarioPhase label="WHEN" steps={[scenario.when]} />
      <ScenarioPhase label="THEN" steps={scenario.then} />
    </div>
  );
}

function ScenarioPhase({
  label,
  steps,
}: {
  label: 'GIVEN' | 'WHEN' | 'THEN';
  steps: string[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[4.5rem_1fr]">
      <Badge className="h-fit w-fit" variant="outline">
        {label}
      </Badge>
      <div className="flex flex-col gap-1">
        {steps.map((step, index) => (
          <p className="text-sm" key={`${label}-${index}`}>
            {index > 0 ? '并且 ' : ''}
            {step}
          </p>
        ))}
      </div>
    </div>
  );
}

interface WorkflowAction {
  href?: string;
  label: string;
  title: string;
  description: string;
}

function StoryWorkflowPanel({
  resourceState,
  workflow,
}: {
  resourceState: State<StoryResource>;
  workflow: WorkflowAction;
}) {
  const story = resourceState.data;
  const codingAdmissionOpen = story.iterationLoop === 'pair';
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          <h2 className="text-base font-semibold">{workflow.title}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {story.iterationReference} · {workflowStageLabel(story)}
        </p>
      </div>

      <Alert>
        <AlertDescription>
          <strong>
            {codingAdmissionOpen ? 'Pair 流程已开放' : '编码准入尚未开放'}
          </strong>
          <span className="mt-1 block">{workflow.description}</span>
        </AlertDescription>
      </Alert>

      {workflow.href ? (
        <Button asChild className="w-full">
          <Link to={workflow.href}>{workflow.label}</Link>
        </Button>
      ) : (
        <Button className="w-full" disabled type="button">
          {workflow.label}
        </Button>
      )}

      <Separator />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">权威状态</h3>
        <WorkflowFact label="Iteration" value={story.iterationReference} />
        <WorkflowFact label="Story" value={story.reference} />
        <WorkflowFact
          label="Latest Revision"
          value={`v${story.latestRevisionNumber}`}
        />
        <WorkflowFact
          label="Scenario"
          value={`${story.latestScenarioCount} 个`}
        />
        <WorkflowFact
          label="Revision count"
          value={String(story.revisionCount)}
        />
      </div>

      <Alert>
        <AlertDescription>
          Scenario confirm 之后仍需显式模型影响决定与人工 Desk Check。不得从
          Story 直接进入编码执行。
        </AlertDescription>
      </Alert>
    </div>
  );
}

function WorkflowFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function workflowAction(resourceState: State<StoryResource>): WorkflowAction {
  const story = resourceState.data;
  if (story.iterationLifecycle !== 'active') {
    return {
      label: 'Iteration 已终止',
      title: '交付流程已终止',
      description:
        '当前 Iteration 不再接受新的人工决定；已有 Story 与证据保持可读。',
    };
  }
  if (story.iterationLoop === 'pair') {
    return {
      href: resourceState.getLink('pair')?.href,
      label: '打开 Pair',
      title: 'Pair · 编码执行与审查',
      description: 'Pair 只能从人工批准的精确 Tasking Plan 进入。',
    };
  }
  if (story.iterationLoop === 'tasking') {
    return {
      href: resourceState.getLink('tasking')?.href,
      label:
        story.iterationStage === 'desk_check'
          ? '执行人工 Desk Check'
          : '打开 Tasking',
      title: `Tasking · ${workflowStageLabel(story)}`,
      description:
        story.latestScenarioCount > 0
          ? 'Scenario 已确认，但必须先批准完整 Tasking Plan。'
          : '当前 Story 尚未形成可供 Tasking 锁定的 Scenario Set。',
    };
  }
  return {
    href: resourceState.getLink('understanding')?.href,
    label:
      story.latestScenarioCount === 0
        ? '定义验收 Scenario'
        : '继续 Understand / Modeling',
    title:
      story.iterationStage === 'modeling'
        ? 'Understand · 模型影响决定'
        : 'Understand · TQA',
    description:
      story.latestScenarioCount === 0
        ? 'latest Revision 没有 Scenario。至少确认一个完整 Scenario Set 后才能继续。'
        : 'Scenario 已确认；下一步仍需显式处理模型影响。',
  };
}

function workflowStageLabel(story: StoryResource['data']): string {
  const labels: Record<string, string> = {
    tqa: 'Understand / TQA',
    scenario_review: 'Scenario 人工审查',
    modeling: '模型影响决定',
    drafting: 'Tasking 起草',
    desk_check: 'Desk Check',
    knowledge_gap: '知识缺口',
    approved: 'Tasking Plan 已批准',
    plan_confirmed: 'Pair Plan 已锁定',
    test_written: 'Test 已写入',
    red_observed: 'Red 已观察',
    implementation_written: '实现已写入',
    green_observed: 'Green 已观察',
    refactored: 'Refactor 已完成',
    quality_gate_failed: '质量门失败',
    quality_gates_passed: '质量门已通过',
    exception: 'Pair 异常',
  };
  return labels[story.iterationStage] ?? story.iterationStage;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
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
