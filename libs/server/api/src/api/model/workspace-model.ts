import { Workspace } from '@evidence/server-domain';
import {
  link,
  Link,
  workspaceDiagramHref,
  workspaceHref,
  workspaceLogicalEntitiesHref,
  workspaceLogicalRelationshipsHref,
  workspaceMembersHref,
  workspacesHref,
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

export function workspaceModel(workspace: Workspace): WorkspaceModel {
  const workspaceId = workspace.identity();
  const description = workspace.description();
  return {
    _links: {
      self: link(workspaceHref(workspaceId)),
      members: link(workspaceMembersHref(workspaceId)),
      diagram: link(workspaceDiagramHref(workspaceId)),
      'logical-entities': link(workspaceLogicalEntitiesHref(workspaceId)),
      'logical-relationships': link(
        workspaceLogicalRelationshipsHref(workspaceId),
      ),
      collection: link(workspacesHref()),
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
