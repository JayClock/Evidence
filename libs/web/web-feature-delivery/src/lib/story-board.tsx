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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EvidenceCanvas,
  EvidenceStatusBadge,
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
import {
  FileInputIcon,
  ListChecksIcon,
  NetworkIcon,
  PresentationIcon,
  RefreshCwIcon,
  TerminalIcon,
  type LucideIcon,
} from 'lucide-react';
import { DeliveryPagination } from './delivery-pagination';

type StoryState = State<StoryResource>;
type StoryData = StoryResource['data'];
type StoryAction = StoryData['authority']['nextAction'];
type BoardFilter = 'all' | 'human' | 'accepted';
type BoardScope = 'overall' | 'iteration' | 'construction';
type DeliveryPositionKey =
  | 'problem-intake'
  | 'scenario-model'
  | 'tasking'
  | 'pair'
  | 'showcase'
  | 'run-respond';

interface DeliveryPositionDefinition {
  empty: string;
  icon: LucideIcon;
  key: DeliveryPositionKey;
  rule: string;
  title: string;
}

const DELIVERY_POSITIONS: DeliveryPositionDefinition[] = [
  {
    key: 'problem-intake',
    title: 'Problem and Intake',
    rule: '来源、Revision、Extraction 与 Candidate 在 Story 创建前建立问题权威。',
    empty: 'Intake 与 Candidate 在独立权威资源中维护。',
    icon: FileInputIcon,
  },
  {
    key: 'scenario-model',
    title: 'Scenario and Model',
    rule: 'TQA、Scenario 审查与模型处置是这个知识位置中的内部 Gate。',
    empty: '没有 Story 正在澄清 Scenario 或模型影响。',
    icon: NetworkIcon,
  },
  {
    key: 'tasking',
    title: 'Tasking',
    rule: 'Tasking Candidate 与 Desk Check 留在同一个知识位置。',
    empty: '没有 Story 等待 Tasking 或 Desk Check。',
    icon: ListChecksIcon,
  },
  {
    key: 'pair',
    title: 'Pair',
    rule: '逐 TEST 执行、质量门与编码审批共享一个 Pair 权威位置。',
    empty: '没有 Story 正在 Pair 或等待编码审批。',
    icon: TerminalIcon,
  },
  {
    key: 'showcase',
    title: 'Showcase',
    rule: 'fresh Q2、产品观察、风险证据、独立 Review 与价值决定。',
    empty: '没有 Story 正在进行 Showcase 价值验证。',
    icon: PresentationIcon,
  },
  {
    key: 'run-respond',
    title: 'Run and Respond',
    rule: 'Accepted Showcase 的知识响应、next Probe 与人工确认。',
    empty: '没有 Story 等待知识响应或已经完成本轮。',
    icon: RefreshCwIcon,
  },
];

const FILTER_LABELS: Array<{ value: BoardFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'human', label: '待人工' },
  { value: 'accepted', label: '已接受' },
];

const SCOPE_LABELS: Array<{ value: BoardScope; label: string }> = [
  { value: 'overall', label: 'Overall Delivery' },
  { value: 'iteration', label: 'Current Iteration' },
  { value: 'construction', label: 'Software Construction' },
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
  const [scope, setScope] = useState<BoardScope>(() =>
    parseScope(initialQuery.get('scope')),
  );
  const [selectedStory, setSelectedStory] = useState<StoryState | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const focusedIterationReference =
    collectionState.collection.find(
      (storyState) => storyState.data.iterationLifecycle === 'active',
    )?.data.iterationReference ??
    collectionState.collection[0]?.data.iterationReference;
  const stories = useMemo(
    () =>
      collectionState.collection.filter(
        (storyState) =>
          scopeMatches(storyState.data, scope, focusedIterationReference) &&
          storyMatches(storyState.data, deferredQuery, filter),
      ),
    [
      collectionState.collection,
      deferredQuery,
      filter,
      focusedIterationReference,
      scope,
    ],
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
            权威交付 · {collectionState.data.page.totalElements} 个已确认 Story
          </PageEyebrow>
          <PageTitle>交付知识位置</PageTitle>
          <PageDescription>
            六个位置投影同一套 Server authority。TQA、Desk Check
            与编码审批是位置内部 Gate，不再成为独立看板列。
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>

      <PageToolbar className="flex-wrap gap-2">
        <label className="w-72 shrink-0">
          <span className="sr-only">搜索 Story</span>
          <Input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Story、Iteration 或阶段…"
            type="search"
            value={query}
          />
        </label>
        <ToggleGroup
          aria-label="范围视角"
          className="max-w-full flex-wrap justify-start"
          onValueChange={(value) => {
            if (value) setScope(value as BoardScope);
          }}
          size="sm"
          spacing={0}
          type="single"
          value={scope}
          variant="outline"
        >
          {SCOPE_LABELS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="权威状态筛选"
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
        <EvidenceStatusBadge label="Server authority" status="locked" />
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

      {collectionState.data.page.totalPages > 1 ? (
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
      ) : null}

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
    <div
      aria-label="交付知识位置"
      className="h-full overflow-x-auto bg-background p-3"
    >
      <div className="grid h-full min-w-[72rem] grid-cols-6 gap-px overflow-hidden rounded-lg border bg-border">
        {DELIVERY_POSITIONS.map((position, index) => {
          const positionStories = grouped.get(position.key) ?? [];
          const Icon = position.icon;
          return (
            <section
              aria-labelledby={`delivery-position-${position.key}`}
              className="flex min-w-0 flex-col gap-3 bg-card p-3"
              key={position.key}
            >
              <header className="flex min-h-14 shrink-0 items-start gap-2 border-b pb-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[0.6875rem] text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h2
                    className="truncate text-xs font-semibold"
                    id={`delivery-position-${position.key}`}
                    title={position.rule}
                  >
                    {position.title}
                  </h2>
                </span>
                <Badge variant="outline">{positionStories.length}</Badge>
              </header>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {positionStories.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-[0.6875rem] leading-4 text-muted-foreground">
                    {position.empty}
                  </p>
                ) : (
                  positionStories.map((storyState) => (
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

  return (
    <button
      aria-label={`快速查看 ${story.title}`}
      className="flex w-full flex-col gap-1.5 rounded-md border bg-card p-2.5 text-left outline-none transition-colors hover:border-ev-line-strong hover:bg-secondary/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
      onClick={() => onInspect(storyState)}
      type="button"
    >
      <span className="font-mono text-[0.6875rem] text-muted-foreground">
        {story.reference} · {story.iterationReference}
      </span>
      <span className="line-clamp-3 text-xs font-bold">{story.title}</span>
      <EvidenceStatusBadge
        label={storyOwnerLabel(story.authority.owner)}
        status={ownerEvidenceStatus(story.authority.owner)}
      />
      <span className="text-[0.6875rem] text-muted-foreground">
        当前位置 · {storyPositionTitle(story)}
      </span>
    </button>
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
            <AlertTitle>知识位置由权威状态推导</AlertTitle>
            <AlertDescription>
              此视图只投影 Server 权威 Iteration loop /
              stage；位置不可拖拽，动作仍受当前 HAL relation 与 optimistic
              version 约束。
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
            <QuickFact label="Showcase authority">
              产品观察与 Accept / Revise / Reject 只能由人提交
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
  const grouped = new Map<DeliveryPositionKey, StoryState[]>();
  for (const story of stories) {
    const key = storyPosition(story.data);
    grouped.set(key, [...(grouped.get(key) ?? []), story]);
  }
  return grouped;
}

function storyPosition(story: StoryData): DeliveryPositionKey {
  if (story.iterationLoop === 'understand') return 'scenario-model';
  if (story.iterationLoop === 'tasking') return 'tasking';
  if (story.iterationLoop === 'pair') return 'pair';
  if (story.iterationLoop === 'showcase') return 'showcase';
  if (story.iterationLoop === 'respond') return 'run-respond';
  return 'problem-intake';
}

function storyPositionTitle(story: StoryData): string {
  const key = storyPosition(story);
  return (
    DELIVERY_POSITIONS.find((position) => position.key === key)?.title ?? key
  );
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
  if (filter === 'accepted') {
    return (
      story.iterationLoop === 'respond' && story.iterationStage === 'accepted'
    );
  }
  return true;
}

function scopeMatches(
  story: StoryData,
  scope: BoardScope,
  focusedIterationReference: string | undefined,
): boolean {
  if (scope === 'overall') return true;
  if (scope === 'iteration') {
    return story.iterationReference === focusedIterationReference;
  }
  return story.iterationLoop === 'tasking' || story.iterationLoop === 'pair';
}

function parseFilter(value: string | null): BoardFilter {
  return FILTER_LABELS.some((item) => item.value === value)
    ? (value as BoardFilter)
    : 'all';
}

function parseScope(value: string | null): BoardScope {
  return SCOPE_LABELS.some((item) => item.value === value)
    ? (value as BoardScope)
    : 'overall';
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
): 'understanding' | 'tasking' | 'pair' | 'showcase' | 'respond' | null {
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
    action === 'review_pair_change'
  ) {
    return 'pair';
  }
  if (
    action === 'run_showcase' ||
    action === 'record_showcase_evidence' ||
    action === 'review_showcase' ||
    action === 'decide_showcase'
  ) {
    return 'showcase';
  }
  if (
    action === 'run_respond_learner' ||
    action === 'review_respond_candidate'
  ) {
    return 'respond';
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
    run_showcase: '重新执行批准的 Q2',
    record_showcase_evidence: '记录产品观察与风险证据',
    review_showcase: '运行独立 Showcase Reviewer',
    decide_showcase: '执行人工价值决定',
    run_respond_learner: '运行只读 Respond Learner',
    review_respond_candidate: '审查知识响应与 next Probe',
    none: '没有自动动作',
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
  if (story.authority.nextAction === 'review_showcase') return 'Reviewer';
  if (story.authority.nextAction === 'decide_showcase') return '决定';
  if (story.authority.nextAction === 'review_respond_candidate') return '审查';
  if (story.authority.nextAction === 'none') return '查看证据';
  return '打开';
}

function storyOwnerLabel(owner: StoryData['authority']['owner']): string {
  return (
    {
      human: '待领域专家',
      agent: '待本地 Agent',
      none: '已完成',
    }[owner] ?? owner
  );
}

function ownerEvidenceStatus(
  owner: StoryData['authority']['owner'],
): 'decision' | 'proposed' | 'verified' {
  if (owner === 'human') return 'decision';
  if (owner === 'agent') return 'proposed';
  return 'verified';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
