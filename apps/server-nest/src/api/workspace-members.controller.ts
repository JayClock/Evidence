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
} from '@nestjs/common';
import { Ref, DomainError, USERS } from '../domain';
import type { Users } from '../domain';
import { link, Link, workspaceHref, workspaceMembersHref } from './links';
import { findWorkspace } from './loaders';
import { MemberModel, memberModel } from './model';

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
  constructor(@Inject(USERS) private readonly users: Users) {}

  @Get()
  async listWorkspaceMembers(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<MemberCollectionModel> {
    const workspace = await findWorkspace(this.users, userId, workspaceId);
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
    const workspace = await findWorkspace(this.users, userId, workspaceId);
    const member = await workspace.members().findByIdentity(memberId);
    if (!member) {
      throw DomainError.notFound(`workspace member ${memberId} not found`);
    }
    return memberModel(userId, member);
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWorkspaceMember(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    const workspace = await findWorkspace(this.users, userId, workspaceId);
    const member = await workspace.members().findByIdentity(memberId);
    if (!member) {
      throw DomainError.notFound(`workspace member ${memberId} not found`);
    }
    await workspace.membersWide().removeMember(member.description().user.id());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addWorkspaceMember(
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() input: AddMemberInput,
  ): Promise<MemberModel> {
    const workspace = await findWorkspace(this.users, userId, workspaceId);
    const member = await workspace.membersWide().addMember({
      workspace: new Ref(workspaceId),
      user: new Ref(input.user.id),
      role: input.role ?? 'member',
      createdAt: '',
      updatedAt: '',
    });
    return memberModel(userId, member);
  }
}
