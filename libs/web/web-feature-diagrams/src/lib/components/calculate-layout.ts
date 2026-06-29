import type { Edge, Node } from '@xyflow/react';
import ELK, {
  type ElkExtendedEdge,
  type ElkNode,
} from 'elkjs/lib/elk.bundled.js';

import type { DiagramNodeData } from './diagram-types';

type DiagramNode = Node<DiagramNodeData>;
type DiagramEdge = Edge;
type Position = { x: number; y: number };

const ROOT_GRAPH_ID = '__evidence-root__';
const elk = new ELK();

export const LAYOUT_NODE_WIDTH = 160;
export const LAYOUT_NODE_HEIGHT = 80;
export const LAYOUT_GAP_X = 80;
export const LAYOUT_GAP_Y = 40;
export const LAYOUT_START_X = 120;
export const LAYOUT_AXIS_Y = 240;
export const CONTEXT_LAYOUT_PADDING_X = 80;
export const CONTEXT_LAYOUT_PADDING_Y = 80;
export const CONTEXT_LAYOUT_GAP_X = 80;

function buildLayoutOptions(): Record<string, string> {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYOUT_GAP_X),
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': String(CONTEXT_LAYOUT_GAP_X),
    'elk.spacing.nodeNode': String(LAYOUT_GAP_Y),
  };
}

function buildContainerLayoutOptions(): Record<string, string> {
  return {
    ...buildLayoutOptions(),
    'elk.padding': `[top=${CONTEXT_LAYOUT_PADDING_Y},left=${CONTEXT_LAYOUT_PADDING_X},bottom=${CONTEXT_LAYOUT_PADDING_Y},right=${CONTEXT_LAYOUT_PADDING_X}]`,
  };
}

function resolveParentId(
  node: DiagramNode,
  nodeIds: Set<string>,
): string | undefined {
  const parentId = node.parentId;

  if (!parentId || parentId === node.id || !nodeIds.has(parentId)) {
    return undefined;
  }

  return parentId;
}

function buildChildrenByParentId(
  nodes: DiagramNode[],
): Map<string | undefined, DiagramNode[]> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const childrenByParentId = new Map<string | undefined, DiagramNode[]>();

  for (const node of nodes) {
    const parentId = resolveParentId(node, nodeIds);
    const children = childrenByParentId.get(parentId) ?? [];
    children.push(node);
    childrenByParentId.set(parentId, children);
  }

  return childrenByParentId;
}

function getNodeHeight(node: DiagramNode | undefined): number {
  return node?.height ?? LAYOUT_NODE_HEIGHT;
}

function getNodeWidth(node: DiagramNode | undefined): number {
  return node?.width ?? LAYOUT_NODE_WIDTH;
}

function toElkNode(
  node: DiagramNode,
  childrenByParentId: Map<string | undefined, DiagramNode[]>,
): ElkNode {
  const childNodes = childrenByParentId.get(node.id) ?? [];
  const hasChildren = childNodes.length > 0;
  const elkNode: ElkNode = {
    id: node.id,
    layoutOptions: hasChildren
      ? buildContainerLayoutOptions()
      : buildLayoutOptions(),
  };

  if (hasChildren) {
    elkNode.children = childNodes.map((childNode) =>
      toElkNode(childNode, childrenByParentId),
    );
  } else {
    elkNode.height = getNodeHeight(node);
    elkNode.width = getNodeWidth(node);
  }

  return elkNode;
}

function toElkEdges(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): ElkExtendedEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));

  return edges
    .filter(
      (edge) =>
        edge.hidden !== true &&
        edge.source !== edge.target &&
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target),
    )
    .map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    }));
}

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isEvidenceNode(node: DiagramNode | undefined): boolean {
  return normalizedString(node?.data.type) === 'evidence';
}

function isThingNode(node: DiagramNode | undefined): boolean {
  return (
    normalizedString(node?.data.type) === 'participant' &&
    normalizedString(node?.data.subType) === 'thing'
  );
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function edgeSearchText(edge: DiagramEdge): string {
  const data = edge.data ?? {};
  const values = [
    edge.id,
    stringValue(edge.label),
    stringValue(data.name),
    stringValue(data.label),
    stringValue(data.relationType),
    stringValue(data.relation_type),
    stringValue(data.relationshipType),
    stringValue(data.relationship_type),
    stringValue(data.type),
  ];

  return values
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

function edgeSearchTokens(edge: DiagramEdge): Set<string> {
  return new Set(
    edgeSearchText(edge)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

function hasAnyToken(edge: DiagramEdge, tokens: readonly string[]): boolean {
  const edgeTokens = edgeSearchTokens(edge);

  return tokens.some((token) => edgeTokens.has(token));
}

function isNonLayoutThingEdge(edge: DiagramEdge): boolean {
  return hasAnyToken(edge, [
    'belongs',
    'parent',
    'reference',
    'references',
    'source',
    'target',
  ]);
}

function isHierarchyThingEdge(edge: DiagramEdge): boolean {
  return hasAnyToken(edge, [
    'contain',
    'contains',
    'has',
    'include',
    'includes',
  ]);
}

function isThingLayoutEdge(
  edge: DiagramEdge,
  hasEvidenceLinkedThing: boolean,
): boolean {
  if (isNonLayoutThingEdge(edge)) {
    return false;
  }

  return hasEvidenceLinkedThing || isHierarchyThingEdge(edge);
}

function orientedEdge(
  edge: DiagramEdge,
  source: string,
  target: string,
): DiagramEdge {
  if (edge.source === source && edge.target === target) {
    return edge;
  }

  return {
    ...edge,
    source,
    target,
  };
}

function evidenceLinkedThingIds(
  edges: DiagramEdge[],
  nodeById: Map<string, DiagramNode>,
): Set<string> {
  const thingIds = new Set<string>();

  for (const edge of edges) {
    if (edge.hidden === true) {
      continue;
    }

    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    if (
      sourceNode &&
      targetNode &&
      isEvidenceNode(sourceNode) &&
      isThingNode(targetNode)
    ) {
      thingIds.add(targetNode.id);
    } else if (
      sourceNode &&
      targetNode &&
      isThingNode(sourceNode) &&
      isEvidenceNode(targetNode)
    ) {
      thingIds.add(sourceNode.id);
    }
  }

  return thingIds;
}

function fallbackCenterThingIds(
  thingEdges: DiagramEdge[],
  nodeById: Map<string, DiagramNode>,
): Set<string> {
  const incomingThingIds = new Set<string>();
  const sourceThingIds = new Set<string>();

  for (const edge of thingEdges) {
    if (!isHierarchyThingEdge(edge)) {
      continue;
    }

    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    if (
      !sourceNode ||
      !targetNode ||
      !isThingNode(sourceNode) ||
      !isThingNode(targetNode)
    ) {
      continue;
    }

    sourceThingIds.add(sourceNode.id);
    incomingThingIds.add(targetNode.id);
  }

  const rootThingIds = [...sourceThingIds].filter(
    (thingId) => !incomingThingIds.has(thingId),
  );

  return new Set(rootThingIds.length > 0 ? rootThingIds : sourceThingIds);
}

function thingLevels(
  centerThingIds: Set<string>,
  thingEdges: DiagramEdge[],
): Map<string, number> {
  const levels = new Map<string, number>();
  const adjacentThingIds = new Map<string, Set<string>>();

  for (const edge of thingEdges) {
    const sourceAdjacentIds = adjacentThingIds.get(edge.source) ?? new Set();
    sourceAdjacentIds.add(edge.target);
    adjacentThingIds.set(edge.source, sourceAdjacentIds);

    const targetAdjacentIds = adjacentThingIds.get(edge.target) ?? new Set();
    targetAdjacentIds.add(edge.source);
    adjacentThingIds.set(edge.target, targetAdjacentIds);
  }

  const queue: string[] = [];
  for (const thingId of centerThingIds) {
    levels.set(thingId, 0);
    queue.push(thingId);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const thingId = queue[index];
    const level = levels.get(thingId) ?? 0;

    for (const adjacentThingId of adjacentThingIds.get(thingId) ?? []) {
      if (levels.has(adjacentThingId)) {
        continue;
      }

      levels.set(adjacentThingId, level + 1);
      queue.push(adjacentThingId);
    }
  }

  return levels;
}

function orientThingEdgeByLevel(
  edge: DiagramEdge,
  levels: Map<string, number>,
): DiagramEdge {
  const sourceLevel = levels.get(edge.source);
  const targetLevel = levels.get(edge.target);

  if (sourceLevel === undefined || targetLevel === undefined) {
    return edge;
  }

  if (sourceLevel < targetLevel) {
    return edge;
  }

  if (targetLevel < sourceLevel) {
    return orientedEdge(edge, edge.target, edge.source);
  }

  return edge;
}

function buildLayoutEdges(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const centerThingIds = evidenceLinkedThingIds(edges, nodeById);
  const hasEvidenceLinkedThing = centerThingIds.size > 0;
  const thingEdges = edges.filter((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    return (
      edge.hidden !== true &&
      isThingNode(sourceNode) &&
      isThingNode(targetNode) &&
      isThingLayoutEdge(edge, hasEvidenceLinkedThing)
    );
  });
  const effectiveCenterThingIds =
    centerThingIds.size > 0
      ? centerThingIds
      : fallbackCenterThingIds(thingEdges, nodeById);
  const levels = thingLevels(effectiveCenterThingIds, thingEdges);

  return edges.flatMap((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    if (!sourceNode || !targetNode || edge.hidden === true) {
      return [];
    }

    const sourceIsThing = isThingNode(sourceNode);
    const targetIsThing = isThingNode(targetNode);
    const sourceIsEvidence = isEvidenceNode(sourceNode);
    const targetIsEvidence = isEvidenceNode(targetNode);

    if (sourceIsThing && targetIsThing) {
      if (!isThingLayoutEdge(edge, hasEvidenceLinkedThing)) {
        return [];
      }

      return [orientThingEdgeByLevel(edge, levels)];
    }

    if (sourceIsEvidence && targetIsThing) {
      return [edge];
    }

    if (sourceIsThing && targetIsEvidence) {
      return [orientedEdge(edge, edge.target, edge.source)];
    }

    return [edge];
  });
}

function toElkGraph(nodes: DiagramNode[], edges: DiagramEdge[]): ElkNode {
  const childrenByParentId = buildChildrenByParentId(nodes);
  const rootChildren = childrenByParentId.get(undefined) ?? [];

  return {
    id: ROOT_GRAPH_ID,
    children: rootChildren.map((node) => toElkNode(node, childrenByParentId)),
    edges: toElkEdges(nodes, buildLayoutEdges(nodes, edges)),
    layoutOptions: buildLayoutOptions(),
  };
}

function collectLayoutedNodes(
  layoutedNode: ElkNode,
  nodeById = new Map<string, ElkNode>(),
): Map<string, ElkNode> {
  if (layoutedNode.id !== ROOT_GRAPH_ID) {
    nodeById.set(layoutedNode.id, layoutedNode);
  }

  for (const childNode of layoutedNode.children ?? []) {
    collectLayoutedNodes(childNode, nodeById);
  }

  return nodeById;
}

function finiteNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolvedPosition(
  node: DiagramNode,
  layoutedNode: ElkNode | undefined,
): Position {
  return {
    x: finiteNumber(layoutedNode?.x) ?? node.position.x,
    y: finiteNumber(layoutedNode?.y) ?? node.position.y,
  };
}

function resolvedDimension(
  layoutedValue: number | undefined,
  fallback: number,
): number {
  return finiteNumber(layoutedValue) ?? fallback;
}

function layoutedNodesToCanvasNodes(
  nodes: DiagramNode[],
  layoutedGraph: ElkNode,
): DiagramNode[] {
  const layoutedNodeById = collectLayoutedNodes(layoutedGraph);
  const nodeIds = new Set(nodes.map((node) => node.id));

  return nodes.map((node) => {
    const layoutedNode = layoutedNodeById.get(node.id);
    const fallbackWidth = getNodeWidth(node);
    const fallbackHeight = getNodeHeight(node);
    const width = resolvedDimension(layoutedNode?.width, fallbackWidth);
    const height = resolvedDimension(layoutedNode?.height, fallbackHeight);

    return {
      ...node,
      parentId: resolveParentId(node, nodeIds),
      position: resolvedPosition(node, layoutedNode),
      width,
      height,
    };
  });
}

function orderNodesForReactFlow(nodes: DiagramNode[]): DiagramNode[] {
  const originalIndexById = new Map(
    nodes.map((node, index) => [node.id, index] as const),
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const childrenByParentId = buildChildrenByParentId(nodes);
  const orderedNodes: DiagramNode[] = [];
  const visitedNodeIds = new Set<string>();

  const compareByOriginalIndex = (left: DiagramNode, right: DiagramNode) =>
    (originalIndexById.get(left.id) ?? 0) -
    (originalIndexById.get(right.id) ?? 0);

  const visit = (node: DiagramNode) => {
    if (visitedNodeIds.has(node.id)) {
      return;
    }

    visitedNodeIds.add(node.id);
    orderedNodes.push(node);

    for (const childNode of [...(childrenByParentId.get(node.id) ?? [])].sort(
      compareByOriginalIndex,
    )) {
      visit(childNode);
    }
  };

  for (const rootNode of [...(childrenByParentId.get(undefined) ?? [])].sort(
    compareByOriginalIndex,
  )) {
    visit(rootNode);
  }

  for (const node of nodes) {
    if (!visitedNodeIds.has(node.id) && !resolveParentId(node, nodeIds)) {
      visit(node);
    }
  }

  for (const node of nodes) {
    if (!visitedNodeIds.has(node.id)) {
      visit(node);
    }
  }

  return orderedNodes;
}

export async function calculateLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Promise<DiagramNode[]> {
  if (nodes.length === 0) {
    return [];
  }

  const layoutedGraph = await elk.layout(toElkGraph(nodes, edges));
  const layoutedNodes = layoutedNodesToCanvasNodes(nodes, layoutedGraph);

  return orderNodesForReactFlow(layoutedNodes);
}
