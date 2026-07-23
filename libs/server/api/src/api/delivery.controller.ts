import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  DomainError,
  parseStoryCandidateStatus,
  parseStoryCognitiveMode,
  type Story,
  type StoryCandidate,
  type StoryCandidateInput,
  type StoryCandidateStatus,
  type StoryRevision,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceStoriesHref,
  workspaceStoryCandidateHref,
  workspaceStoryCandidatesHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
  workspaceStoryRevisionsHref,
} from './links';
import {
  storyCandidateModel,
  type StoryCandidateModel,
  storyModel,
  type StoryModel,
  storyRevisionModel,
  type StoryRevisionModel,
} from './model';
import { parsePositiveInteger, totalPages } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface StoryCandidateBody {
  title?: unknown;
  problem?: unknown;
  role?: unknown;
  goal?: unknown;
  value?: unknown;
  cognitiveMode?: unknown;
  citations?: unknown;
}

interface CandidateDecisionBody {
  expectedVersion?: unknown;
}

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
  status(code: number): void;
}

interface PageModel {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

interface StoryCandidateCollectionModel {
  _links: Record<string, Link>;
  _embedded: { storyCandidates: StoryCandidateModel[] };
  page: PageModel;
}

interface StoryCollectionModel {
  _links: Record<string, Link>;
  _embedded: { stories: StoryModel[] };
  page: PageModel;
}

interface StoryRevisionCollectionModel {
  _links: Record<string, Link>;
  _embedded: { storyRevisions: StoryRevisionModel[] };
  page: PageModel;
}

@Controller()
export class StoryCandidatesController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listStoryCandidates(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
    @Query('status') statusInput?: string,
  ): Promise<StoryCandidateCollectionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const status = optionalCandidateStatus(statusInput);
    const [candidates, total] = await workspace.listStoryCandidates({
      page,
      pageSize,
      ...(status ? { status } : {}),
    });
    return candidateCollection(
      workspaceId,
      candidates,
      page,
      pageSize,
      total,
      status,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async proposeStoryCandidate(
    @Param('workspaceId') workspaceId: string,
    @Body() input: StoryCandidateBody,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<StoryCandidateModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const candidate = await workspace.proposeStoryCandidate(
      storyCandidateInput(input),
      this.resolver.currentUserId(),
    );
    response.setHeader(
      'Location',
      workspaceStoryCandidateHref(workspaceId, candidate.identity()),
    );
    return storyCandidateModel(candidate);
  }

  @Get(':candidateId')
  async getStoryCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
  ): Promise<StoryCandidateModel> {
    const [, candidate] = await this.resolver.requireWorkspaceStoryCandidate(
      workspaceId,
      candidateId,
    );
    return storyCandidateModel(candidate);
  }

  @Post(':candidateId/confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmStoryCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
    @Body() input: CandidateDecisionBody,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<StoryRevisionModel> {
    const [workspace] = await this.resolver.requireWorkspaceStoryCandidate(
      workspaceId,
      candidateId,
    );
    const confirmed = await workspace.confirmStoryCandidate(
      candidateId,
      requiredPositiveInteger(input.expectedVersion, 'expectedVersion'),
      this.resolver.currentUserId(),
    );
    response.status(confirmed.created ? HttpStatus.CREATED : HttpStatus.OK);
    response.setHeader(
      'Location',
      workspaceStoryRevisionHref(
        workspaceId,
        confirmed.story.identity(),
        confirmed.revision.identity(),
      ),
    );
    return storyRevisionModel(workspaceId, confirmed.revision);
  }

  @Post(':candidateId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectStoryCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
    @Body() input: CandidateDecisionBody,
  ): Promise<StoryCandidateModel> {
    const [workspace] = await this.resolver.requireWorkspaceStoryCandidate(
      workspaceId,
      candidateId,
    );
    return storyCandidateModel(
      await workspace.rejectStoryCandidate(
        candidateId,
        requiredPositiveInteger(input.expectedVersion, 'expectedVersion'),
        this.resolver.currentUserId(),
      ),
    );
  }
}

@Controller()
export class StoriesController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listStories(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<StoryCollectionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const [stories, total] = await workspace.listStories({ page, pageSize });
    return storyCollection(workspaceId, stories, page, pageSize, total);
  }

  @Get(':storyId')
  async getStory(
    @Param('workspaceId') workspaceId: string,
    @Param('storyId') storyId: string,
  ): Promise<StoryModel> {
    const [, story] = await this.resolver.requireWorkspaceStory(
      workspaceId,
      storyId,
    );
    return storyModel(story);
  }

  @Get(':storyId/revisions')
  async listStoryRevisions(
    @Param('workspaceId') workspaceId: string,
    @Param('storyId') storyId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<StoryRevisionCollectionModel> {
    const [workspace] = await this.resolver.requireWorkspaceStory(
      workspaceId,
      storyId,
    );
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const [revisions, total] = await workspace.listStoryRevisions(
      storyId,
      page,
      pageSize,
    );
    return revisionCollection(
      workspaceId,
      storyId,
      revisions,
      page,
      pageSize,
      total,
    );
  }

  @Get(':storyId/revisions/:revisionId')
  async getStoryRevision(
    @Param('workspaceId') workspaceId: string,
    @Param('storyId') storyId: string,
    @Param('revisionId') revisionId: string,
  ): Promise<StoryRevisionModel> {
    const [, , revision] = await this.resolver.requireWorkspaceStoryRevision(
      workspaceId,
      storyId,
      revisionId,
    );
    return storyRevisionModel(workspaceId, revision);
  }
}

function storyCandidateInput(input: StoryCandidateBody): StoryCandidateInput {
  if (!Array.isArray(input.citations)) {
    throw DomainError.validation('citations must be an array');
  }
  return {
    title: requiredString(input.title, 'title'),
    problem: requiredString(input.problem, 'problem'),
    role: requiredString(input.role, 'role'),
    goal: requiredString(input.goal, 'goal'),
    value: requiredString(input.value, 'value'),
    cognitiveMode: parseStoryCognitiveMode(
      requiredString(input.cognitiveMode, 'cognitiveMode'),
    ),
    citations: input.citations.map((entry, index) => {
      const citation = requiredObject(entry, `citations[${String(index)}]`);
      return {
        inboxItemId: requiredString(
          citation.inboxItemId,
          `citations[${String(index)}].inboxItemId`,
        ),
        inboxRevisionId: requiredString(
          citation.inboxRevisionId,
          `citations[${String(index)}].inboxRevisionId`,
        ),
        contentSha256: requiredString(
          citation.contentSha256,
          `citations[${String(index)}].contentSha256`,
        ),
        locator: requiredString(
          citation.locator,
          `citations[${String(index)}].locator`,
        ),
      };
    }),
  };
}

function candidateCollection(
  workspaceId: string,
  candidates: StoryCandidate[],
  page: number,
  pageSize: number,
  total: number,
  status?: StoryCandidateStatus,
): StoryCandidateCollectionModel {
  const pages = totalPages(total, pageSize);
  const href = (targetPage: number) =>
    candidatePageHref(workspaceId, targetPage, pageSize, status);
  const links: Record<string, Link> = {
    self: link(href(page)),
    workspace: link(workspaceHref(workspaceId)),
  };
  if (page > 1) links.prev = link(href(page - 1));
  if (page < pages) links.next = link(href(page + 1));
  return {
    _links: links,
    _embedded: {
      storyCandidates: candidates.map(storyCandidateModel),
    },
    page: pageDetails(page, pageSize, total),
  };
}

function storyCollection(
  workspaceId: string,
  stories: Story[],
  page: number,
  pageSize: number,
  total: number,
): StoryCollectionModel {
  const pages = totalPages(total, pageSize);
  const href = (targetPage: number) =>
    `${workspaceStoriesHref(workspaceId)}?page=${String(targetPage)}&pageSize=${String(pageSize)}`;
  const links: Record<string, Link> = {
    self: link(href(page)),
    workspace: link(workspaceHref(workspaceId)),
  };
  if (page > 1) links.prev = link(href(page - 1));
  if (page < pages) links.next = link(href(page + 1));
  return {
    _links: links,
    _embedded: { stories: stories.map(storyModel) },
    page: pageDetails(page, pageSize, total),
  };
}

function revisionCollection(
  workspaceId: string,
  storyId: string,
  revisions: StoryRevision[],
  page: number,
  pageSize: number,
  total: number,
): StoryRevisionCollectionModel {
  const pages = totalPages(total, pageSize);
  const href = (targetPage: number) =>
    `${workspaceStoryRevisionsHref(workspaceId, storyId)}?page=${String(targetPage)}&pageSize=${String(pageSize)}`;
  const links: Record<string, Link> = {
    self: link(href(page)),
    story: link(workspaceStoryHref(workspaceId, storyId)),
  };
  if (page > 1) links.prev = link(href(page - 1));
  if (page < pages) links.next = link(href(page + 1));
  return {
    _links: links,
    _embedded: {
      storyRevisions: revisions.map((revision) =>
        storyRevisionModel(workspaceId, revision),
      ),
    },
    page: pageDetails(page, pageSize, total),
  };
}

function candidatePageHref(
  workspaceId: string,
  page: number,
  pageSize: number,
  status?: StoryCandidateStatus,
): string {
  const parameters = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) parameters.set('status', status);
  return `${workspaceStoryCandidatesHref(workspaceId)}?${parameters.toString()}`;
}

function pageDetails(page: number, pageSize: number, total: number): PageModel {
  return {
    number: page,
    size: pageSize,
    totalElements: total,
    totalPages: totalPages(total, pageSize),
  };
}

function optionalCandidateStatus(
  value: string | undefined,
): StoryCandidateStatus | undefined {
  const normalized = value?.trim();
  return normalized ? parseStoryCandidateStatus(normalized) : undefined;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`${name} is required`);
  }
  return value.trim();
}

function requiredObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredPositiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}
