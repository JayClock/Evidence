import type { State, StoryResource } from '@evidence/api-client';

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
  },
  {
    key: 'scenario-model',
    title: 'Scenario and Model',
    rule: 'TQA、Scenario 审查与模型处置是这个知识位置中的内部 Gate。',
    empty: '没有 Story 正在澄清 Scenario 或模型影响。',
  },
  {
    key: 'tasking',
    title: 'Tasking',
    rule: 'Tasking Candidate 与 Desk Check 留在同一个知识位置。',
    empty: '没有 Story 等待 Tasking 或 Desk Check。',
  },
  {
    key: 'pair',
    title: 'Pair',
    rule: '逐 TEST 执行、质量门与编码审批共享一个 Pair 权威位置。',
    empty: '没有 Story 正在 Pair 或等待编码审批。',
  },
  {
    key: 'showcase',
    title: 'Showcase',
    rule: 'fresh Q2、产品观察、风险证据、独立 Review 与价值决定。',
    empty: '没有 Story 正在进行 Showcase 价值验证。',
  },
  {
    key: 'run-respond',
    title: 'Run and Respond',
    rule: 'Accepted Showcase 的知识响应、next Probe 与人工确认。',
    empty: '没有 Story 等待知识响应或已经完成本轮。',
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

function groupStories(stories: StoryState[]) {
  const grouped = new Map<DeliveryPositionKey, StoryState[]>();
  for (const story of stories) {
    const key = storyPosition(story.data);
    grouped.set(key, [...(grouped.get(key) ?? []), story]);
  }
  return grouped;
}

function storyPosition(story: StoryData): DeliveryPositionKey {
  const positionsByLoop: Partial<
    Record<StoryData['iterationLoop'], DeliveryPositionKey>
  > = {
    understand: 'scenario-model',
    tasking: 'tasking',
    pair: 'pair',
    showcase: 'showcase',
    respond: 'run-respond',
  };
  return positionsByLoop[story.iterationLoop] ?? 'problem-intake';
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

function storyAuthorityHref(storyState: StoryState): string | null {
  const relation = authorityRelation(storyState.data.authority.nextAction);
  return (
    (relation ? storyState.getLink(relation)?.href : undefined) ??
    storyState.getLink('self')?.href ??
    null
  );
}

function authorityRelation(
  action: StoryAction,
): 'understanding' | 'tasking' | 'pair' | 'showcase' | 'respond' | null {
  const relations: Partial<
    Record<
      StoryAction,
      'understanding' | 'tasking' | 'pair' | 'showcase' | 'respond'
    >
  > = {
    answer_clarification: 'understanding',
    run_understanding_analyst: 'understanding',
    review_scenario_set: 'understanding',
    record_model_impact: 'understanding',
    run_tasking_analyst: 'tasking',
    review_tasking_candidate: 'tasking',
    start_pair: 'tasking',
    run_pair: 'pair',
    route_pair_exception: 'pair',
    review_pair_change: 'pair',
    run_showcase: 'showcase',
    record_showcase_evidence: 'showcase',
    review_showcase: 'showcase',
    decide_showcase: 'showcase',
    run_respond_learner: 'respond',
    review_respond_candidate: 'respond',
  };
  return relations[action] ?? null;
}

function storyAuthorityLabel(action: StoryAction): string {
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
  const labels: Partial<Record<StoryAction, string>> = {
    answer_clarification: '回答',
    review_scenario_set: '审查',
    record_model_impact: '决定',
    review_tasking_candidate: 'Desk Check',
    start_pair: '启动',
    route_pair_exception: '路由',
    review_pair_change: '审批',
    review_showcase: 'Reviewer',
    decide_showcase: '决定',
    review_respond_candidate: '审查',
    none: '查看证据',
  };
  return labels[story.authority.nextAction] ?? '打开';
}

function storyOwnerLabel(owner: StoryData['authority']['owner']): string {
  return {
    human: '待领域专家',
    agent: '待本地 Agent',
    none: '已完成',
  }[owner];
}

function ownerEvidenceStatus(
  owner: StoryData['authority']['owner'],
): 'decision' | 'proposed' | 'verified' {
  if (owner === 'human') return 'decision';
  if (owner === 'agent') return 'proposed';
  return 'verified';
}

export {
  DELIVERY_POSITIONS,
  FILTER_LABELS,
  SCOPE_LABELS,
  groupStories,
  ownerEvidenceStatus,
  parseFilter,
  parseScope,
  scopeMatches,
  storyActionButtonLabel,
  storyAuthorityHref,
  storyAuthorityLabel,
  storyMatches,
  storyOwnerLabel,
  storyPositionTitle,
};
export type {
  BoardFilter,
  BoardScope,
  DeliveryPositionDefinition,
  DeliveryPositionKey,
  StoryData,
  StoryState,
};
