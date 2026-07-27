import {
  DomainError,
  Ref,
  Story,
  parseIterationLifecycle,
  parseIterationLoop,
  parseIterationStage,
  storyWorkflowAuthority,
  StoryRevision,
  type IterationLifecycle,
  type IterationLoop,
  type IterationStage,
  type StoryCitationDescription,
  type StoryCognitiveMode,
  type StoryListQuery,
  type StoryNextAction,
  type StoryPortfolioSummary,
  type WorkspaceDelivery,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import type { PrismaStore } from './types';

export const STORY_INCLUDE = {
  iteration: {
    select: {
      id: true,
      reference: true,
      lifecycle: true,
      loop: true,
      stage: true,
    },
  },
  latestRevision: {
    include: { _count: { select: { citations: true, scenarios: true } } },
  },
  clarifications: {
    where: { status: 'pending' },
    select: { reference: true },
    orderBy: { askedAt: 'desc' },
    take: 1,
  },
  _count: { select: { revisions: true } },
} satisfies Prisma.StoryInclude;

const STORY_PORTFOLIO_SELECT = {
  id: true,
  iteration: {
    select: {
      lifecycle: true,
      loop: true,
      stage: true,
    },
  },
  clarifications: {
    where: { status: 'pending' },
    select: { reference: true },
    orderBy: { askedAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.StorySelect;

export const STORY_REVISION_INCLUDE = {
  citations: {
    include: { inboxRevision: true },
    orderBy: { position: 'asc' },
  },
  scenarios: { orderBy: { position: 'asc' } },
} satisfies Prisma.StoryRevisionInclude;

type StoryRow = Prisma.StoryGetPayload<{ include: typeof STORY_INCLUDE }>;
type StoryRevisionRow = Prisma.StoryRevisionGetPayload<{
  include: typeof STORY_REVISION_INCLUDE;
}>;
type StoryPortfolioRow = Prisma.StoryGetPayload<{
  select: typeof STORY_PORTFOLIO_SELECT;
}>;
type StoryRevisionCitationRow = StoryRevisionRow['citations'][number];
type StoryScenarioRow = StoryRevisionRow['scenarios'][number];

export class PrismaWorkspaceDelivery implements WorkspaceDelivery {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async listStories(query: StoryListQuery): Promise<[Story[], number]> {
    validatePage(query.page, query.pageSize);
    const where: Prisma.StoryWhereInput = { workspaceId: this.workspaceId };
    const [rows, total] = await Promise.all([
      this.store.story.findMany({
        where,
        include: STORY_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.store.story.count({ where }),
    ]);
    return [rows.map(assembleStory), total];
  }

  async summarizeStories(): Promise<StoryPortfolioSummary> {
    const rows = await this.store.story.findMany({
      where: { workspaceId: this.workspaceId },
      select: STORY_PORTFOLIO_SELECT,
    });
    const stageCounts = new Map<
      string,
      { loop: IterationLoop; stage: IterationStage; count: number }
    >();
    const actionCounts = new Map<StoryNextAction, number>();
    let humanAttention = 0;
    let agentAttention = 0;
    let approved = 0;

    for (const row of rows) {
      const workflow = storyWorkflow(row);
      const stageKey = `${workflow.loop}/${workflow.stage}`;
      const stage = stageCounts.get(stageKey);
      stageCounts.set(stageKey, {
        loop: workflow.loop,
        stage: workflow.stage,
        count: (stage?.count ?? 0) + 1,
      });
      actionCounts.set(
        workflow.authority.nextAction,
        (actionCounts.get(workflow.authority.nextAction) ?? 0) + 1,
      );
      if (workflow.authority.owner === 'human') humanAttention += 1;
      if (workflow.authority.owner === 'agent') agentAttention += 1;
      if (workflow.loop === 'pair' && workflow.stage === 'approved') {
        approved += 1;
      }
    }

    return {
      humanAttention,
      agentAttention,
      approved,
      stages: [...stageCounts.values()].sort((left, right) =>
        `${left.loop}/${left.stage}`.localeCompare(
          `${right.loop}/${right.stage}`,
        ),
      ),
      actions: [...actionCounts.entries()]
        .map(([action, count]) => ({ action, count }))
        .sort((left, right) => left.action.localeCompare(right.action)),
    };
  }

  async findStory(storyId: string): Promise<Story | null> {
    const row = await this.store.story.findFirst({
      where: { id: storyId, workspaceId: this.workspaceId },
      include: STORY_INCLUDE,
    });
    return row ? assembleStory(row) : null;
  }

  async listStoryRevisions(
    storyId: string,
    page: number,
    pageSize: number,
  ): Promise<[StoryRevision[], number]> {
    validatePage(page, pageSize);
    await requireStory(this.store, this.workspaceId, storyId);
    const where: Prisma.StoryRevisionWhereInput = { storyId };
    const [rows, total] = await Promise.all([
      this.store.storyRevision.findMany({
        where,
        include: STORY_REVISION_INCLUDE,
        orderBy: { revisionNumber: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.storyRevision.count({ where }),
    ]);
    return [rows.map(assembleStoryRevision), total];
  }

  async findStoryRevision(
    storyId: string,
    revisionId: string,
  ): Promise<StoryRevision | null> {
    const row = await this.store.storyRevision.findFirst({
      where: {
        id: revisionId,
        storyId,
        story: { workspaceId: this.workspaceId },
      },
      include: STORY_REVISION_INCLUDE,
    });
    return row ? assembleStoryRevision(row) : null;
  }
}

async function requireStory(
  store: PrismaStore,
  workspaceId: string,
  storyId: string,
): Promise<StoryRow> {
  const story = await store.story.findFirst({
    where: { id: storyId, workspaceId },
    include: STORY_INCLUDE,
  });
  if (!story) {
    throw DomainError.notFound(`Story ${storyId} not found`);
  }
  return story;
}

export function assembleStory(row: StoryRow): Story {
  if (!row.latestRevisionId || !row.latestRevision) {
    throw DomainError.internal(`Story ${row.id} has no latest revision`);
  }
  if (!row.iterationId || !row.iteration) {
    throw DomainError.internal(`Story ${row.id} has no authority Iteration`);
  }
  const workflow = storyWorkflow(row);
  return new Story(row.id, {
    workspace: new Ref(row.workspaceId),
    iteration: new Ref(row.iteration.id),
    iterationReference: row.iteration.reference,
    iterationLifecycle: workflow.lifecycle,
    iterationLoop: workflow.loop,
    iterationStage: workflow.stage,
    reference: storyReference(row.reference),
    title: row.latestRevision.title,
    goal: row.latestRevision.goal,
    latestRevision: new Ref(row.latestRevisionId),
    latestRevisionNumber: row.latestRevision.revisionNumber,
    latestScenarioCount: row.latestRevision._count.scenarios,
    latestCitationCount: row.latestRevision._count.citations,
    pendingClarificationReference: workflow.pendingClarificationReference,
    authority: workflow.authority,
    revisionCount: row._count.revisions,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function assembleStoryRevision(row: StoryRevisionRow): StoryRevision {
  return new StoryRevision(row.id, {
    story: new Ref(row.storyId),
    revisionNumber: row.revisionNumber,
    title: row.title,
    problem: row.problem,
    role: row.role,
    goal: row.goal,
    value: row.value,
    cognitiveMode: row.cognitiveMode as StoryCognitiveMode,
    citations: row.citations.map(assembleCitation),
    scenarios: row.scenarios.map(assembleScenario),
    contentSha256: row.contentSha256,
    createdBy: new Ref(row.createdByUserId),
    createdAt: row.createdAt.toISOString(),
  });
}

function assembleScenario(row: StoryScenarioRow) {
  return {
    id: row.id,
    reference: row.reference,
    sourceDraftId: row.sourceDraftId,
    title: row.title,
    given: scenarioSteps(row.givenSteps, row.id, 'Given'),
    when: row.whenStep,
    then: scenarioSteps(row.thenSteps, row.id, 'Then'),
    businessData: scenarioSteps(row.businessData, row.id, 'business data'),
  };
}

function scenarioSteps(
  value: Prisma.JsonValue,
  scenarioId: string,
  phase: string,
): string[] {
  if (!Array.isArray(value)) {
    throw DomainError.internal(
      `Story Scenario ${scenarioId} has invalid ${phase} steps`,
    );
  }
  const steps = value.filter(
    (step): step is string => typeof step === 'string',
  );
  if (steps.length !== value.length) {
    throw DomainError.internal(
      `Story Scenario ${scenarioId} has invalid ${phase} steps`,
    );
  }
  return steps;
}

function assembleCitation(
  row: StoryRevisionCitationRow,
): StoryCitationDescription {
  return {
    inboxItem: new Ref(row.inboxRevision.inboxItemId),
    inboxRevision: new Ref(row.inboxRevisionId),
    inboxRevisionNumber: row.inboxRevision.revisionNumber,
    contentSha256: row.inboxRevision.contentSha256,
    locator: row.locator,
  };
}

function storyWorkflow(row: StoryRow | StoryPortfolioRow): {
  lifecycle: IterationLifecycle;
  loop: IterationLoop;
  stage: IterationStage;
  pendingClarificationReference: string | null;
  authority: ReturnType<typeof storyWorkflowAuthority>;
} {
  if (!row.iteration) {
    throw DomainError.internal(`Story ${row.id} has no authority Iteration`);
  }
  const lifecycle = parseIterationLifecycle(row.iteration.lifecycle);
  const loop = parseIterationLoop(row.iteration.loop);
  const stage = parseIterationStage(row.iteration.stage);
  const pendingClarificationReference =
    row.clarifications?.[0]?.reference ?? null;
  return {
    lifecycle,
    loop,
    stage,
    pendingClarificationReference,
    authority: storyWorkflowAuthority({
      lifecycle,
      loop,
      stage,
      hasPendingClarification: pendingClarificationReference !== null,
    }),
  };
}

function storyReference(value: string | null): 'US-001' {
  if (value !== 'US-001') {
    throw DomainError.internal(`unsupported Story reference: ${String(value)}`);
  }
  return value;
}

function validatePage(page: number, pageSize: number): void {
  if (
    !Number.isSafeInteger(page) ||
    page <= 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize <= 0
  ) {
    throw DomainError.validation('page and pageSize must be greater than 0');
  }
}
