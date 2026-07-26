import { Workspace } from '@evidence/server-domain';
import {
  link,
  Link,
  workspaceDiagramHref,
  workspaceHref,
  workspaceInboxExtractionsHref,
  workspaceInboxItemsHref,
  workspaceIterationsHref,
  workspaceLogicalEntitiesHref,
  workspaceLogicalRelationshipsHref,
  workspaceMembersHref,
  workspaceStoriesHref,
  workspaceStoryCandidatesHref,
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
      'inbox-items': link(workspaceInboxItemsHref(workspaceId)),
      'inbox-extractions': link(workspaceInboxExtractionsHref(workspaceId)),
      'story-candidates': link(workspaceStoryCandidatesHref(workspaceId)),
      iterations: link(workspaceIterationsHref(workspaceId)),
      stories: link(workspaceStoriesHref(workspaceId)),
      'logical-entities': link(workspaceLogicalEntitiesHref(workspaceId)),
      'logical-relationships': link(
        workspaceLogicalRelationshipsHref(workspaceId),
      ),
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
