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
  EvidenceCanvas,
  PageActions,
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
  const entities = useResource<LogicalEntityCollectionResource>(
    useMemo(() => resourceState.follow('logical-entities'), [resourceState]),
  );

  const storyState = stories.resourceState;
  const summary = storyState?.data.summary;
  const boardHref = resourceState.getLink('stories')?.href;
  const inboxHref = resourceState.getLink('inbox-items')?.href;
  const diagramHref = resourceState.getLink('diagram')?.href;
  const entitiesHref = resourceState.getLink('logical-entities')?.href;
  const errors = [stories.error, candidates.error, inbox.error, entities.error]
    .filter((error): error is Error => Boolean(error))
    .map((error) => error.message);

  return (
    <EvidenceCanvas>
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>工作区总览 · EVD-002 至 EVD-005</PageEyebrow>
          <PageTitle>{resourceState.data.title}</PageTitle>
          <PageDescription>
            {resourceState.data.description?.trim() ||
              '集中查看 Inbox、Understand、Tasking 到 Pair 审批的权威交付压力与下一项动作。'}
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          {inboxHref ? (
            <Button asChild size="sm" variant="outline">
              <Link to={inboxHref}>采集来源</Link>
            </Button>
          ) : null}
          {boardHref ? (
            <Button asChild size="sm">
              <Link to={boardHref}>打开故事看板</Link>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      <div className="flex flex-col gap-4 p-5 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">托管 API 已连接</Badge>
          <Badge variant="secondary">Authority projection 已同步</Badge>
        </div>

        {errors.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>部分工作区投影暂不可用</AlertTitle>
            <AlertDescription>{errors.join('；')}</AlertDescription>
          </Alert>
        ) : null}

        <section aria-labelledby="workspace-attention-title">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h2
                className="text-sm font-semibold"
                id="workspace-attention-title"
              >
                需要你处理
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                只显示 Server authority projection 发布的人工下一动作。
              </p>
            </div>
            {boardHref ? (
              <Button asChild size="sm" variant="ghost">
                <Link to={withFilter(boardHref, 'human') ?? boardHref}>
                  查看全部
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <AttentionCard
              count={actionCount(summary, 'route_pair_exception')}
              detail="失败保持 fail closed"
              href={withFilter(boardHref, 'pair')}
              label="Pair 异常待路由"
            />
            <AttentionCard
              count={actionCount(summary, 'review_pair_change')}
              detail="核对完整本地 Story Diff"
              href={withFilter(boardHref, 'pair')}
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
              href={withFilter(boardHref, 'tasking')}
              label="Tasking 待 Desk Check"
            />
          </div>
        </section>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle aria-level={2} role="heading">
              交付权威流程
            </CardTitle>
            <CardDescription>
              Approved Plan 是 Pair 唯一入口；完整 Diff 仅在 Desktop 审查。
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-4">
            <ol className="grid min-w-[48rem] grid-cols-6">
              <FlowStage
                count={inbox.resourceState?.data.page.totalElements}
                detail="来源与修订已冻结"
                label="Inbox"
                state="done"
              />
              <FlowStage
                count={candidates.resourceState?.data.page.totalElements}
                detail="人工确认 Story authority"
                label="Kickoff"
                state="attention"
              />
              <FlowStage
                count={stageCount(summary, 'understand')}
                detail="TQA 与 Scenario 审查"
                label="Understand"
              />
              <FlowStage
                count={stageCount(summary, 'tasking')}
                detail="计划编制与 Desk Check"
                label="Tasking"
              />
              <FlowStage
                count={stageCount(summary, 'pair')}
                detail="逐 TEST、Refactor 与质量门"
                label="Pair"
              />
              <FlowStage
                count={summary?.approved}
                detail="本地 commit 后停止"
                label="Approved"
                state="done"
              />
            </ol>
          </CardContent>
        </Card>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
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
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-xl tabular-nums">
          {count}
        </CardTitle>
        {href ? (
          <CardAction>
            <Button asChild size="sm" variant="ghost">
              <Link to={href}>查看</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
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
    <li className="group relative flex min-w-0 flex-col gap-3 pr-3 last:pr-0">
      <div className="flex items-center">
        <span
          className="relative z-10 flex size-7 items-center justify-center rounded-full border bg-card font-mono text-[0.6875rem] font-semibold data-[state=attention]:border-ev-amber data-[state=attention]:bg-ev-amber-soft data-[state=done]:border-ev-brand data-[state=done]:bg-ev-brand-strong data-[state=done]:text-primary-foreground"
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
    <Card>
      <CardHeader className="border-b">
        <CardTitle aria-level={2} role="heading">
          活跃 Iteration
        </CardTitle>
        <CardDescription>当前阶段与下一权威动作。</CardDescription>
        {boardHref ? (
          <CardAction>
            <Button asChild size="sm" variant="outline">
              <Link to={withFilter(boardHref, 'human') ?? boardHref}>看板</Link>
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
      <CardHeader className="border-b">
        <CardTitle aria-level={2} role="heading">
          模型快照
        </CardTitle>
        <CardDescription>当前工作区权威模型投影。</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">逻辑实体</p>
        <p className="mt-2 font-mono text-3xl font-medium tabular-nums">
          {loading ? '…' : (entityCount ?? 0)}
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
