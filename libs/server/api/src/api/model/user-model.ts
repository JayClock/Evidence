import { User } from '@evidence/server-domain';
import {
  link,
  Link,
  userHref,
  userMembershipsHref,
  userSidebarHref,
  userWorkspacesHref,
  workspacesHref,
} from '../links';

export interface UserModel {
  _links: Record<string, Link>;
  id: string;
  name: string;
  email: string | null;
}

export function userModel(user: User): UserModel {
  const userId = user.identity();
  return {
    _links: {
      self: link(userHref(userId)),
      memberships: link(userMembershipsHref(userId)),
      'create-workspace': link(workspacesHref()),
      workspaces: link(userWorkspacesHref(userId)),
      sidebar: link(userSidebarHref(userId)),
    },
    id: userId,
    name: user.description().name,
    email: user.description().email,
  };
}
