import { DiagramNode, LogicalEntity, Ref } from '../../domain';
import {
  link,
  Link,
  workspaceDiagramHref,
  workspaceDiagramNodeHref,
  workspaceDiagramNodesHref,
  workspaceLogicalEntityHref,
} from '../links';
import { logicalEntityModel, LogicalEntityModel } from './logical-entity-model';

interface NodeEmbedded {
  'logical-entity': LogicalEntityModel;
}

export interface NodeModel {
  _links: Record<string, Link>;
  _embedded?: NodeEmbedded;
  id: string;
  kind: string;
  parent: Ref<string> | null;
  position: ReturnType<DiagramNode['description']>['position'];
  width: number | null;
  height: number | null;
  data: ReturnType<DiagramNode['description']>['data'];
  createdAt: string;
  updatedAt: string;
}

export function nodeModel(
  workspaceId: string,
  node: DiagramNode,
  logicalEntity: LogicalEntity | null,
): NodeModel {
  const nodeId = node.identity();
  const description = node.description();
  const diagramId = description.diagram.id();
  const links: Record<string, Link> = {
    self: link(workspaceDiagramNodeHref(workspaceId, diagramId, nodeId)),
    collection: link(workspaceDiagramNodesHref(workspaceId, diagramId)),
    diagram: link(workspaceDiagramHref(workspaceId, diagramId)),
  };
  if (description.logicalEntity) {
    links['logical-entity'] = link(
      workspaceLogicalEntityHref(workspaceId, description.logicalEntity.id()),
    );
  }

  const model: NodeModel = {
    _links: links,
    id: nodeId,
    kind: description.kind,
    parent: description.parent,
    position: description.position,
    width: description.width,
    height: description.height,
    data: description.data,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
  if (logicalEntity) {
    model._embedded = { 'logical-entity': logicalEntityModel(logicalEntity) };
  }
  return model;
}
