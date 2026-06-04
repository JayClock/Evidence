import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  EntityAttribute,
  LogicalEntityDescription,
  parseLogicalEntityType,
  Ref,
} from '../domain';
import type { LogicalEntity } from '../domain';
import { link, Link, workspaceLogicalEntitiesHref } from './links';
import { logicalEntityModel, LogicalEntityModel } from './model';
import { parsePositiveInteger, totalPages } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface LogicalEntityInput {
  type: string;
  subType?: string | null;
  name: string;
  label?: string | null;
  description?: string | null;
  attributes?: EntityAttribute[] | null;
}

interface UpdateLogicalEntityInput {
  type?: string | null;
  subType?: string | null;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  attributes?: EntityAttribute[] | null;
}

interface LogicalEntityCollectionModel {
  _links: Record<string, Link>;
  _embedded: { logicalEntities: LogicalEntityModel[] };
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

@Controller()
export class LogicalEntitiesController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listLogicalEntities(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<LogicalEntityCollectionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 50, 'pageSize'),
      100,
    );
    const [entities, total] = await workspace.listLogicalEntities(
      page,
      pageSize,
    );
    return logicalEntityCollection(
      workspaceId,
      entities,
      page,
      pageSize,
      total,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLogicalEntity(
    @Param('workspaceId') workspaceId: string,
    @Body() input: LogicalEntityInput,
  ): Promise<LogicalEntityModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const entity = await workspace.addLogicalEntity(
      logicalEntityInputToDescription(workspaceId, input),
    );
    return logicalEntityModel(entity);
  }

  @Get(':entityId')
  async getLogicalEntity(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
  ): Promise<LogicalEntityModel> {
    const [, entity] = await this.resolver.requireWorkspaceLogicalEntity(
      workspaceId,
      entityId,
    );
    return logicalEntityModel(entity);
  }

  @Put(':entityId')
  async updateLogicalEntity(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Body() input: UpdateLogicalEntityInput,
  ): Promise<LogicalEntityModel> {
    const [workspace, existing] =
      await this.resolver.requireWorkspaceLogicalEntity(workspaceId, entityId);
    const current = existing.description();
    const type = input.type ? parseLogicalEntityType(input.type) : current.type;
    const entity = await workspace.updateLogicalEntity(entityId, {
      workspace: current.workspace,
      type,
      subType: input.subType === undefined ? current.subType : input.subType,
      name: input.name ?? current.name,
      label: input.label === undefined ? current.label : input.label,
      description:
        input.description === undefined
          ? current.description
          : input.description,
      attributes: input.attributes ?? current.attributes,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    });
    return logicalEntityModel(entity);
  }

  @Delete(':entityId')
  async deleteLogicalEntity(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
  ): Promise<{ deleted: true }> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    await workspace.deleteLogicalEntity(entityId);
    return { deleted: true };
  }
}

function logicalEntityInputToDescription(
  workspaceId: string,
  input: LogicalEntityInput,
): LogicalEntityDescription {
  return {
    workspace: new Ref(workspaceId),
    type: parseLogicalEntityType(input.type),
    subType: input.subType ?? null,
    name: input.name,
    label: input.label ?? null,
    description: input.description ?? null,
    attributes: input.attributes ?? [],
    createdAt: '',
    updatedAt: '',
  };
}

function logicalEntityCollection(
  workspaceId: string,
  entities: LogicalEntity[],
  page: number,
  pageSize: number,
  total: number,
): LogicalEntityCollectionModel {
  const pages = totalPages(total, pageSize);
  const links: Record<string, Link> = {
    self: link(
      `${workspaceLogicalEntitiesHref(workspaceId)}?page=${page}&pageSize=${pageSize}`,
    ),
    workspace: link(`/api/workspaces/${workspaceId}`),
  };
  if (page > 1) {
    links.prev = link(
      `${workspaceLogicalEntitiesHref(workspaceId)}?page=${page - 1}&pageSize=${pageSize}`,
    );
  }
  if (page < pages) {
    links.next = link(
      `${workspaceLogicalEntitiesHref(workspaceId)}?page=${page + 1}&pageSize=${pageSize}`,
    );
  }
  return {
    _links: links,
    _embedded: { logicalEntities: entities.map(logicalEntityModel) },
    page: {
      number: page,
      size: pageSize,
      totalElements: total,
      totalPages: pages,
    },
  };
}
