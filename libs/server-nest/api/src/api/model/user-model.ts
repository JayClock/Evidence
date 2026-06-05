import { User } from '@evidence/server-nest-domain';
import {
  link,
  Link,
  userHref,
  userSidebarHref,
  userWorkspacesHref,
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
      workspaces: link(userWorkspacesHref(userId)),
      sidebar: link(userSidebarHref(userId)),
    },
    id: userId,
    name: user.description().name,
    email: user.description().email,
  };
}
