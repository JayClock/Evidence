import { DiagramEdge, JsonObject, Ref } from '@evidence/server-domain';
import {
  link,
  Link,
  workspaceDiagramEdgeHref,
  workspaceDiagramEdgesHref,
  workspaceDiagramHref,
} from '../links';

export interface EdgeModel {
  _links: Record<string, Link>;
  id: string;
  source: Ref<string>;
  target: Ref<string>;
  logicalRelationship: Ref<string> | null;
  sourceHandle: string | null;
  targetHandle: string | null;
  kind: string | null;
  style: JsonObject;
  data: JsonObject;
  animated: boolean;
  hidden: boolean;
  markerStart: JsonObject | null;
  markerEnd: JsonObject | null;
  pathOptions: JsonObject;
  interactionWidth: number | null;
  createdAt: string;
  updatedAt: string;
}

export function edgeModel(workspaceId: string, edge: DiagramEdge): EdgeModel {
  const edgeId = edge.identity();
  const description = edge.description();
  return {
    _links: {
      self: link(workspaceDiagramEdgeHref(workspaceId, edgeId)),
      collection: link(workspaceDiagramEdgesHref(workspaceId)),
      diagram: link(workspaceDiagramHref(workspaceId)),
    },
    id: edgeId,
    source: description.source,
    target: description.target,
    logicalRelationship: description.logicalRelationship,
    sourceHandle: description.sourceHandle,
    targetHandle: description.targetHandle,
    kind: description.kind,
    style: description.style,
    data: description.data,
    animated: description.animated,
    hidden: description.hidden,
    markerStart: description.markerStart,
    markerEnd: description.markerEnd,
    pathOptions: description.pathOptions,
    interactionWidth: description.interactionWidth,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}
