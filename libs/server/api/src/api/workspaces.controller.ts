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
} from '@nestjs/common';
import type { WorkspaceDescription } from '@evidence/server-domain';
import { WorkspaceModel, workspaceModel } from './model';
import { ResourceResolver } from './resource-resolver.service';

interface WorkspaceInput {
  title?: string | null;
  path?: string | null;
  description?: string | null;
  status?: string | null;
  metadata?: Record<string, string> | null;
}

@Controller()
export class WorkspacesController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkspace(@Body() input: WorkspaceInput): Promise<WorkspaceModel> {
    const workspace = await this.resolver.createWorkspace(
      workspaceInputToDescription(input),
    );
    return workspaceModel(workspace);
  }

  @Get(':workspaceId')
  async getWorkspace(
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceModel> {
    return workspaceModel(await this.resolver.requireWorkspace(workspaceId));
  }

  @Put(':workspaceId')
  async updateWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() input: WorkspaceInput,
  ): Promise<WorkspaceModel> {
    const workspace = await this.resolver.updateWorkspace(
      workspaceId,
      workspaceInputToDescription(input),
    );
    return workspaceModel(workspace);
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkspace(
    @Param('workspaceId') workspaceId: string,
  ): Promise<void> {
    await this.resolver.deleteWorkspace(workspaceId);
  }
}

function workspaceInputToDescription(
  input: WorkspaceInput,
): WorkspaceDescription {
  const metadata = { ...(input.metadata ?? {}) };
  const path = input.path?.trim();
  if (path) {
    metadata.repositoryRoot = path;
  }

  return {
    title: input.title ?? '',
    description: input.description ?? null,
    status: input.status ?? 'active',
    metadata,
    createdAt: '',
    updatedAt: '',
  };
}
