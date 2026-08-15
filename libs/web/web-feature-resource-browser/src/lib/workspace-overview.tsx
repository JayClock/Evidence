import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type {
  InboxItemCollectionResource,
  State,
  StoryCandidateCollectionResource,
  StoryCollectionResource,
  StoryResource,
  WorkspaceResource,
} from '@evidence/api-client';
import { useResource } from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EvidenceCanvas,
  EvidenceStatusBadge,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  Separator,
} from '@evidence/ui';
import {
  storyAuthorityHref,
  storyAuthorityLabel,
} from '@evidence/web-feature-delivery';

type StorySummary = StoryCollectionResource['data']['summary'];
type StoryAction = StoryResource['data']['authority']['nextAction'];
type StoryState = State<StoryResource>;

export function WorkspaceOverviewView({
  resourceState,
}: {
  resourceState: State<WorkspaceResource>;
}) {
  const stories = useResource<StoryCollectionResource>(
    useMemo(() => resourceState.follow('stories'), [resourceState]),
  );
  const candidates = useResource<StoryCandidateCollectionResource>(
    useMemo(() => resourceState.follow('story-candidates'), [resourceState]),
  );
  const inbox = useResource<InboxItemCollectionResource>(
    useMemo(() => resourceState.follow('inbox-items'), [resourceState]),
  );
  const storyState = stories.resourceState;
  const summary = storyState?.data.summary;
  const boardHref = resourceState.getLink('stories')?.href;
  const errors = [stories.error, candidates.error, inbox.error]
    .filter((error): error is Error => Boolean(error))
    .map((error) => error.message);

  return (
    <EvidenceCanvas className="px-5 pt-[1.125rem] pb-6">
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>工作区总览 · EVD-002 至 EVD-005</PageEyebrow>
          <PageTitle className="leading-7">
            {resourceState.data.title}
          </PageTitle>
          <PageDescription>
            {resourceState.data.description?.trim() ||
              '集中查看从 Problem 与 Intake 到 Run 与 Respond 的权威交付压力、证据和下一项动作。'}
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1.5">
          <EvidenceStatusBadge label="托管 API 已连接" status="verified" />
          <EvidenceStatusBadge
            label="Authority projection 已锁定"
            status="locked"
          />
        </div>

        {errors.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>部分工作区投影暂不可用</AlertTitle>
            <AlertDescription>{errors.join('；')}</AlertDescription>
          </Alert>
        ) : null}

        <section
          aria-labelledby="workspace-attention-title"
          className="shrink-0"
        >
          <h2
            className="h-[1.0625rem] text-sm font-semibold"
            id="workspace-attention-title"
          >
            需要你处理
          </h2>
          <div className="grid items-start gap-[0.5625rem] pb-3 sm:grid-cols-2 lg:grid-cols-4">
            <AttentionCard
              count={actionCount(summary, 'route_pair_exception')}
              detail="失败保持 fail closed"
              href={withFilter(boardHref, 'human')}
              label="Pair 异常待路由"
            />
            <AttentionCard
              count={actionCount(summary, 'review_pair_change')}
              detail="核对完整本地 Story Diff"
              href={withFilter(boardHref, 'human')}
              label="Story 编码待审批"
            />
            <AttentionCard
              count={actionCount(summary, 'answer_clarification')}
              detail="回答唯一 pending clarification"
              href={withFilter(boardHref, 'human')}
              label="TQA 问题待回答"
            />
            <AttentionCard
              count={actionCount(summary, 'review_tasking_candidate')}
              detail="批准精确 Candidate"
              href={withFilter(boardHref, 'human')}
              label="Tasking 待 Desk Check"
            />
          </div>
        </section>

        <Card className="h-56 gap-0 py-0">
          <CardHeader className="justify-center border-b py-3 !pb-3">
            <CardTitle aria-level={2} role="heading">
              六个知识位置
            </CardTitle>
            <CardDescription>
              TQA、Desk Check 与编码审批是位置内部 Gate；Approved Plan 仍是 Pair
              唯一入口。
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-x-auto p-4">
            <ol className="grid min-w-[60rem] grid-cols-6">
              <FlowStage
                count={
                  (inbox.resourceState?.data.page.totalElements ?? 0) +
                  (candidates.resourceState?.data.page.totalElements ?? 0)
                }
                detail="来源、Revision、Extraction 与 Candidate"
                label="Problem and Intake"
              />
              <FlowStage
                count={stageCount(summary, 'understand')}
                detail="TQA、Scenario 审查与模型处置"
                label="Scenario and Model"
                state="attention"
              />
              <FlowStage
                count={stageCount(summary, 'tasking')}
                detail="计划编制与 Desk Check"
                label="Tasking"
              />
              <FlowStage
                count={stageCount(summary, 'pair')}
                detail="逐 TEST、质量门与编码审批"
                label="Pair"
              />
              <FlowStage
                count={stageCount(summary, 'showcase')}
                detail="Q2、观察、风险、Review 与决定"
                label="Showcase"
              />
              <FlowStage
                count={stageCount(summary, 'respond')}
                detail="知识响应、next Probe 与人工确认"
                label="Run and Respond"
                state={summary?.approved ? 'done' : 'pending'}
              />
            </ol>
          </CardContent>
        </Card>

        <div className="min-h-0 flex-1 pt-[0.6875rem]">
          <ActiveIterations
            boardHref={boardHref}
            loading={stories.loading}
            storyStates={storyState?.collection ?? []}
          />
        </div>
      </div>
    </EvidenceCanvas>
  );
}

function AttentionCard({
  count,
  label,
  detail,
  href,
}: {
  count: number;
  label: string;
  detail: string;
  href: string | null;
}) {
  const content = (
    <div className="flex h-20 items-center gap-2.5 rounded-lg border bg-card p-3">
      <Badge
        className="font-mono text-[0.8125rem] tabular-nums"
        variant="decision"
      >
        {count}
      </Badge>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground">
          {detail}
        </span>
      </span>
    </div>
  );
  return href ? (
    <Link
      aria-label={`查看 ${label}`}
      className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      to={href}
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function FlowStage({
  label,
  count,
  detail,
  state = 'pending',
}: {
  label: string;
  count?: number;
  detail: string;
  state?: 'done' | 'attention' | 'pending';
}) {
  return (
    <li className="group relative flex min-w-0 flex-col gap-2 pr-3 last:pr-0">
      <div className="flex items-center">
        <span
          aria-label={
            state === 'done' ? `${label} 已完成` : `${label} ${count ?? 0} 项`
          }
          className="relative z-10 flex size-7 items-center justify-center rounded-full border bg-card font-mono text-[0.6875rem] font-semibold data-[state=attention]:border-status-decision data-[state=attention]:bg-status-decision-soft data-[state=attention]:text-status-decision data-[state=done]:border-status-verified data-[state=done]:bg-status-verified-soft data-[state=done]:text-status-verified"
          data-state={state}
        >
          {state === 'done' ? '✓' : String(count ?? 0).padStart(2, '0')}
        </span>
        <span className="h-px flex-1 bg-border group-last:hidden" />
      </div>
      <div className="pr-2">
        <p className="text-xs font-semibold">{label}</p>
        <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
          {count ?? 0} 项
        </p>
        <p className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">
          {detail}
        </p>
      </div>
    </li>
  );
}

function ActiveIterations({
  storyStates,
  loading,
  boardHref,
}: {
  storyStates: StoryState[];
  loading: boolean;
  boardHref?: string;
}) {
  return (
    <Card className="h-full min-h-0" size="sm">
      <CardHeader className="border-b !pb-3">
        <CardTitle aria-level={2} role="heading">
          活跃 Iteration
        </CardTitle>
        <CardDescription>当前阶段与下一权威动作。</CardDescription>
        {boardHref ? (
          <CardAction>
            <Button asChild size="sm" variant="outline">
              <Link to={withFilter(boardHref, 'human') ?? boardHref}>
                交付位置
              </Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            正在读取 Story authority…
          </p>
        ) : storyStates.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>尚无活跃 Story</EmptyTitle>
              <EmptyDescription>
                从 ready Candidate 创建 Iteration。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col">
            {storyStates.slice(0, 5).map((storyState, index) => (
              <IterationRow
                divider={index < Math.min(storyStates.length, 5) - 1}
                key={storyState.data.id}
                storyState={storyState}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IterationRow({
  storyState,
  divider,
}: {
  storyState: StoryState;
  divider: boolean;
}) {
  const story = storyState.data;
  const actionHref = storyAuthorityHref(storyState);
  return (
    <div>
      <div className="flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-[0.6875rem]">{story.iterationReference}</code>
            <Badge variant="outline">
              {story.iterationLoop} / {story.iterationStage}
            </Badge>
          </div>
          <p className="mt-1.5 truncate text-xs font-medium">{story.title}</p>
          <p className="mt-1 text-[0.6875rem] text-muted-foreground">
            {storyAuthorityLabel(story.authority.nextAction)} ·{' '}
            {formatDateTime(story.updatedAt)}
          </p>
        </div>
        {actionHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={actionHref}>打开</Link>
          </Button>
        ) : null}
      </div>
      {divider ? <Separator /> : null}
    </div>
  );
}

function actionCount(
  summary: StorySummary | undefined,
  action: StoryAction,
): number {
  return summary?.actions.find((entry) => entry.action === action)?.count ?? 0;
}

function stageCount(
  summary: StorySummary | undefined,
  loop: StoryResource['data']['iterationLoop'],
): number {
  return (
    summary?.stages.reduce(
      (count, stage) => count + (stage.loop === loop ? stage.count : 0),
      0,
    ) ?? 0
  );
}

function withFilter(href: string | undefined, filter: 'human'): string | null {
  if (!href) return null;
  const [path, query = ''] = href.split('?');
  const parameters = new URLSearchParams(query);
  parameters.set('filter', filter);
  return `${path}?${parameters.toString()}`;
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
