import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type {
  InboxItemCollectionResource,
  LogicalEntityCollectionResource,
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
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Separator,
} from '@evidence/ui';
import {
  storyAuthorityHref,
  storyAuthorityLabel,
} from '@evidence/web-feature-delivery';

type StorySummary = StoryCollectionResource['data']['summary'];
type StoryAction = StoryResource['data']['authority']['nextAction'];

export function WorkspaceOverviewView({
  resourceState,
}: {
  resourceState: State<WorkspaceResource>;
}) {
  const storiesResource = useMemo(
    () => resourceState.follow('stories'),
    [resourceState],
  );
  const candidatesResource = useMemo(
    () => resourceState.follow('story-candidates'),
    [resourceState],
  );
  const inboxResource = useMemo(
    () => resourceState.follow('inbox-items'),
    [resourceState],
  );
  const entitiesResource = useMemo(
    () => resourceState.follow('logical-entities'),
    [resourceState],
  );
  const stories = useResource<StoryCollectionResource>(storiesResource);
  const candidates =
    useResource<StoryCandidateCollectionResource>(candidatesResource);
  const inbox = useResource<InboxItemCollectionResource>(inboxResource);
  const entities =
    useResource<LogicalEntityCollectionResource>(entitiesResource);

  const storyState = stories.resourceState;
  const summary = storyState?.data.summary;
  const boardHref = resourceState.getLink('stories')?.href;
  const inboxHref = resourceState.getLink('inbox-items')?.href;
  const candidatesHref = resourceState.getLink('story-candidates')?.href;
  const diagramHref = resourceState.getLink('diagram')?.href;
  const entitiesHref = resourceState.getLink('logical-entities')?.href;
  const errors = [stories.error, candidates.error, inbox.error, entities.error]
    .filter((error): error is Error => Boolean(error))
    .map((error) => error.message);

  return (
    <section className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">
            工作区总览 · EVD-002 至 EVD-005
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {resourceState.data.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {resourceState.data.description?.trim() ||
              '集中查看从 Inbox、Understand、Tasking 到 Pair 审批的权威交付压力与下一动作。'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {inboxHref ? (
            <Button asChild variant="outline">
              <Link to={inboxHref}>采集来源</Link>
            </Button>
          ) : null}
          {boardHref ? (
            <Button asChild>
              <Link to={boardHref}>打开故事看板</Link>
            </Button>
          ) : null}
        </div>
      </header>

      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>部分工作区投影暂不可用</AlertTitle>
          <AlertDescription>{errors.join('；')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PortfolioStat
          detail="不可变来源修订的工作入口"
          label="Inbox Item"
          loading={inbox.loading}
          value={inbox.resourceState?.data.page.totalElements}
        />
        <PortfolioStat
          detail="尚未拥有 Story ID 的提案"
          label="Story Candidate"
          loading={candidates.loading}
          value={candidates.resourceState?.data.page.totalElements}
        />
        <PortfolioStat
          detail="Kickoff confirm 后的权威身份"
          label="权威 Story"
          loading={stories.loading}
          value={storyState?.data.page.totalElements}
        />
        <PortfolioStat
          detail="工作区权威模型投影"
          label="逻辑实体"
          loading={entities.loading}
          value={entities.resourceState?.data.page.totalElements}
        />
      </div>

      <section aria-labelledby="workspace-attention-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium" id="workspace-attention-title">
              需要你处理
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              来自 Story authority projection 的人工决策，不根据浏览器状态猜测。
            </p>
          </div>
          {boardHref ? (
            <Button asChild size="sm" variant="ghost">
              <Link to={withFilter(boardHref, 'human') ?? boardHref}>
                查看待办队列
              </Link>
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AttentionCard
            count={actionCount(summary, 'route_pair_exception')}
            detail="失败保持 fail closed，人工选择允许路由"
            href={withFilter(boardHref, 'pair')}
            label="Pair 异常待路由"
          />
          <AttentionCard
            count={actionCount(summary, 'review_pair_change')}
            detail="完整 Story Diff 只在 Desktop 本地核对"
            href={withFilter(boardHref, 'pair')}
            label="Story 编码待审批"
          />
          <AttentionCard
            count={actionCount(summary, 'answer_clarification')}
            detail="每轮只保留一个 pending clarification"
            href={withFilter(boardHref, 'human')}
            label="TQA 问题待回答"
          />
          <AttentionCard
            count={actionCount(summary, 'review_tasking_candidate')}
            detail="批准锁定 Pair 的唯一 Approved Plan"
            href={withFilter(boardHref, 'tasking')}
            label="Tasking 待 Desk Check"
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            交付权威流程
          </CardTitle>
          <CardDescription>
            Candidate selection 不创建 Story；Scenario、Tasking Plan 与 Pair
            编码接受都需要独立人工权威。
          </CardDescription>
          {boardHref ? (
            <CardAction>
              <Button asChild size="sm" variant="outline">
                <Link to={boardHref}>打开看板</Link>
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <FlowStage
              count={inbox.resourceState?.data.page.totalElements}
              label="Inbox"
            />
            <FlowStage
              count={candidates.resourceState?.data.page.totalElements}
              label="Candidate"
            />
            <FlowStage
              count={stageCount(summary, 'understand')}
              label="Understand"
            />
            <FlowStage
              count={actionCount(summary, 'review_scenario_set')}
              label="Scenario 确认"
            />
            <FlowStage count={stageCount(summary, 'tasking')} label="Tasking" />
            <FlowStage
              count={actionCount(summary, 'review_tasking_candidate')}
              label="Desk Check"
            />
            <FlowStage count={stageCount(summary, 'pair')} label="Pair" />
            <FlowStage count={summary?.approved} label="Pair Approved" />
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-xs leading-5 text-muted-foreground">
            Approved Plan 是 Pair 唯一入口；Server 发布 nextAction；完整
            Diff、源码、输出、Prompt、凭据和绝对路径不上传 Server。
          </p>
        </CardFooter>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
        <ActiveIterations
          boardHref={boardHref}
          loading={stories.loading}
          storyStates={storyState?.collection ?? []}
        />
        <ModelSnapshot
          diagramHref={diagramHref}
          entitiesHref={entitiesHref}
          entityCount={entities.resourceState?.data.page.totalElements}
          loading={entities.loading}
        />
      </div>

      <Alert>
        <AlertTitle>本地与 Server 边界</AlertTitle>
        <AlertDescription>
          Server 只保存受限、append-only 的权威事实。Desktop 负责仓库绑定、本地
          Analyst、Pair Controller、完整 Diff 审查与最终本地 commit；Pair
          approved 后没有自动 merge 或 push。
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        {candidatesHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={candidatesHref}>审查 Story Candidate</Link>
          </Button>
        ) : null}
        {entitiesHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={entitiesHref}>查看逻辑实体</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function PortfolioStat({
  label,
  value,
  detail,
  loading,
}: {
  label: string;
  value?: number;
  detail: string;
  loading: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {loading ? '…' : (value ?? 0)}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
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
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{count}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs leading-5 text-muted-foreground">
        {detail}
      </CardContent>
      {href ? (
        <CardFooter className="justify-end">
          <Button asChild size="sm" variant="ghost">
            <Link to={href}>查看</Link>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function FlowStage({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex min-h-20 flex-col justify-between gap-2 rounded-lg border bg-muted/30 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-medium tabular-nums">{count ?? 0}</span>
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          活跃 Iteration
        </CardTitle>
        <CardDescription>
          当前 loop / stage 与 Server 投影的下一权威动作。
        </CardDescription>
        {boardHref ? (
          <CardAction>
            <Button asChild size="sm" variant="outline">
              <Link to={withFilter(boardHref, 'human') ?? boardHref}>
                在看板中查看
              </Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            正在读取 Story authority…
          </p>
        ) : storyStates.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>尚无活跃 Story</EmptyTitle>
              <EmptyDescription>
                从 ready Candidate 创建 Iteration，并在 Kickoff confirm 后形成
                Story。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
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

type StoryState = State<StoryResource>;

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
      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs">{story.iterationReference}</code>
            <Badge variant="outline">
              {story.iterationLoop} / {story.iterationStage}
            </Badge>
            <Badge
              variant={
                story.authority.owner === 'human' ? 'secondary' : 'outline'
              }
            >
              {story.authority.owner === 'human'
                ? '待人工'
                : story.authority.owner === 'agent'
                  ? '待本地 Agent'
                  : '已完成'}
            </Badge>
          </div>
          <p className="mt-2 truncate text-sm font-medium">{story.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {storyAuthorityLabel(story.authority.nextAction)} · 更新于{' '}
            {formatDateTime(story.updatedAt)}
          </p>
        </div>
        {actionHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={actionHref}>打开当前阶段</Link>
          </Button>
        ) : null}
      </div>
      {divider ? <Separator /> : null}
    </div>
  );
}

function ModelSnapshot({
  entityCount,
  loading,
  diagramHref,
  entitiesHref,
}: {
  entityCount?: number;
  loading: boolean;
  diagramHref?: string;
  entitiesHref?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          模型快照
        </CardTitle>
        <CardDescription>当前工作区的权威模型投影。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">逻辑实体</p>
          <p className="mt-2 text-3xl font-medium tabular-nums">
            {loading ? '…' : (entityCount ?? 0)}
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          模型投影与交付 authority 分离；只有显式 Modeling 决定才能改变 Story
          的下一流程位置。
        </p>
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2">
        {entitiesHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={entitiesHref}>逻辑实体</Link>
          </Button>
        ) : null}
        {diagramHref ? (
          <Button asChild size="sm">
            <Link to={diagramHref}>打开模型图</Link>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
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

function withFilter(
  href: string | undefined,
  filter: 'human' | 'tasking' | 'pair',
): string | null {
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
