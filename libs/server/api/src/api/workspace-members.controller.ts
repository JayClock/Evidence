import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Ref } from '@evidence/server-domain';
import { link, Link, workspaceHref, workspaceMembersHref } from './links';
import { MemberModel, memberModel } from './model';
import { addPageLinks, PageModel, pageModel, PageQuery } from './pagination';
import { parsePositiveInteger } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface RefInput {
  id: string;
}

interface AddMemberInput {
  user: RefInput;
  role?: string | null;
}

interface UpdateMemberInput {
  role: string;
}

interface MemberCollectionModel {
  _links: Record<string, Link>;
  _embedded: { members: MemberModel[] };
  page: PageModel;
}

@Controller()
export class WorkspaceMembersController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listWorkspaceMembers(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<MemberCollectionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const total = await workspace.members().findAll().size();
    const members = await workspace
      .members()
      .findAll()
      .subCollection((page - 1) * pageSize, page * pageSize)
      .toArray();
    const pageQuery: PageQuery = { page, pageSize, totalElements: total };
    const links: Record<string, Link> = {
      self: link(workspaceMembersHref(workspaceId)),
      workspace: link(workspaceHref(workspaceId)),
    };
    addPageLinks(
      links,
      pageQuery,
      (targetPage) =>
        `${workspaceMembersHref(workspaceId)}?page=${targetPage}&pageSize=${pageSize}`,
    );

    return {
      _links: links,
      _embedded: { members: members.map(memberModel) },
      page: pageModel(pageQuery),
    };
  }

  @Get(':memberId')
  async getWorkspaceMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
  ): Promise<MemberModel> {
    const [, member] = await this.resolver.requireWorkspaceMember(
      workspaceId,
      memberId,
    );
    return memberModel(member);
  }

  @Patch(':memberId')
  async updateWorkspaceMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() input: UpdateMemberInput,
  ): Promise<MemberModel> {
    const [workspace] = await this.resolver.requireWorkspaceMember(
      workspaceId,
      memberId,
    );
    return memberModel(await workspace.updateMember(memberId, input.role));
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWorkspaceMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    const [workspace] = await this.resolver.requireWorkspaceMember(
      workspaceId,
      memberId,
    );
    await workspace.removeMember(memberId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addWorkspaceMember(
    @Param('workspaceId') workspaceId: string,
    @Body() input: AddMemberInput,
  ): Promise<MemberModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const member = await workspace.addMember({
      workspace: new Ref(workspaceId),
      user: new Ref(input.user.id),
      role: input.role ?? 'member',
      createdAt: '',
      updatedAt: '',
    });
    return memberModel(member);
  }
}
