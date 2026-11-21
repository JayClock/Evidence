import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import { rect, type Point } from '../geometry.js';
import type {
  ContextLayoutGroup,
  DomainGraphLayout,
  LayoutNode,
  ResponsibilityLink,
} from '../layout/types.js';
import { pairEdgeId, relationshipEdgeId } from './domainToLayoutTree.js';
import type { LayoutTreeNode } from './layoutTree.js';

/** Flatten the journey tree while retaining local boxes for nested rendering. */
export const layoutTreeToGraph = (
  root: LayoutTreeNode,
  graph: DomainGraph,
): DomainGraphLayout => {
  const nodes: LayoutNode[] = [];
  const contextGroups: ContextLayoutGroup[] = [];
  const routes = new Map<string, Point[]>();
  const walk = (
    node: LayoutTreeNode,
    parent: Point,
    parentContextId: string | null,
    depth: number,
  ) => {
    const box = rect(
      node.x ?? 0,
      node.y ?? 0,
      node.width ?? 0,
      node.height ?? 0,
    );
    const worldBox = { ...box, x: parent.x + box.x, y: parent.y + box.y };
    for (const edge of node.edges ?? []) {
      if (!edge.points || edge.points.length < 2)
        throw new Error(`Journey route is missing: ${edge.id}`);
      const points: Point[] = [];
      for (const point of edge.points) {
        const world = { x: point.x + worldBox.x, y: point.y + worldBox.y };
        const previous = points.at(-1);
        if (previous?.x !== world.x || previous?.y !== world.y)
          points.push(world);
      }
      routes.set(edge.id, points);
    }
    const entity = graph.getEntity(node.id);
    if (entity?.category === 'context') {
      contextGroups.push({
        contextId: node.id,
        entity,
        box,
        worldBox,
        titleBox: { ...worldBox, height: 36 },
        parentContextId,
        depth,
        childContextIds: (node.children ?? [])
          .filter((child) => graph.getEntity(child.id)?.category === 'context')
          .map(({ id }) => id),
        nodeIds: (node.children ?? [])
          .filter((child) => graph.getEntity(child.id)?.category !== 'context')
          .map(({ id }) => id),
      });
    } else if (entity !== undefined) {
      nodes.push({
        nodeId: node.id,
        entity,
        box,
        worldBox,
        contextId: parentContextId,
      });
    }
    for (const child of node.children ?? []) {
      walk(
        child,
        worldBox,
        entity?.category === 'context' ? node.id : parentContextId,
        entity?.category === 'context' ? depth + 1 : depth,
      );
    }
  };
  walk(root, { x: 0, y: 0 }, null, 0);

  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const contextGroupById = new Map(
    contextGroups.map((group) => [group.contextId, group]),
  );
  const ownerOf = (id: string) =>
    nodeById.get(id)?.contextId ?? contextGroupById.get(id)?.contextId ?? null;
  const edges = graph.relationships().flatMap((relationship) => {
    const points = routes.get(relationshipEdgeId(relationship.id));
    if (points === undefined) return [];
    const crossContext =
      ownerOf(relationship.sourceRef) !== ownerOf(relationship.targetRef);
    return [
      {
        relationshipId: relationship.id,
        sourceRef: relationship.sourceRef,
        targetRef: relationship.targetRef,
        kind: relationship.kind,
        ...(relationship.flowKind === undefined
          ? {}
          : { flowKind: relationship.flowKind }),
        label: relationship.label,
        points,
        route: {
          startPoint: points[0]!,
          bendPoints: points.slice(1, -1),
          endPoint: points.at(-1)!,
        },
        crossContext,
        dashed: crossContext || relationship.kind === 'plays_role',
        arrow: relationship.kind === 'plays_role',
      },
    ];
  });
  const fulfillmentPairs = graph.fulfillmentPairs().flatMap((pair) =>
    [...pair.confirmations, ...pair.proofs].flatMap((result) => {
      const id = pairEdgeId(pair.request.id, result.id);
      const points = routes.get(id);
      return points === undefined
        ? []
        : [
            {
              id,
              requestId: pair.request.id,
              confirmationId: result.id,
              points,
            },
          ];
    }),
  );
  const responsibilityLinks: ResponsibilityLink[] = [];
  for (const entity of graph.entities()) {
    if (entity.category !== 'evidence') continue;
    for (const roleId of entity.roleRefs ?? []) {
      if (nodeById.has(roleId))
        responsibilityLinks.push({
          sourceRef: entity.id,
          roleId,
          kind: 'contract_party',
        });
    }
    if (
      entity.responsibleRoleRef !== undefined &&
      nodeById.has(entity.responsibleRoleRef)
    ) {
      responsibilityLinks.push({
        sourceRef: entity.id,
        roleId: entity.responsibleRoleRef,
        kind: 'responsibility',
      });
    }
  }
  return {
    bounds: rect(0, 0, root.width ?? 0, root.height ?? 0),
    nodes,
    nodeById,
    contextGroups,
    contextGroupById,
    edges,
    edgeById: new Map(edges.map((edge) => [edge.relationshipId, edge])),
    fulfillmentPairs,
    responsibilityLinks,
  };
};
