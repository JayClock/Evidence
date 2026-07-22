import { randomUUID } from 'node:crypto';
import {
  assertStoryCandidateVersion,
  DomainError,
  Ref,
  Story,
  StoryCandidate,
  StoryRevision,
  type ConfirmedStoryCandidate,
  type StoryCandidateInput,
  type StoryCandidateListQuery,
  type StoryCandidateStatus,
  type StoryCitationDescription,
  type StoryCognitiveMode,
  type StoryListQuery,
  type WorkspaceDelivery,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { EntityList } from '../database';
import { hashStoryCandidateInput } from '../story-content';
import type { PrismaStore } from './types';

const CANDIDATE_INCLUDE = {
  citations: {
    include: { inboxRevision: true },
    orderBy: { position: 'asc' },
  },
  confirmedRevision: true,
} satisfies Prisma.StoryCandidateInclude;

const STORY_INCLUDE = {
  latestRevision: true,
  _count: { select: { revisions: true } },
} satisfies Prisma.StoryInclude;

const STORY_REVISION_INCLUDE = {
  citations: {
    include: { inboxRevision: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.StoryRevisionInclude;

type CandidateRow = Prisma.StoryCandidateGetPayload<{
  include: typeof CANDIDATE_INCLUDE;
}>;
type CandidateCitationRow = CandidateRow['citations'][number];
type StoryRow = Prisma.StoryGetPayload<{ include: typeof STORY_INCLUDE }>;
type StoryRevisionRow = Prisma.StoryRevisionGetPayload<{
  include: typeof STORY_REVISION_INCLUDE;
}>;
type StoryRevisionCitationRow = StoryRevisionRow['citations'][number];
type InboxRevisionRow = Prisma.InboxRevisionGetPayload<Record<string, never>>;

export class PrismaWorkspaceDelivery
  extends EntityList<StoryCandidate>
  implements WorkspaceDelivery
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<StoryCandidate[]> {
    const rows = await this.store.storyCandidate.findMany({
      where: { workspaceId: this.workspaceId },
      include: CANDIDATE_INCLUDE,
      orderBy: { proposedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleCandidate);
  }

  protected override async findEntity(
    id: string,
  ): Promise<StoryCandidate | null> {
    const row = await this.store.storyCandidate.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: CANDIDATE_INCLUDE,
    });
    return row ? assembleCandidate(row) : null;
  }

  override async size(): Promise<number> {
    return this.store.storyCandidate.count({
      where: { workspaceId: this.workspaceId },
    });
  }

  async listCandidates(
    query: StoryCandidateListQuery,
  ): Promise<[StoryCandidate[], number]> {
    validatePage(query.page, query.pageSize);
    const where: Prisma.StoryCandidateWhereInput = {
      workspaceId: this.workspaceId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.store.storyCandidate.findMany({
        where,
        include: CANDIDATE_INCLUDE,
        orderBy: { proposedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.store.storyCandidate.count({ where }),
    ]);
    return [rows.map(assembleCandidate), total];
  }

  async proposeCandidate(
    input: StoryCandidateInput,
    proposedByUserId: string,
  ): Promise<StoryCandidate> {
    const { candidate, contentSha256 } = hashStoryCandidateInput(input);
    const candidateId = randomUUID();
    const proposedAt = new Date();

    await this.transaction(async (store) => {
      const revisions = await requireCitationRevisions(
        store,
        this.workspaceId,
        candidate.citations,
      );
      await store.storyCandidate.create({
        data: {
          id: candidateId,
          workspaceId: this.workspaceId,
          title: candidate.title,
          problem: candidate.problem,
          role: candidate.role,
          goal: candidate.goal,
          value: candidate.value,
          cognitiveMode: candidate.cognitiveMode,
          contentSha256,
          status: 'pending',
          version: 1,
          proposedByUserId,
          proposedAt,
        },
      });
      await store.storyCandidateCitation.createMany({
        data: candidate.citations.map((citation, position) => {
          const revision = revisions[position];
          if (!revision) {
            throw DomainError.internal(
              'Story Candidate citation validation lost a revision',
            );
          }
          return {
            id: randomUUID(),
            candidateId,
            inboxRevisionId: revision.id,
            position,
            locator: citation.locator,
          };
        }),
      });
    });

    return requireCandidate(this.store, this.workspaceId, candidateId).then(
      assembleCandidate,
    );
  }

  async confirmCandidate(
    candidateId: string,
    expectedVersion: number,
    decidedByUserId: string,
  ): Promise<ConfirmedStoryCandidate> {
    assertStoryCandidateVersion(expectedVersion);
    return this.transaction(async (store) => {
      const current = await requireCandidate(
        store,
        this.workspaceId,
        candidateId,
      );
      if (current.status === 'confirmed') {
        return confirmedCandidateResult(
          store,
          this.workspaceId,
          candidateId,
          false,
        );
      }
      if (current.status === 'rejected') {
        throw DomainError.conflict(
          `Story Candidate ${candidateId} was already rejected`,
        );
      }

      const decidedAt = new Date();
      const claimed = await store.storyCandidate.updateMany({
        where: {
          id: candidateId,
          workspaceId: this.workspaceId,
          status: 'pending',
          version: expectedVersion,
        },
        data: {
          status: 'confirmed',
          version: { increment: 1 },
          decidedByUserId,
          decidedAt,
        },
      });
      if (claimed.count !== 1) {
        throw DomainError.conflict(
          `Story Candidate ${candidateId} has changed`,
        );
      }

      const storyId = randomUUID();
      const revisionId = randomUUID();
      await store.story.create({
        data: {
          id: storyId,
          workspaceId: this.workspaceId,
          latestRevisionId: null,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        },
      });
      await store.storyRevision.create({
        data: {
          id: revisionId,
          storyId,
          revisionNumber: 1,
          title: current.title,
          problem: current.problem,
          role: current.role,
          goal: current.goal,
          value: current.value,
          cognitiveMode: current.cognitiveMode,
          contentSha256: current.contentSha256,
          sourceCandidateId: candidateId,
          createdByUserId: decidedByUserId,
          createdAt: decidedAt,
        },
      });
      await store.storyRevisionCitation.createMany({
        data: current.citations.map((citation) => ({
          id: randomUUID(),
          storyRevisionId: revisionId,
          inboxRevisionId: citation.inboxRevisionId,
          position: citation.position,
          locator: citation.locator,
        })),
      });
      await store.story.update({
        where: { id: storyId },
        data: { latestRevisionId: revisionId },
      });

      return confirmedCandidateResult(
        store,
        this.workspaceId,
        candidateId,
        true,
      );
    });
  }

  async rejectCandidate(
    candidateId: string,
    expectedVersion: number,
    decidedByUserId: string,
  ): Promise<StoryCandidate> {
    assertStoryCandidateVersion(expectedVersion);
    const current = await requireCandidate(
      this.store,
      this.workspaceId,
      candidateId,
    );
    if (current.status === 'rejected') {
      return assembleCandidate(current);
    }
    if (current.status === 'confirmed') {
      throw DomainError.conflict(
        `Story Candidate ${candidateId} was already confirmed`,
      );
    }

    const updated = await this.store.storyCandidate.updateMany({
      where: {
        id: candidateId,
        workspaceId: this.workspaceId,
        status: 'pending',
        version: expectedVersion,
      },
      data: {
        status: 'rejected',
        version: { increment: 1 },
        decidedByUserId,
        decidedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw DomainError.conflict(`Story Candidate ${candidateId} has changed`);
    }
    return requireCandidate(this.store, this.workspaceId, candidateId).then(
      assembleCandidate,
    );
  }

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
  citations: StoryCandidateInput['citations'],
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
        `Story Candidate citation must reference an exact Workspace Inbox Revision: ${citation.inboxRevisionId}`,
      );
    }
    return revision;
  });
}

async function requireCandidate(
  store: PrismaStore,
  workspaceId: string,
  candidateId: string,
): Promise<CandidateRow> {
  const candidate = await store.storyCandidate.findFirst({
    where: { id: candidateId, workspaceId },
    include: CANDIDATE_INCLUDE,
  });
  if (!candidate) {
    throw DomainError.notFound(`Story Candidate ${candidateId} not found`);
  }
  return candidate;
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

async function confirmedCandidateResult(
  store: PrismaStore,
  workspaceId: string,
  candidateId: string,
  created: boolean,
): Promise<ConfirmedStoryCandidate> {
  const candidate = await requireCandidate(store, workspaceId, candidateId);
  if (!candidate.confirmedRevision) {
    throw DomainError.internal(
      `Confirmed Story Candidate ${candidateId} has no Story Revision`,
    );
  }
  const [story, revision] = await Promise.all([
    requireStory(store, workspaceId, candidate.confirmedRevision.storyId),
    store.storyRevision.findFirst({
      where: {
        id: candidate.confirmedRevision.id,
        story: { workspaceId },
      },
      include: STORY_REVISION_INCLUDE,
    }),
  ]);
  if (!revision) {
    throw DomainError.internal(
      `Confirmed Story Candidate ${candidateId} revision was not found`,
    );
  }
  return {
    candidate: assembleCandidate(candidate),
    story: assembleStory(story),
    revision: assembleStoryRevision(revision),
    created,
  };
}

function assembleCandidate(row: CandidateRow): StoryCandidate {
  return new StoryCandidate(row.id, {
    workspace: new Ref(row.workspaceId),
    title: row.title,
    problem: row.problem,
    role: row.role,
    goal: row.goal,
    value: row.value,
    cognitiveMode: row.cognitiveMode as StoryCognitiveMode,
    citations: row.citations.map(assembleCitation),
    contentSha256: row.contentSha256,
    status: row.status as StoryCandidateStatus,
    version: row.version,
    proposedBy: new Ref(row.proposedByUserId),
    proposedAt: row.proposedAt.toISOString(),
    decidedBy: row.decidedByUserId ? new Ref(row.decidedByUserId) : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    confirmedStory: row.confirmedRevision
      ? new Ref(row.confirmedRevision.storyId)
      : null,
    confirmedRevision: row.confirmedRevision
      ? new Ref(row.confirmedRevision.id)
      : null,
  });
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
    revisionCount: row._count.revisions,
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
    contentSha256: row.contentSha256,
    sourceCandidate: row.sourceCandidateId
      ? new Ref(row.sourceCandidateId)
      : null,
    createdBy: new Ref(row.createdByUserId),
    createdAt: row.createdAt.toISOString(),
  });
}

function assembleCitation(
  row: CandidateCitationRow | StoryRevisionCitationRow,
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
