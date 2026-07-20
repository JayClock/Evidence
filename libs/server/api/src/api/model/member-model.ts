import { Member, Workspace } from '@evidence/server-domain';
import {
  link,
  Link,
  userHref,
  workspaceHref,
  workspaceMemberHref,
  workspaceMembersHref,
} from '../links';
import { WorkspaceModel, workspaceModel } from './workspace-model';

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

export interface MembershipModel {
  _links: Record<string, Link>;
  id: string;
  workspace: WorkspaceModel;
  user: RefModel;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export function memberModel(member: Member): MemberModel {
  const description = member.description();
  const workspaceId = description.workspace.id();
  const memberUserId = description.user.id();
  return {
    _links: memberLinks(member),
    id: member.identity(),
    workspace: {
      _links: { self: link(workspaceHref(workspaceId)) },
      id: workspaceId,
    },
    user: {
      _links: { self: link(userHref(memberUserId)) },
      id: memberUserId,
    },
    role: description.role,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}

export function membershipModel(
  membership: Member,
  workspace: Workspace,
): MembershipModel {
  const description = membership.description();
  const memberUserId = description.user.id();
  return {
    _links: memberLinks(membership),
    id: membership.identity(),
    workspace: workspaceModel(workspace),
    user: {
      _links: { self: link(userHref(memberUserId)) },
      id: memberUserId,
    },
    role: description.role,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}

function memberLinks(member: Member): Record<string, Link> {
  const description = member.description();
  const workspaceId = description.workspace.id();
  const memberUserId = description.user.id();
  return {
    self: link(workspaceMemberHref(workspaceId, member.identity())),
    collection: link(workspaceMembersHref(workspaceId)),
    workspace: link(workspaceHref(workspaceId)),
    user: link(userHref(memberUserId)),
  };
}
