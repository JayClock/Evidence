import { formatSubType, LogicalEntity } from '@evidence/server-nest-domain';
import {
  link,
  Link,
  workspaceLogicalEntitiesHref,
  workspaceLogicalEntityHref,
} from '../links';

export interface LogicalEntityModel {
  _links: Record<string, Link>;
  id: string;
  type: string;
  subType: string | null;
  name: string;
  label: string | null;
  description: string | null;
  attributes: ReturnType<LogicalEntity['description']>['attributes'];
  createdAt: string;
  updatedAt: string;
}

export function logicalEntityModel(entity: LogicalEntity): LogicalEntityModel {
  const entityId = entity.identity();
  const description = entity.description();
  const workspaceId = description.workspace.id();
  return {
    _links: {
      self: link(workspaceLogicalEntityHref(workspaceId, entityId)),
      workspace: link(`/api/workspaces/${workspaceId}`),
      collection: link(workspaceLogicalEntitiesHref(workspaceId)),
    },
    id: entityId,
    type: description.type,
    subType: formatSubType(description.type, description.subType),
    name: description.name,
    label: description.label,
    description: description.description,
    attributes: description.attributes,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}
