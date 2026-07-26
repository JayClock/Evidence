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
  parseStoryCognitiveMode,
  type Story,
  type StoryCandidateInput,
  type StoryRevision,
  type StoryRevisionInput,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceStoriesHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
  workspaceStoryRevisionsHref,
} from './links';
import {
  storyModel,
  type StoryModel,
  storyRevisionModel,
  type StoryRevisionModel,
} from './model';
import { parsePositiveInteger, totalPages } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface StoryContentBody {
  title?: unknown;
  problem?: unknown;
  role?: unknown;
  goal?: unknown;
  value?: unknown;
  cognitiveMode?: unknown;
  citations?: unknown;
}

interface StoryRevisionBody extends StoryContentBody {
  expectedVersion?: unknown;
  expectedLatestRevisionId?: unknown;
  scenarios?: unknown;
}

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
}

interface PageModel {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
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

  @Post(':storyId/revisions')
  @HttpCode(HttpStatus.CREATED)
  async createStoryRevision(
    @Param('workspaceId') workspaceId: string,
    @Param('storyId') storyId: string,
    @Body() input: StoryRevisionBody,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<StoryRevisionModel> {
    const [workspace] = await this.resolver.requireWorkspaceStory(
      workspaceId,
      storyId,
    );
    const created = await workspace.appendStoryRevision(
      storyId,
      requiredPositiveInteger(input.expectedVersion, 'expectedVersion'),
      requiredString(
        input.expectedLatestRevisionId,
        'expectedLatestRevisionId',
      ),
      storyRevisionInput(input),
      this.resolver.currentUserId(),
    );
    response.setHeader(
      'Location',
      workspaceStoryRevisionHref(
        workspaceId,
        storyId,
        created.revision.identity(),
      ),
    );
    return storyRevisionModel(workspaceId, created.revision);
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

function storyContentInput(input: StoryContentBody): StoryCandidateInput {
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

function storyRevisionInput(input: StoryRevisionBody): StoryRevisionInput {
  const story = storyContentInput(input);
  if (!Array.isArray(input.scenarios)) {
    throw DomainError.validation('scenarios must be an array');
  }
  return {
    ...story,
    scenarios: input.scenarios.map((entry, index) => {
      const scenario = requiredObject(entry, `scenarios[${String(index)}]`);
      return {
        title: requiredString(
          scenario.title,
          `scenarios[${String(index)}].title`,
        ),
        given: requiredStringArray(
          scenario.given,
          `scenarios[${String(index)}].given`,
        ),
        when: requiredString(scenario.when, `scenarios[${String(index)}].when`),
        then: requiredStringArray(
          scenario.then,
          `scenarios[${String(index)}].then`,
        ),
      };
    }),
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

function pageDetails(page: number, pageSize: number, total: number): PageModel {
  return {
    number: page,
    size: pageSize,
    totalElements: total,
    totalPages: totalPages(total, pageSize),
  };
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

function requiredStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an array`);
  }
  return value.map((entry, index) =>
    requiredString(entry, `${name}[${String(index)}]`),
  );
}

function requiredPositiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}
