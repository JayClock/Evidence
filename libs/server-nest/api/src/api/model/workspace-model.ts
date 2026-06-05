import { Workspace } from '@evidence/server-nest-domain';
import {
  link,
  Link,
  userHref,
  userWorkspacesHref,
  workspaceDiagramsHref,
  workspaceHref,
  workspaceLogicalEntitiesHref,
  workspaceLogicalRelationshipsHref,
  workspaceMembersHref,
} from '../links';

export interface WorkspaceModel {
  _links: Record<string, Link>;
  id: string;
  title: string;
  description: string | null;
  status: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export function workspaceModel(
  userId: string,
  workspace: Workspace,
): WorkspaceModel {
  const workspaceId = workspace.identity();
  const description = workspace.description();
  return {
    _links: {
      self: link(workspaceHref(userId, workspaceId)),
      user: link(userHref(userId)),
      members: link(workspaceMembersHref(userId, workspaceId)),
      diagrams: link(workspaceDiagramsHref(workspaceId)),
      'logical-entities': link(workspaceLogicalEntitiesHref(workspaceId)),
      'logical-relationships': link(
        workspaceLogicalRelationshipsHref(workspaceId),
      ),
      collection: link(userWorkspacesHref(userId)),
    },
    id: workspaceId,
    title: description.title,
    description: description.description,
    status: description.status,
    metadata: description.metadata,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}
