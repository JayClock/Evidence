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
  Res,
} from '@nestjs/common';
import {
  DomainError,
  type WorkspaceDescription,
} from '@evidence/server-domain';
import { workspaceHref } from './links';
import { WorkspaceModel, workspaceModel } from './model';
import { ResourceResolver } from './resource-resolver.service';

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
}

interface WorkspaceInput {
  title?: string | null;
  description?: string | null;
  status?: string | null;
  metadata?: Record<string, string> | null;
}

@Controller()
export class WorkspacesController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkspace(
    @Body() input: WorkspaceInput,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<WorkspaceModel> {
    const workspace = await this.resolver.createWorkspace(
      workspaceInputToDescription(input),
    );
    response.setHeader('Location', workspaceHref(workspace.identity()));
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
  rejectLocalPaths(input);
  const metadata = { ...(input.metadata ?? {}) };

  return {
    title: input.title ?? '',
    description: input.description ?? null,
    status: input.status ?? 'active',
    metadata,
    createdAt: '',
    updatedAt: '',
  };
}

function rejectLocalPaths(input: WorkspaceInput): void {
  const record = input as WorkspaceInput & Record<string, unknown>;
  const forbidden = ['path', 'rootPath', 'repositoryRoot', 'evidenceRoot'];
  const metadata = input.metadata ?? {};
  if (
    Object.hasOwn(record, 'path') ||
    forbidden.some((key) => Object.hasOwn(metadata, key))
  ) {
    throw DomainError.validation(
      'local repository paths must be bound by the Desktop app',
    );
  }
}
