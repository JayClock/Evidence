import { LogicalRelationship } from '../../domain';
import {
  link,
  Link,
  workspaceLogicalRelationshipHref,
  workspaceLogicalRelationshipsHref,
} from '../links';

interface IdRefModel {
  id: string;
}

export interface LogicalRelationshipModel {
  _links: Record<string, Link>;
  id: string;
  source: IdRefModel;
  target: IdRefModel;
  label: string | null;
}

export function logicalRelationshipModel(
  relationship: LogicalRelationship,
): LogicalRelationshipModel {
  const relationshipId = relationship.identity();
  const description = relationship.description();
  const workspaceId = description.workspace.id();
  return {
    _links: {
      self: link(workspaceLogicalRelationshipHref(workspaceId, relationshipId)),
      workspace: link(`/api/workspaces/${workspaceId}`),
      collection: link(workspaceLogicalRelationshipsHref(workspaceId)),
    },
    id: relationshipId,
    source: { id: description.source.id() },
    target: { id: description.target.id() },
    label: description.label,
  };
}
