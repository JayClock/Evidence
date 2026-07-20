import { Controller, Get, Param, Query } from '@nestjs/common';
import { link, Link, userHref, userMembershipsPageHref } from './links';
import { MembershipModel, membershipModel } from './model';
import { addPageLinks, PageModel, pageModel, PageQuery } from './pagination';
import { parsePositiveInteger } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface MembershipCollectionModel {
  _links: Record<string, Link>;
  _embedded: { memberships: MembershipModel[] };
  page: PageModel;
}

@Controller()
export class UserMembershipsController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listMemberships(
    @Param('userId') userId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<MembershipCollectionModel> {
    const memberships = await this.resolver.requireUserMemberships(userId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const [items, total] = await memberships.list(page, pageSize);
    const pageQuery: PageQuery = { page, pageSize, totalElements: total };
    const links: Record<string, Link> = {
      self: link(userMembershipsPageHref(userId, page, pageSize)),
      user: link(userHref(userId)),
    };
    addPageLinks(links, pageQuery, (targetPage) =>
      userMembershipsPageHref(userId, targetPage, pageSize),
    );

    return {
      _links: links,
      _embedded: {
        memberships: items.map(({ member, workspace }) =>
          membershipModel(member, workspace),
        ),
      },
      page: pageModel(pageQuery),
    };
  }
}
