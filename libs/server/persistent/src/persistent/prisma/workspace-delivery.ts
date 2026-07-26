import { randomUUID } from 'node:crypto';
import {
  assertStoryVersion,
  DomainError,
  Ref,
  Story,
  StoryRevision,
  type CreatedStoryRevision,
  type StoryCitationDescription,
  type StoryCognitiveMode,
  type StoryListQuery,
  type StoryRevisionInput,
  type WorkspaceDelivery,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashStoryRevisionInput } from '../story-content';
import type { PrismaStore } from './types';

const STORY_INCLUDE = {
  latestRevision: {
    include: { _count: { select: { scenarios: true } } },
  },
  _count: { select: { revisions: true } },
} satisfies Prisma.StoryInclude;

const STORY_REVISION_INCLUDE = {
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
type StoryRevisionCitationRow = StoryRevisionRow['citations'][number];
type StoryScenarioRow = StoryRevisionRow['scenarios'][number];
type InboxRevisionRow = Prisma.InboxRevisionGetPayload<Record<string, never>>;

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

  async appendStoryRevision(
    storyId: string,
    expectedVersion: number,
    expectedLatestRevisionId: string,
    input: StoryRevisionInput,
    createdByUserId: string,
  ): Promise<CreatedStoryRevision> {
    assertStoryVersion(expectedVersion);
    const { revision, contentSha256 } = hashStoryRevisionInput(input);
    const revisionId = randomUUID();
    const createdAt = new Date();

    return this.transaction(async (store) => {
      const current = await requireStory(store, this.workspaceId, storyId);
      if (!current.latestRevisionId || !current.latestRevision) {
        throw DomainError.internal(`Story ${storyId} has no latest revision`);
      }
      if (
        current.version !== expectedVersion ||
        current.latestRevisionId !== expectedLatestRevisionId
      ) {
        throw DomainError.conflict(`Story ${storyId} has changed`);
      }

      const citationRevisions = await requireCitationRevisions(
        store,
        this.workspaceId,
        revision.citations,
      );
      const claimed = await store.story.updateMany({
        where: {
          id: storyId,
          workspaceId: this.workspaceId,
          version: expectedVersion,
          latestRevisionId: expectedLatestRevisionId,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw DomainError.conflict(`Story ${storyId} has changed`);
      }

      await store.storyRevision.create({
        data: {
          id: revisionId,
          storyId,
          revisionNumber: current.latestRevision.revisionNumber + 1,
          title: revision.title,
          problem: revision.problem,
          role: revision.role,
          goal: revision.goal,
          value: revision.value,
          cognitiveMode: revision.cognitiveMode,
          contentSha256,
          createdByUserId,
          createdAt,
        },
      });
      await store.storyRevisionCitation.createMany({
        data: revision.citations.map((citation, position) => {
          const inboxRevision = citationRevisions[position];
          if (!inboxRevision) {
            throw DomainError.internal(
              'Story Revision citation validation lost a revision',
            );
          }
          return {
            id: randomUUID(),
            storyRevisionId: revisionId,
            inboxRevisionId: inboxRevision.id,
            position,
            locator: citation.locator,
          };
        }),
      });
      await store.storyScenario.createMany({
        data: revision.scenarios.map((scenario, position) => ({
          id: randomUUID(),
          storyRevisionId: revisionId,
          position,
          title: scenario.title,
          givenSteps: scenario.given,
          whenStep: scenario.when,
          thenSteps: scenario.then,
        })),
      });
      await store.story.update({
        where: { id: storyId },
        data: {
          latestRevisionId: revisionId,
          updatedAt: createdAt,
        },
      });

      const [story, savedRevision] = await Promise.all([
        requireStory(store, this.workspaceId, storyId),
        store.storyRevision.findFirst({
          where: {
            id: revisionId,
            storyId,
            story: { workspaceId: this.workspaceId },
          },
          include: STORY_REVISION_INCLUDE,
        }),
      ]);
      if (!savedRevision) {
        throw DomainError.internal(
          `Created Story Revision ${revisionId} was not found`,
        );
      }
      return {
        story: assembleStory(story),
        revision: assembleStoryRevision(savedRevision),
      };
    });
  }

  private async transaction<T>(
    operation: (store: PrismaStore) => Promise<T>,
  ): Promise<T> {
    if ('$transaction' in this.store) {
      return this.store.$transaction((transaction) => operation(transaction));
    }
    return operation(this.store);
  }
}

async function requireCitationRevisions(
  store: PrismaStore,
  workspaceId: string,
  citations: StoryRevisionInput['citations'],
): Promise<InboxRevisionRow[]> {
  const revisionIds = [
    ...new Set(citations.map((item) => item.inboxRevisionId)),
  ];
  const rows = await store.inboxRevision.findMany({
    where: {
      id: { in: revisionIds },
      item: { workspaceId },
    },
  });
  const revisionsById = new Map(rows.map((row) => [row.id, row]));
  return citations.map((citation) => {
    const revision = revisionsById.get(citation.inboxRevisionId);
    if (
      !revision ||
      revision.inboxItemId !== citation.inboxItemId ||
      revision.contentSha256 !== citation.contentSha256
    ) {
      throw DomainError.validation(
        `Story Revision citation must reference an exact Workspace Inbox Revision: ${citation.inboxRevisionId}`,
      );
    }
    return revision;
  });
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

function assembleStory(row: StoryRow): Story {
  if (!row.latestRevisionId || !row.latestRevision) {
    throw DomainError.internal(`Story ${row.id} has no latest revision`);
  }
  return new Story(row.id, {
    workspace: new Ref(row.workspaceId),
    title: row.latestRevision.title,
    latestRevision: new Ref(row.latestRevisionId),
    latestRevisionNumber: row.latestRevision.revisionNumber,
    latestScenarioCount: row.latestRevision._count.scenarios,
    revisionCount: row._count.revisions,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function assembleStoryRevision(row: StoryRevisionRow): StoryRevision {
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
    title: row.title,
    given: scenarioSteps(row.givenSteps, row.id, 'Given'),
    when: row.whenStep,
    then: scenarioSteps(row.thenSteps, row.id, 'Then'),
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
