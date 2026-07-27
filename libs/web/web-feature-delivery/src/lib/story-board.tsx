import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type {
  State,
  StoryCollectionResource,
  StoryResource,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EvidenceCanvas,
  Input,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  PageToolbar,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@evidence/ui';
import { DeliveryPagination } from './delivery-pagination';

type StoryState = State<StoryResource>;
type StoryData = StoryResource['data'];
type StoryAction = StoryData['authority']['nextAction'];
type BoardFilter = 'all' | 'human' | 'agent' | 'tasking' | 'pair' | 'approved';
type BoardColumnKey =
  | 'tqa'
  | 'scenario'
  | 'modeling'
  | 'tasking'
  | 'desk-check'
  | 'plan-ready'
  | 'pair'
  | 'approval'
  | 'approved';

interface BoardColumnDefinition {
  key: BoardColumnKey;
  title: string;
  rule: string;
  footer: string;
}

const BOARD_COLUMNS: BoardColumnDefinition[] = [
  {
    key: 'tqa',
    title: 'TQA 澄清',
    rule: '一个 pending question 或下一轮 Analyst',
    footer: '每轮只能存在一个待回答问题。',
  },
  {
    key: 'scenario',
    title: 'Scenario 审查',
    rule: '完整的 1–5 个 Draft 等待人工决定',
    footer: '只有人工确认才能形成 Scenario authority。',
  },
  {
    key: 'modeling',
    title: '模型影响处置',
    rule: '显式记录模型决定后才可进入 Tasking',
    footer: 'No Model Impact 必须包含非空理由。',
  },
  {
    key: 'tasking',
    title: 'Tasking 起草',
    rule: 'Desktop Analyst 生成完整 Candidate',
    footer: 'Agent 只能使用受限 process 与 Nx catalog。',
  },
  {
    key: 'desk-check',
    title: 'Desk Check',
    rule: '人工审查 exact Candidate 与追踪链',
    footer: 'Desk Check 不会隐式启动 Pair。',
  },
  {
    key: 'plan-ready',
    title: 'Pair 待启动',
    rule: 'Approved Plan 是唯一入口',
    footer: 'Desktop 显式启动精确 Approved Plan。',
  },
  {
    key: 'pair',
    title: 'Pair 执行',
    rule: 'Server 发布唯一 nextAction',
    footer: '逐 TEST 执行 Red / Green，再完成一次 Refactor。',
  },
  {
    key: 'approval',
    title: 'Story 编码审批',
    rule: '完整本地 Diff 与 bounded evidence',
    footer: '批准只创建一个本地 commit。',
  },
  {
    key: 'approved',
    title: 'Pair 已批准',
    rule: '本地 commit 已创建，Pair 到此停止',
    footer: '不会自动 Showcase、merge 或 push。',
  },
];

const FILTER_LABELS: Array<{ value: BoardFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'human', label: '待人工' },
  { value: 'agent', label: '待 Agent' },
  { value: 'tasking', label: 'Tasking' },
  { value: 'pair', label: 'Pair' },
  { value: 'approved', label: '已批准' },
];

export function StoryCollectionView({
  resourceState,
}: {
  resourceState: State<StoryCollectionResource>;
}) {
  const location = useLocation();
  const initialQuery = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const [collectionState, setCollectionState] = useState(resourceState);
  const [query, setQuery] = useState(initialQuery.get('q') ?? '');
  const [filter, setFilter] = useState<BoardFilter>(() =>
    parseFilter(initialQuery.get('filter')),
  );
  const [selectedStory, setSelectedStory] = useState<StoryState | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const stories = useMemo(
    () =>
      collectionState.collection.filter((storyState) =>
        storyMatches(storyState.data, deferredQuery, filter),
      ),
    [collectionState.collection, deferredQuery, filter],
  );

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!collectionState.getLink(relation) || pagePending) return;
    setPagePending(true);
    setPageError(null);
    try {
      setCollectionState(await collectionState.follow(relation).refresh());
      setSelectedStory(null);
    } catch (caught) {
      setPageError(errorMessage(caught, '无法载入 Story 页面。'));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <EvidenceCanvas className="overflow-hidden">
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>
            交付组合 · {collectionState.data.page.totalElements} 个已确认 Story
          </PageEyebrow>
          <PageTitle>故事交付看板</PageTitle>
          <PageDescription>
            列位置由 Iteration loop / stage 自动推导，禁止拖拽。唯一 Pair
            入口是人工批准的精确 Tasking Plan。
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>

      <PageToolbar>
        <label className="min-w-0 flex-1">
          <span className="sr-only">搜索 Story</span>
          <Input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Story、Iteration 或阶段…"
            type="search"
            value={query}
          />
        </label>
        <ToggleGroup
          aria-label="看板筛选"
          className="max-w-full flex-wrap justify-start"
          onValueChange={(value) => {
            if (value) setFilter(value as BoardFilter);
          }}
          size="sm"
          spacing={0}
          type="single"
          value={filter}
          variant="outline"
        >
          {FILTER_LABELS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Badge variant="secondary">状态自动推导 · 禁止拖拽</Badge>
      </PageToolbar>

      {pageError ? (
        <Alert className="m-2" variant="destructive">
          <AlertTitle>分页载入失败</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {collectionState.collection.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyTitle>尚无权威 Story</EmptyTitle>
              <EmptyDescription>
                人工 confirm 一份 Frozen Kickoff Proposal 后才会创建 US-001。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : stories.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyTitle>没有匹配的 Story</EmptyTitle>
              <EmptyDescription>
                清除搜索条件或切换筛选，查看当前分页的其他 Story。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <StoryBoard stories={stories} onInspect={setSelectedStory} />
        )}
      </div>

      <div className="shrink-0 border-t px-3 pb-2">
        <DeliveryPagination
          hasNext={Boolean(collectionState.getLink('next'))}
          hasPrevious={Boolean(collectionState.getLink('prev'))}
          label="Story 分页"
          page={collectionState.data.page.number}
          pending={pagePending}
          totalPages={collectionState.data.page.totalPages}
          onNext={() => void navigatePage('next')}
          onPrevious={() => void navigatePage('prev')}
        />
      </div>

      <StoryQuickView
        onOpenChange={(open) => {
          if (!open) setSelectedStory(null);
        }}
        storyState={selectedStory}
      />
    </EvidenceCanvas>
  );
}

function StoryBoard({
  stories,
  onInspect,
}: {
  stories: StoryState[];
  onInspect: (story: StoryState) => void;
}) {
  const grouped = useMemo(() => groupStories(stories), [stories]);

  return (
    <div aria-label="故事交付看板" className="h-full overflow-x-auto">
      <div className="grid h-full min-w-[72rem] grid-cols-9 gap-2 bg-background p-3">
        {BOARD_COLUMNS.map((column) => {
          const columnStories = grouped.get(column.key) ?? [];
          return (
            <section
              aria-labelledby={`story-column-${column.key}`}
              className="flex min-w-0 flex-col rounded-lg border bg-secondary"
              key={column.key}
            >
              <header className="flex min-h-10 items-center justify-between gap-2 border-b px-2 py-1.5">
                <h2
                  className="min-w-0 truncate text-xs font-semibold"
                  id={`story-column-${column.key}`}
                  title={column.rule}
                >
                  {column.title}
                </h2>
                <Badge variant="outline">{columnStories.length}</Badge>
              </header>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {columnStories.length === 0 ? (
                  <p className="rounded-md border border-dashed p-2 text-center text-[0.625rem] leading-4 text-muted-foreground">
                    暂无 Story
                  </p>
                ) : (
                  columnStories.map((storyState) => (
                    <StoryCard
                      key={storyState.data.id}
                      onInspect={onInspect}
                      storyState={storyState}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StoryCard({
  storyState,
  onInspect,
}: {
  storyState: StoryState;
  onInspect: (story: StoryState) => void;
}) {
  const story = storyState.data;
  const actionHref = storyAuthorityHref(storyState);

  return (
    <Card size="sm">
      <CardHeader>
        <div className="font-mono text-[0.625rem] text-muted-foreground">
          {story.reference} · {story.iterationReference} · v
          {story.latestRevisionNumber}
        </div>
        <CardTitle aria-level={3} className="line-clamp-3" role="heading">
          {story.title}
        </CardTitle>
        <CardAction>
          <Badge variant={ownerBadgeVariant(story.authority.owner)}>
            {storyOwnerLabel(story.authority.owner)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <code className="text-[0.625rem] text-muted-foreground">
          {story.iterationLoop} / {story.iterationStage}
        </code>
        <p className="text-[0.6875rem] leading-4 font-medium">
          {storyAuthorityLabel(story.authority.nextAction)}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">SC {story.latestScenarioCount}</Badge>
          <Badge variant="outline">来源 {story.latestCitationCount}</Badge>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-1">
        <Button
          aria-label={`快速查看 ${story.title}`}
          onClick={() => onInspect(storyState)}
          size="sm"
          type="button"
          variant="ghost"
        >
          快速查看
        </Button>
        {actionHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={actionHref}>{storyActionButtonLabel(story)}</Link>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function StoryQuickView({
  storyState,
  onOpenChange,
}: {
  storyState: StoryState | null;
  onOpenChange: (open: boolean) => void;
}) {
  const story = storyState?.data;
  if (!storyState || !story) {
    return <Sheet onOpenChange={onOpenChange} open={false} />;
  }
  const actionHref = storyAuthorityHref(storyState);
  const storyHref = storyState.getLink('self')?.href;

  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetDescription>
            {story.reference} · {story.iterationReference}
          </SheetDescription>
          <SheetTitle>{story.title}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <Alert>
            <AlertTitle>列位置不是可拖拽状态</AlertTitle>
            <AlertDescription>
              看板只投影 Server 权威 Iteration loop / stage；动作仍受当前 HAL
              relation 与 optimistic version 约束。
            </AlertDescription>
          </Alert>

          <QuickViewSection title="当前权威位置">
            <QuickFact label="阶段">
              {story.iterationLoop} / {story.iterationStage}
            </QuickFact>
            <QuickFact label="责任方">
              {storyOwnerLabel(story.authority.owner)}
            </QuickFact>
            <QuickFact label="下一权威动作">
              {storyAuthorityLabel(story.authority.nextAction)}
            </QuickFact>
            <QuickFact label="Story Revision">
              v{story.latestRevisionNumber} · {story.latestScenarioCount} 个 SC
            </QuickFact>
          </QuickViewSection>

          <QuickViewSection title="固定边界">
            <QuickFact label="Candidate selection">不创建 Story</QuickFact>
            <QuickFact label="Scenario authority">
              Understand 人工确认
            </QuickFact>
            <QuickFact label="Pair 入口">精确 Approved Plan</QuickFact>
            <QuickFact label="Pair 终点">
              本地批准；不自动 merge / push
            </QuickFact>
          </QuickViewSection>
        </div>
        <SheetFooter className="sm:flex-row sm:justify-end">
          {storyHref ? (
            <Button asChild variant="outline">
              <Link to={storyHref}>打开 Story</Link>
            </Button>
          ) : null}
          {actionHref ? (
            <Button asChild>
              <Link to={actionHref}>{storyActionButtonLabel(story)}</Link>
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function QuickViewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function QuickFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <code className="text-right text-xs">{children}</code>
    </div>
  );
}

function groupStories(stories: StoryState[]) {
  const grouped = new Map<BoardColumnKey, StoryState[]>();
  for (const story of stories) {
    const key = storyColumn(story.data);
    grouped.set(key, [...(grouped.get(key) ?? []), story]);
  }
  return grouped;
}

function storyColumn(story: StoryData): BoardColumnKey {
  if (story.iterationLoop === 'understand') {
    if (story.iterationStage === 'scenario_review') return 'scenario';
    if (story.iterationStage === 'modeling') return 'modeling';
    return 'tqa';
  }
  if (story.iterationLoop === 'tasking') {
    if (story.iterationStage === 'desk_check') return 'desk-check';
    if (story.iterationStage === 'approved') return 'plan-ready';
    return 'tasking';
  }
  if (story.iterationLoop === 'pair') {
    if (story.iterationStage === 'quality_gates_passed') return 'approval';
    if (story.iterationStage === 'approved') return 'approved';
    return 'pair';
  }
  return 'tqa';
}

function storyMatches(
  story: StoryData,
  query: string,
  filter: BoardFilter,
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (normalizedQuery) {
    const searchable = [
      story.title,
      story.goal,
      story.reference,
      story.iterationReference,
      story.iterationLoop,
      story.iterationStage,
      story.authority.nextAction,
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    if (!searchable.includes(normalizedQuery)) return false;
  }

  if (filter === 'human') return story.authority.owner === 'human';
  if (filter === 'agent') return story.authority.owner === 'agent';
  if (filter === 'tasking') return story.iterationLoop === 'tasking';
  if (filter === 'pair') return story.iterationLoop === 'pair';
  if (filter === 'approved') {
    return (
      story.iterationLoop === 'pair' && story.iterationStage === 'approved'
    );
  }
  return true;
}

function parseFilter(value: string | null): BoardFilter {
  return FILTER_LABELS.some((item) => item.value === value)
    ? (value as BoardFilter)
    : 'all';
}

export function storyAuthorityHref(storyState: StoryState): string | null {
  const action = storyState.data.authority.nextAction;
  const relation = authorityRelation(action);
  return (
    (relation ? storyState.getLink(relation)?.href : undefined) ??
    storyState.getLink('self')?.href ??
    null
  );
}

function authorityRelation(
  action: StoryAction,
): 'understanding' | 'tasking' | 'pair' | null {
  if (
    action === 'answer_clarification' ||
    action === 'run_understanding_analyst' ||
    action === 'review_scenario_set' ||
    action === 'record_model_impact'
  ) {
    return 'understanding';
  }
  if (
    action === 'run_tasking_analyst' ||
    action === 'review_tasking_candidate' ||
    action === 'start_pair'
  ) {
    return 'tasking';
  }
  if (
    action === 'run_pair' ||
    action === 'route_pair_exception' ||
    action === 'review_pair_change' ||
    action === 'none'
  ) {
    return 'pair';
  }
  return null;
}

export function storyAuthorityLabel(action: StoryAction): string {
  const labels: Record<StoryAction, string> = {
    answer_clarification: '回答一个业务问题',
    run_understanding_analyst: '运行本地 TQA Analyst',
    review_scenario_set: '审查完整 Scenario Set',
    record_model_impact: '记录模型影响决定',
    run_tasking_analyst: '生成完整 Tasking Candidate',
    review_tasking_candidate: '执行 Desk Check',
    start_pair: '在 Desktop 启动 Pair',
    run_pair: '执行 Server 发布的 nextAction',
    route_pair_exception: '记录人工异常路由',
    review_pair_change: '审查完整本地 Story Diff',
    none: '没有 Pair 自动动作',
  };
  return labels[action];
}

function storyActionButtonLabel(story: StoryData): string {
  if (story.authority.nextAction === 'answer_clarification') return '回答';
  if (story.authority.nextAction === 'review_scenario_set') return '审查';
  if (story.authority.nextAction === 'record_model_impact') return '决定';
  if (story.authority.nextAction === 'review_tasking_candidate') {
    return 'Desk Check';
  }
  if (story.authority.nextAction === 'start_pair') return '启动';
  if (story.authority.nextAction === 'route_pair_exception') return '路由';
  if (story.authority.nextAction === 'review_pair_change') return '审批';
  if (story.authority.nextAction === 'none') return '查看证据';
  return '打开';
}

function storyOwnerLabel(owner: StoryData['authority']['owner']): string {
  return (
    {
      human: '待人工',
      agent: '待本地 Agent',
      none: '已完成',
    }[owner] ?? owner
  );
}

function ownerBadgeVariant(
  owner: StoryData['authority']['owner'],
): 'default' | 'secondary' | 'outline' {
  if (owner === 'human') return 'secondary';
  if (owner === 'agent') return 'outline';
  return 'default';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
