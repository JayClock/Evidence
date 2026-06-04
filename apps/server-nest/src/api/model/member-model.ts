import { Member } from '../../domain';
import {
  link,
  Link,
  userHref,
  workspaceHref,
  workspaceMemberHref,
  workspaceMembersHref,
} from '../links';

interface RefModel {
  _links: Record<string, Link>;
  id: string;
}

export interface MemberModel {
  _links: Record<string, Link>;
  id: string;
  workspace: RefModel;
  user: RefModel;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export function memberModel(userId: string, member: Member): MemberModel {
  const workspaceId = member.workspaceId();
  const memberUserId = member.description().user.id();
  return {
    _links: {
      self: link(workspaceMemberHref(userId, workspaceId, member.identity())),
      collection: link(workspaceMembersHref(userId, workspaceId)),
      workspace: link(workspaceHref(userId, workspaceId)),
      user: link(userHref(memberUserId)),
    },
    id: member.identity(),
    workspace: {
      _links: { self: link(workspaceHref(userId, workspaceId)) },
      id: workspaceId,
    },
    user: {
      _links: { self: link(userHref(memberUserId)) },
      id: memberUserId,
    },
    role: member.description().role,
    createdAt: member.createdAt(),
    updatedAt: member.updatedAt(),
  };
}
