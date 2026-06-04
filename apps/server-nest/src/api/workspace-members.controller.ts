import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Ref } from '../domain';
import { link, Link, workspaceHref, workspaceMembersHref } from './links';
import { MemberModel, memberModel } from './model';
import { ResourceResolver } from './resource-resolver.service';

interface RefInput {
  id: string;
}

interface AddMemberInput {
  user: RefInput;
  role?: string | null;
}

interface MemberCollectionModel {
  _links: Record<string, Link>;
  _embedded: { members: MemberModel[] };
  total: number;
}

@Controller('users/:userId/workspaces/:workspaceId/members')
export class WorkspaceMembersController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listWorkspaceMembers(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<MemberCollectionModel> {
    const workspace = await this.resolver.requireUserWorkspace(
      userId,
      workspaceId,
    );
    const total = await workspace.members().size();
    const members = await workspace.members().findAll(0, total);

    return {
      _links: {
        self: link(workspaceMembersHref(userId, workspaceId)),
        workspace: link(workspaceHref(userId, workspaceId)),
      },
      _embedded: {
        members: members.map((member) => memberModel(userId, member)),
      },
      total,
    };
  }

  @Get(':memberId')
  async getWorkspaceMember(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
  ): Promise<MemberModel> {
    const [, member] = await this.resolver.requireUserWorkspaceMember(
      userId,
      workspaceId,
      memberId,
    );
    return memberModel(userId, member);
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWorkspaceMember(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    const [workspace, member] = await this.resolver.requireUserWorkspaceMember(
      userId,
      workspaceId,
      memberId,
    );
    await workspace.removeMember(member.description().user.id());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addWorkspaceMember(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() input: AddMemberInput,
  ): Promise<MemberModel> {
    const workspace = await this.resolver.requireUserWorkspace(
      userId,
      workspaceId,
    );
    const member = await workspace.addMember({
      workspace: new Ref(workspaceId),
      user: new Ref(input.user.id),
      role: input.role ?? 'member',
      createdAt: '',
      updatedAt: '',
    });
    return memberModel(userId, member);
  }
}
