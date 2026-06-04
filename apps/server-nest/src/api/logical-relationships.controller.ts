import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  LogicalRelationshipDescription,
  Ref,
  DomainError,
  USERS,
} from '../domain';
import type { LogicalRelationship, Users, Workspace } from '../domain';
import { link, Link, workspaceLogicalRelationshipsHref } from './links';
import { logicalRelationshipModel, LogicalRelationshipModel } from './model';
import { parsePositiveInteger, totalPages } from './request';

interface RefInput {
  id: string;
}

interface LogicalRelationshipInput {
  source: RefInput;
  target: RefInput;
  label?: string | null;
}

interface UpdateLogicalRelationshipInput {
  source?: RefInput | null;
  target?: RefInput | null;
  label?: string | null;
}

interface LogicalRelationshipCollectionModel {
  _links: Record<string, Link>;
  _embedded: { logicalRelationships: LogicalRelationshipModel[] };
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

@Controller('workspaces/:workspaceId/logical-relationships')
export class LogicalRelationshipsController {
  constructor(@Inject(USERS) private readonly users: Users) {}

  @Get()
  async listLogicalRelationships(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<LogicalRelationshipCollectionModel> {
    const workspace = await this.loadWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 50, 'pageSize'),
      100,
    );
    const [relationships, total] = await workspace
      .logicalRelationshipsWide()
      .list(page, pageSize);
    return logicalRelationshipCollection(
      workspaceId,
      relationships,
      page,
      pageSize,
      total,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLogicalRelationship(
    @Param('workspaceId') workspaceId: string,
    @Body() input: LogicalRelationshipInput,
  ): Promise<LogicalRelationshipModel> {
    const workspace = await this.loadWorkspace(workspaceId);
    const relationship = await workspace
      .logicalRelationshipsWide()
      .add(logicalRelationshipInputToDescription(workspaceId, input));
    return logicalRelationshipModel(relationship);
  }

  @Get(':relationshipId')
  async getLogicalRelationship(
    @Param('workspaceId') workspaceId: string,
    @Param('relationshipId') relationshipId: string,
  ): Promise<LogicalRelationshipModel> {
    const workspace = await this.loadWorkspace(workspaceId);
    const relationship = await workspace
      .logicalRelationships()
      .findByIdentity(relationshipId);
    if (!relationship) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    return logicalRelationshipModel(relationship);
  }

  @Put(':relationshipId')
  async updateLogicalRelationship(
    @Param('workspaceId') workspaceId: string,
    @Param('relationshipId') relationshipId: string,
    @Body() input: UpdateLogicalRelationshipInput,
  ): Promise<LogicalRelationshipModel> {
    const workspace = await this.loadWorkspace(workspaceId);
    const existing = await workspace
      .logicalRelationships()
      .findByIdentity(relationshipId);
    if (!existing) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    const current = existing.description();
    const relationship = await workspace
      .logicalRelationshipsWide()
      .update(relationshipId, {
        workspace: current.workspace,
        source: input.source ? new Ref(input.source.id) : current.source,
        target: input.target ? new Ref(input.target.id) : current.target,
        label: input.label === undefined ? current.label : input.label,
      });
    return logicalRelationshipModel(relationship);
  }

  @Delete(':relationshipId')
  async deleteLogicalRelationship(
    @Param('workspaceId') workspaceId: string,
    @Param('relationshipId') relationshipId: string,
  ): Promise<{ deleted: true }> {
    const workspace = await this.loadWorkspace(workspaceId);
    await workspace.logicalRelationshipsWide().delete(relationshipId);
    return { deleted: true };
  }

  private async loadWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.users.workspaces().findByIdentity(workspaceId);
    if (!workspace) {
      throw DomainError.notFound(`workspace ${workspaceId} not found`);
    }
    return workspace;
  }
}

function logicalRelationshipInputToDescription(
  workspaceId: string,
  input: LogicalRelationshipInput,
): LogicalRelationshipDescription {
  return {
    workspace: new Ref(workspaceId),
    source: new Ref(input.source.id),
    target: new Ref(input.target.id),
    label: input.label ?? null,
  };
}

function logicalRelationshipCollection(
  workspaceId: string,
  relationships: LogicalRelationship[],
  page: number,
  pageSize: number,
  total: number,
): LogicalRelationshipCollectionModel {
  const pages = totalPages(total, pageSize);
  const links: Record<string, Link> = {
    self: link(
      `${workspaceLogicalRelationshipsHref(workspaceId)}?page=${page}&pageSize=${pageSize}`,
    ),
    workspace: link(`/api/workspaces/${workspaceId}`),
  };
  if (page > 1) {
    links.prev = link(
      `${workspaceLogicalRelationshipsHref(workspaceId)}?page=${page - 1}&pageSize=${pageSize}`,
    );
  }
  if (page < pages) {
    links.next = link(
      `${workspaceLogicalRelationshipsHref(workspaceId)}?page=${page + 1}&pageSize=${pageSize}`,
    );
  }
  return {
    _links: links,
    _embedded: {
      logicalRelationships: relationships.map(logicalRelationshipModel),
    },
    page: {
      number: page,
      size: pageSize,
      totalElements: total,
      totalPages: pages,
    },
  };
}
