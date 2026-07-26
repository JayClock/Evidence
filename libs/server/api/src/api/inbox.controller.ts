import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  DomainError,
  parseInboxItemStatus,
  type InboxItem,
  type InboxItemStatus,
  type InboxRevision,
  type InboxSourceInput,
  type JsonValue,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceInboxExtractionsHref,
  workspaceInboxItemHref,
  workspaceInboxItemsHref,
  workspaceInboxRevisionsHref,
} from './links';
import {
  inboxItemModel,
  type InboxItemModel,
  inboxRevisionModel,
  type InboxRevisionModel,
} from './model';
import { parsePositiveInteger, totalPages } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface InboxSourceBody {
  sourceKind?: unknown;
  externalKey?: unknown;
  title?: unknown;
  body?: unknown;
  contentType?: unknown;
  uri?: unknown;
  providerMetadata?: unknown;
  sourceUpdatedAt?: unknown;
}

interface InboxSourceUpdateBody {
  title?: unknown;
  body?: unknown;
  contentType?: unknown;
  uri?: unknown;
  providerMetadata?: unknown;
  sourceUpdatedAt?: unknown;
  expectedLatestRevisionSha256?: unknown;
}

interface InboxStatusBody {
  status?: unknown;
  expectedVersion?: unknown;
}

interface InboxItemCollectionModel {
  _links: Record<string, Link>;
  _embedded: { inboxItems: InboxItemModel[] };
  page: PageModel;
}

interface InboxRevisionCollectionModel {
  _links: Record<string, Link>;
  _embedded: { inboxRevisions: InboxRevisionModel[] };
  page: PageModel;
}

interface PageModel {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

@Controller()
export class InboxController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listInboxItems(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
    @Query('status') statusInput?: string,
    @Query('sourceKind') sourceKindInput?: string,
    @Query('q') queryInput?: string,
  ): Promise<InboxItemCollectionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const status = optionalStatus(statusInput);
    const sourceKind = optionalQuery(sourceKindInput);
    const query = optionalQuery(queryInput);
    const [items, total] = await workspace.listInboxItems({
      page,
      pageSize,
      ...(status ? { status } : {}),
      ...(sourceKind ? { sourceKind } : {}),
      ...(query ? { query } : {}),
    });
    return inboxItemCollection(
      workspaceId,
      items,
      page,
      pageSize,
      total,
      status,
      sourceKind,
      query,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async captureInboxItem(
    @Param('workspaceId') workspaceId: string,
    @Body() input: InboxSourceBody,
  ): Promise<InboxItemModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const captured = await workspace.captureInboxSource(sourceInput(input));
    return inboxItemModel(captured.item);
  }

  @Get(':itemId')
  async getInboxItem(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
  ): Promise<InboxItemModel> {
    const [, item] = await this.resolver.requireWorkspaceInboxItem(
      workspaceId,
      itemId,
    );
    return inboxItemModel(item);
  }

  @Patch(':itemId')
  async changeInboxItemStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body() input: InboxStatusBody,
  ): Promise<InboxItemModel> {
    const [workspace] = await this.resolver.requireWorkspaceInboxItem(
      workspaceId,
      itemId,
    );
    const status = parseInboxItemStatus(requiredString(input.status, 'status'));
    const expectedVersion = requiredPositiveInteger(
      input.expectedVersion,
      'expectedVersion',
    );
    return inboxItemModel(
      await workspace.changeInboxItemStatus(itemId, status, expectedVersion),
    );
  }

  @Get(':itemId/revisions')
  async listInboxRevisions(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<InboxRevisionCollectionModel> {
    const [workspace] = await this.resolver.requireWorkspaceInboxItem(
      workspaceId,
      itemId,
    );
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const [revisions, total] = await workspace.listInboxRevisions(
      itemId,
      page,
      pageSize,
    );
    return inboxRevisionCollection(
      workspaceId,
      itemId,
      revisions,
      page,
      pageSize,
      total,
    );
  }

  @Post(':itemId/revisions')
  @HttpCode(HttpStatus.OK)
  async updateInboxSource(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body() input: InboxSourceUpdateBody,
  ): Promise<InboxRevisionModel> {
    const [workspace, item] = await this.resolver.requireWorkspaceInboxItem(
      workspaceId,
      itemId,
    );
    const itemDescription = item.description();
    const latestRevision = await workspace.findInboxRevision(
      itemId,
      itemDescription.latestRevisionId,
    );
    if (!latestRevision) {
      throw DomainError.internal(
        `Inbox item ${itemId} latest revision was not found`,
      );
    }
    const latestDescription = latestRevision.description();
    const captured = await workspace.appendInboxRevision(
      itemId,
      sourceInput({
        sourceKind: itemDescription.sourceKind,
        externalKey: itemDescription.externalKey,
        title: input.title ?? latestDescription.title,
        body: input.body ?? latestDescription.body,
        contentType: input.contentType ?? latestDescription.contentType,
        uri: input.uri === undefined ? latestDescription.uri : input.uri,
        providerMetadata:
          input.providerMetadata === undefined
            ? latestDescription.providerMetadata
            : input.providerMetadata,
        sourceUpdatedAt:
          input.sourceUpdatedAt === undefined
            ? latestDescription.sourceUpdatedAt
            : input.sourceUpdatedAt,
      }),
      requiredString(
        input.expectedLatestRevisionSha256,
        'expectedLatestRevisionSha256',
      ),
    );
    return inboxRevisionModel(workspaceId, captured.revision);
  }

  @Get(':itemId/revisions/:revisionId')
  async getInboxRevision(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Param('revisionId') revisionId: string,
  ): Promise<InboxRevisionModel> {
    const [, , revision] = await this.resolver.requireWorkspaceInboxRevision(
      workspaceId,
      itemId,
      revisionId,
    );
    return inboxRevisionModel(workspaceId, revision);
  }
}

function sourceInput(input: InboxSourceBody): InboxSourceInput {
  return {
    sourceKind: requiredString(input.sourceKind, 'sourceKind'),
    externalKey: requiredString(input.externalKey, 'externalKey'),
    title: requiredString(input.title, 'title'),
    body: requiredString(input.body, 'body', false),
    contentType: requiredString(
      input.contentType,
      'contentType',
    ) as InboxSourceInput['contentType'],
    uri: optionalString(input.uri, 'uri'),
    providerMetadata: metadata(input.providerMetadata),
    sourceUpdatedAt: optionalString(input.sourceUpdatedAt, 'sourceUpdatedAt'),
  };
}

function inboxItemCollection(
  workspaceId: string,
  items: InboxItem[],
  page: number,
  pageSize: number,
  total: number,
  status?: InboxItemStatus,
  sourceKind?: string,
  query?: string,
): InboxItemCollectionModel {
  const pages = totalPages(total, pageSize);
  const href = (targetPage: number) =>
    inboxItemsPageHref(
      workspaceId,
      targetPage,
      pageSize,
      status,
      sourceKind,
      query,
    );
  const links: Record<string, Link> = {
    self: link(href(page)),
    workspace: link(workspaceHref(workspaceId)),
    'inbox-extractions': link(workspaceInboxExtractionsHref(workspaceId)),
  };
  if (page > 1) links.prev = link(href(page - 1));
  if (page < pages) links.next = link(href(page + 1));
  return {
    _links: links,
    _embedded: { inboxItems: items.map(inboxItemModel) },
    page: pageDetails(page, pageSize, total),
  };
}

function inboxRevisionCollection(
  workspaceId: string,
  itemId: string,
  revisions: InboxRevision[],
  page: number,
  pageSize: number,
  total: number,
): InboxRevisionCollectionModel {
  const pages = totalPages(total, pageSize);
  const href = (targetPage: number) =>
    `${workspaceInboxRevisionsHref(workspaceId, itemId)}?page=${String(targetPage)}&pageSize=${String(pageSize)}`;
  const links: Record<string, Link> = {
    self: link(href(page)),
    item: link(workspaceInboxItemHref(workspaceId, itemId)),
  };
  if (page > 1) links.prev = link(href(page - 1));
  if (page < pages) links.next = link(href(page + 1));
  return {
    _links: links,
    _embedded: {
      inboxRevisions: revisions.map((revision) =>
        inboxRevisionModel(workspaceId, revision),
      ),
    },
    page: pageDetails(page, pageSize, total),
  };
}

function inboxItemsPageHref(
  workspaceId: string,
  page: number,
  pageSize: number,
  status?: InboxItemStatus,
  sourceKind?: string,
  query?: string,
): string {
  const parameters = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) parameters.set('status', status);
  if (sourceKind) parameters.set('sourceKind', sourceKind);
  if (query) parameters.set('q', query);
  return `${workspaceInboxItemsHref(workspaceId)}?${parameters.toString()}`;
}

function pageDetails(page: number, pageSize: number, total: number): PageModel {
  return {
    number: page,
    size: pageSize,
    totalElements: total,
    totalPages: totalPages(total, pageSize),
  };
}

function optionalStatus(
  value: string | undefined,
): InboxItemStatus | undefined {
  const normalized = optionalQuery(value);
  return normalized ? parseInboxItemStatus(normalized) : undefined;
}

function optionalQuery(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function requiredString(value: unknown, name: string, trim = true): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`${name} is required`);
  }
  return trim ? value.trim() : value;
}

function optionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw DomainError.validation(`${name} must be a string`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}

function metadata(value: unknown): Record<string, JsonValue> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation('providerMetadata must be an object');
  }
  return value as Record<string, JsonValue>;
}
