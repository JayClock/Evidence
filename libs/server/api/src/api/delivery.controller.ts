import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  Story,
  StoryPortfolioSummary,
  StoryRevision,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceStoriesHref,
  workspaceStoryHref,
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
  summary: StoryPortfolioSummary;
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
    const [[stories, total], summary] = await Promise.all([
      workspace.listStories({ page, pageSize }),
      workspace.summarizeStories(),
    ]);
    return storyCollection(
      workspaceId,
      stories,
      page,
      pageSize,
      total,
      summary,
    );
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

function storyCollection(
  workspaceId: string,
  stories: Story[],
  page: number,
  pageSize: number,
  total: number,
  summary: StoryPortfolioSummary,
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
    summary,
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
