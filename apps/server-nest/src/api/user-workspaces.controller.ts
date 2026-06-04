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
import { ServerError, USERS } from '../domain';
import type { Users, WorkspaceDescription } from '../domain';
import { link, Link, userHref, userWorkspacesPageHref } from './links';
import { findUser, findWorkspace } from './loaders';
import { WorkspaceModel, workspaceModel } from './model';
import { addPageLinks, PageModel, pageModel, PageQuery } from './pagination';

interface WorkspaceInput {
  title: string;
  description?: string | null;
  status?: string | null;
  metadata?: Record<string, string> | null;
}

interface WorkspaceCollectionModel {
  _links: Record<string, Link>;
  _embedded: { workspaces: WorkspaceModel[] };
  page: PageModel;
}

@Controller('users/:userId/workspaces')
export class UserWorkspacesController {
  constructor(@Inject(USERS) private readonly users: Users) {}

  @Get()
  async listWorkspaces(
    @Param('userId') userId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<WorkspaceCollectionModel> {
    const user = await findUser(this.users, userId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );

    const [workspaces, total] = await user
      .workspaces()
      .list(page, pageSize, null);
    const pageQuery: PageQuery = { page, pageSize, totalElements: total };
    const links: Record<string, Link> = {
      self: link(userWorkspacesPageHref(userId, page, pageSize)),
      user: link(userHref(userId)),
    };
    addPageLinks(links, pageQuery, (targetPage) =>
      userWorkspacesPageHref(userId, targetPage, pageSize),
    );

    return {
      _links: links,
      _embedded: {
        workspaces: workspaces.map((workspace) =>
          workspaceModel(userId, workspace),
        ),
      },
      page: pageModel(pageQuery),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkspace(
    @Param('userId') userId: string,
    @Body() input: WorkspaceInput,
  ): Promise<WorkspaceModel> {
    const user = await findUser(this.users, userId);
    const workspace = await user
      .workspaces()
      .create(workspaceInputToDescription(input));
    return workspaceModel(userId, workspace);
  }

  @Get(':workspaceId')
  async getWorkspace(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceModel> {
    const workspace = await findWorkspace(this.users, userId, workspaceId);
    return workspaceModel(userId, workspace);
  }

  @Put(':workspaceId')
  async updateWorkspace(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() input: WorkspaceInput,
  ): Promise<WorkspaceModel> {
    const user = await findUser(this.users, userId);
    const workspace = await user
      .workspaces()
      .update(workspaceId, workspaceInputToDescription(input));
    return workspaceModel(userId, workspace);
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkspace(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<void> {
    const user = await findUser(this.users, userId);
    await user.workspaces().delete(workspaceId);
  }
}

function workspaceInputToDescription(
  input: WorkspaceInput,
): WorkspaceDescription {
  return {
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? 'active',
    metadata: input.metadata ?? {},
    createdAt: '',
    updatedAt: '',
  };
}

function parsePositiveInteger(
  input: string | undefined,
  defaultValue: number,
  name: string,
): number {
  if (input === undefined) {
    return defaultValue;
  }
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw ServerError.validation(`${name} must be greater than 0`);
  }
  return value;
}
