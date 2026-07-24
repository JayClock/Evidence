import { Diagram } from '@evidence/server-domain';
import {
  link,
  Link,
  workspaceDiagramEdgesHref,
  workspaceDiagramHref,
  workspaceDiagramNodesHref,
  workspaceLogicalEntitiesHref,
  workspaceLogicalRelationshipsHref,
} from '../links';

export interface DiagramModel {
  _links: Record<string, Link>;
  _templates: Record<string, unknown>;
  id: string;
  title: string;
  viewport: ReturnType<Diagram['description']>['viewport'];
  createdAt: string;
  updatedAt: string;
}

export function diagramModel(diagram: Diagram): DiagramModel {
  const diagramId = diagram.identity();
  const description = diagram.description();
  const workspaceId = description.workspace.id();
  return {
    _links: {
      self: link(workspaceDiagramHref(workspaceId)),
      workspace: link(`/api/workspaces/${workspaceId}`),
      nodes: link(workspaceDiagramNodesHref(workspaceId)),
      edges: link(workspaceDiagramEdgesHref(workspaceId)),
      'logical-entities': link(workspaceLogicalEntitiesHref(workspaceId)),
      'logical-relationships': link(
        workspaceLogicalRelationshipsHref(workspaceId),
      ),
    },
    _templates: {},
    id: diagramId,
    title: description.title,
    viewport: description.viewport,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}
