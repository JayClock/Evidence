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

const SYNTHETIC_PRE_CONTRACT_CONTEXT_ID =
  '__evidence-layout-pre-contract-context';
const SYNTHETIC_CONTRACT_CONTEXT_ID = '__evidence-layout-contract-context';
const PRE_CONTRACT_CONTEXT_LABEL = '合约前上下文';
const CONTRACT_CONTEXT_LABEL = '合约的上下文';
const CONTEXT_ROOT_GAP_X = 100;
const PRE_CONTRACT_CONTEXT_Y = 120;
const CONTRACT_CONTEXT_Y = 40;
const ROLE_ROW_Y = 70;
const TIMELINE_ROW_Y = 230;
const EVIDENCE_ROW_Y = 350;
const PARTICIPANT_ROW_Y = 470;
const OTHER_ROW_Y = 590;
const FULFILLMENT_STAGE_GAP_X = 120;
const FULFILLMENT_ROW_GAP_X = 56;
const STACK_GAP_Y = 32;
const PRE_CONTRACT_CONTEXT_MIN_WIDTH = 520;
const PRE_CONTRACT_CONTEXT_MIN_HEIGHT = 320;
const CONTRACT_CONTEXT_MIN_WIDTH = 1050;
const CONTRACT_CONTEXT_MIN_HEIGHT = 620;
const OTHER_CONTEXT_MIN_WIDTH = 640;
const OTHER_CONTEXT_MIN_HEIGHT = 360;
const CONTRACT_SPINE_X = 60;
const CONTRACT_SPINE_WIDTH = 180;
const LANE_X = 320;
const LANE_WIDTH = 1120;
const LANE_START_Y = 120;
const LANE_GAP_Y = 64;
const SHARED_POOL_X = 60;
const SHARED_POOL_WIDTH = 1160;
const SHARED_POOL_GAP_Y = 48;
const LANE_PADDING_Y = 28;
const LANE_LAYER_GAP_Y = 36;
const LANE_ROW_GAP_Y = 18;
const LANE_ITEM_GAP_X = 48;
const LANE_VERTICAL_ATTACHMENT_OFFSET_X = 32;
const LANE_NODE_HEIGHT = 80;
const LANE_REQUEST_X = 160;
const LANE_CONFIRMATION_X = 460;
const LANE_EVIDENCE_X = 760;
const POOL_NODE_START_X = 40;
const POOL_NODE_START_Y = 64;
const POOL_NODE_GAP_X = 48;
const POOL_NODE_GAP_Y = 24;
const POOL_MAX_COLUMNS = 4;

const FULFILLMENT_STAGE_ORDER = [
  'rfp',
  'proposal',
  'contract',
  'request',
  'confirmation',
] as const;
const PRE_CONTRACT_STAGE_ORDER = ['rfp', 'proposal'] as const;
const CONTRACT_STAGE_ORDER = ['contract', 'request', 'confirmation'] as const;
const PARTICIPANT_KIND_ORDER = [
  'party',
  'thing',
  'place',
  'domain',
  'third-system',
] as const;

type FulfillmentStage = (typeof FULFILLMENT_STAGE_ORDER)[number];
type LayoutContextRole = 'contract' | 'other' | 'pre-contract';
type ParticipantKind = (typeof PARTICIPANT_KIND_ORDER)[number] | 'participant';

type LayoutContext = {
  childIds: Set<string>;
  node: DiagramNode;
  order: number;
  role: LayoutContextRole;
  synthetic: boolean;
};

type NodeBounds = {
  height: number;
  width: number;
};

type PositionedNode = DiagramNode & {
  height: number;
  width: number;
};

type FulfillmentLane = {
  boundaryItems: DiagramNode[];
  confirmationNodes: DiagramNode[];
  evidenceNodes: DiagramNode[];
  id: string;
  participantItems: DiagramNode[];
  requestNode: DiagramNode;
  roleItems: DiagramNode[];
  title: string;
};

type MeasuredLane = FulfillmentLane & {
  boundaryY: number;
  evidenceY: number;
  height: number;
  mainY: number;
  participantY: number;
  roleY: number;
  y: number;
};

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

function shouldUseFulfillmentLayout(nodes: DiagramNode[]): boolean {
  const stages = nodes
    .map((node) => fulfillmentStage(node))
    .filter((stage): stage is FulfillmentStage => stage !== null);
  const stageSet = new Set(stages);

  if (stageSet.has('rfp') || stageSet.has('proposal')) {
    return true;
  }

  if (stageSet.has('request') || stageSet.has('confirmation')) {
    return true;
  }

  return stageSet.has('contract') && nodes.some(isContextNode);
}

function calculateFulfillmentLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramNode[] {
  const originalIndexById = new Map(
    nodes.map((node, index) => [node.id, index] as const),
  );
  const contextById = new Map<string, LayoutContext>();
  const nodeIds = new Set(nodes.map((node) => node.id));
  const childrenByParentId = buildChildrenByParentId(nodes);
  const explicitContexts = nodes.filter(isContextNode);
  const rootNodeIds = new Set(
    nodes.filter((node) => !isContextNode(node)).map((node) => node.id),
  );
  const assignedContextByNodeId = new Map<string, string>();

  for (const contextNode of explicitContexts) {
    const childNodes = childrenByParentId.get(contextNode.id) ?? [];
    contextById.set(contextNode.id, {
      childIds: new Set<string>(),
      node: contextNode,
      order: originalIndexById.get(contextNode.id) ?? 0,
      role: resolveContextRole(contextNode, childNodes),
      synthetic: false,
    });
  }

  const createSyntheticContext = (
    id: string,
    label: string,
    role: LayoutContextRole,
  ): LayoutContext => {
    const existing = contextById.get(id);

    if (existing) {
      return existing;
    }

    const context: LayoutContext = {
      childIds: new Set<string>(),
      node: syntheticContextNode(id, label),
      order: Number.MAX_SAFE_INTEGER - contextById.size,
      role,
      synthetic: true,
    };
    contextById.set(id, context);

    return context;
  };

  const contractContexts = () =>
    [...contextById.values()].filter((context) => context.role === 'contract');
  const preContractContexts = () =>
    [...contextById.values()].filter(
      (context) => context.role === 'pre-contract',
    );
  const primaryContractContext = () =>
    contractContexts().sort(compareContexts)[0] ??
    createSyntheticContext(
      SYNTHETIC_CONTRACT_CONTEXT_ID,
      CONTRACT_CONTEXT_LABEL,
      'contract',
    );
  const primaryPreContractContext = () =>
    preContractContexts().sort(compareContexts)[0] ??
    createSyntheticContext(
      SYNTHETIC_PRE_CONTRACT_CONTEXT_ID,
      PRE_CONTRACT_CONTEXT_LABEL,
      'pre-contract',
    );

  const assignToContext = (node: DiagramNode, context: LayoutContext) => {
    context.childIds.add(node.id);
    assignedContextByNodeId.set(node.id, context.node.id);
    rootNodeIds.delete(node.id);
  };

  const explicitContextForNode = (node: DiagramNode): LayoutContext | null => {
    const parentId = resolveParentId(node, nodeIds);

    return parentId ? (contextById.get(parentId) ?? null) : null;
  };

  const nonContextNodes = nodes.filter((node) => !isContextNode(node));

  for (const node of nonContextNodes) {
    const stage = fulfillmentStage(node);

    if (!stage) {
      continue;
    }

    const currentContext = explicitContextForNode(node);

    if (stage === 'rfp' || stage === 'proposal') {
      assignToContext(
        node,
        currentContext?.role === 'pre-contract'
          ? currentContext
          : primaryPreContractContext(),
      );
      continue;
    }

    assignToContext(
      node,
      currentContext?.role === 'pre-contract'
        ? primaryContractContext()
        : (currentContext ?? primaryContractContext()),
    );
  }

  for (const node of nonContextNodes) {
    if (assignedContextByNodeId.has(node.id) || !isRoleNode(node)) {
      continue;
    }

    const currentContext = explicitContextForNode(node);
    assignToContext(
      node,
      currentContext ??
        connectedContext(node, edges, assignedContextByNodeId, contextById) ??
        primaryContractContext(),
    );
  }

  for (const node of nonContextNodes) {
    if (assignedContextByNodeId.has(node.id) || !isGenericEvidenceNode(node)) {
      continue;
    }

    const currentContext = explicitContextForNode(node);
    assignToContext(
      node,
      currentContext ??
        connectedContext(node, edges, assignedContextByNodeId, contextById) ??
        primaryContractContext(),
    );
  }

  for (const node of nonContextNodes) {
    if (assignedContextByNodeId.has(node.id) || !isParticipantNode(node)) {
      continue;
    }

    const currentContext = explicitContextForNode(node);

    if (currentContext) {
      assignToContext(node, currentContext);
      continue;
    }

    const connected = connectedContext(
      node,
      edges,
      assignedContextByNodeId,
      contextById,
    );

    if (connected) {
      assignToContext(node, connected);
      continue;
    }

    const contexts = contractContexts();
    if (contexts.length === 1) {
      assignToContext(node, contexts[0]);
    }
  }

  for (const node of nonContextNodes) {
    if (assignedContextByNodeId.has(node.id)) {
      continue;
    }

    const currentContext = explicitContextForNode(node);
    if (currentContext) {
      assignToContext(node, currentContext);
    }
  }

  const contextList = [...contextById.values()]
    .filter((context) => !context.synthetic || context.childIds.size > 0)
    .sort(compareContextsForCanvas);
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const layoutedContexts = new Map<string, DiagramNode>();
  const layoutedChildren = new Map<string, DiagramNode>();

  for (const context of contextList) {
    const childNodes = [...context.childIds]
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is DiagramNode => Boolean(node));
    const layouted = layoutContextChildren(
      context,
      childNodes,
      edges,
      originalIndexById,
    );

    layoutedContexts.set(context.node.id, layouted.contextNode);
    for (const childNode of layouted.childNodes) {
      layoutedChildren.set(childNode.id, childNode);
    }
  }

  let cursorX = 0;
  const positionedContexts = new Map<string, DiagramNode>();

  for (const context of contextList) {
    const contextNode = layoutedContexts.get(context.node.id) ?? context.node;
    const y =
      context.role === 'pre-contract'
        ? PRE_CONTRACT_CONTEXT_Y
        : CONTRACT_CONTEXT_Y;
    const positionedContext = {
      ...contextNode,
      position: { x: cursorX, y },
    };

    positionedContexts.set(context.node.id, positionedContext);
    cursorX += getNodeWidth(positionedContext) + CONTEXT_ROOT_GAP_X;
  }

  const positionedChildById = new Map(layoutedChildren);
  const contextPositionById = new Map(
    [...positionedContexts.values()].map(
      (contextNode) => [contextNode.id, contextNode.position] as const,
    ),
  );
  const rootNodes = [...rootNodeIds]
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is DiagramNode => Boolean(node));
  const positionedRootNodes = layoutRootNodes(
    rootNodes,
    edges,
    positionedChildById,
    contextPositionById,
    positionedContexts,
    originalIndexById,
  );
  const result: DiagramNode[] = [];

  for (const context of contextList) {
    const contextNode = positionedContexts.get(context.node.id);
    if (!contextNode) {
      continue;
    }

    result.push(contextNode);

    for (const childId of orderedContextChildIds(
      context,
      positionedChildById,
      originalIndexById,
    )) {
      const childNode = positionedChildById.get(childId);
      if (childNode) {
        result.push(childNode);
      }
    }
  }

  result.push(...positionedRootNodes);

  return orderNodesForReactFlow(result);
}

function compareContexts(left: LayoutContext, right: LayoutContext): number {
  return left.order - right.order;
}

function compareContextsForCanvas(
  left: LayoutContext,
  right: LayoutContext,
): number {
  const leftWeight = contextRoleWeight(left.role);
  const rightWeight = contextRoleWeight(right.role);

  return leftWeight - rightWeight || compareContexts(left, right);
}

function contextRoleWeight(role: LayoutContextRole): number {
  switch (role) {
    case 'pre-contract':
      return 0;
    case 'contract':
      return 1;
    case 'other':
      return 2;
  }
}

function syntheticContextNode(id: string, label: string): DiagramNode {
  return {
    id,
    type: 'group-container',
    position: { x: 0, y: 0 },
    width: CONTRACT_CONTEXT_MIN_WIDTH,
    height: CONTRACT_CONTEXT_MIN_HEIGHT,
    data: {
      id,
      type: 'CONTEXT',
      subType: 'bounded_context',
      name: label,
      label,
      definition: {},
    },
  };
}

function connectedContext(
  node: DiagramNode,
  edges: DiagramEdge[],
  assignedContextByNodeId: Map<string, string>,
  contextById: Map<string, LayoutContext>,
): LayoutContext | null {
  const connectedContextIds = new Set<string>();

  for (const edge of edges) {
    const connectedNodeId = connectedNodeIdForEdge(node.id, edge);

    if (!connectedNodeId) {
      continue;
    }

    const contextId = assignedContextByNodeId.get(connectedNodeId);
    if (contextId) {
      connectedContextIds.add(contextId);
    }
  }

  if (connectedContextIds.size !== 1) {
    return null;
  }

  const [contextId] = [...connectedContextIds];
  return contextId ? (contextById.get(contextId) ?? null) : null;
}

function layoutContextChildren(
  context: LayoutContext,
  childNodes: DiagramNode[],
  edges: DiagramEdge[],
  originalIndexById: Map<string, number>,
): { childNodes: DiagramNode[]; contextNode: DiagramNode } {
  const positioned = new Map<string, PositionedNode>();
  const sortedChildren = [...childNodes].sort((left, right) =>
    compareNodesByOriginalIndex(left, right, originalIndexById),
  );

  if (context.role === 'contract') {
    return layoutContractContextChildren(
      context,
      sortedChildren,
      edges,
      originalIndexById,
    );
  }

  const stageNodes = sortedChildren.filter((node) => fulfillmentStage(node));
  const roleNodes = sortedChildren.filter(isRoleNode);
  const genericEvidenceNodes = sortedChildren.filter(isGenericEvidenceNode);
  const participantNodes = sortedChildren.filter(isParticipantNode);
  const otherNodes = sortedChildren.filter(
    (node) =>
      !fulfillmentStage(node) &&
      !isRoleNode(node) &&
      !isGenericEvidenceNode(node) &&
      !isParticipantNode(node),
  );
  const usedStages = stageOrderForContext(context.role, stageNodes);
  let cursorX = CONTEXT_LAYOUT_PADDING_X;

  for (const stage of usedStages) {
    const nodesInStage = stageNodes.filter(
      (node) => fulfillmentStage(node) === stage,
    );
    const maxWidth = maxNodeWidth(nodesInStage);
    const yPositions = stackedYPositions(TIMELINE_ROW_Y, nodesInStage);

    for (let index = 0; index < nodesInStage.length; index += 1) {
      const node = nodesInStage[index];

      positioned.set(
        node.id,
        positionChildNode(node, context.node.id, {
          x: cursorX,
          y: yPositions[index] ?? TIMELINE_ROW_Y,
        }),
      );
    }

    cursorX += maxWidth + FULFILLMENT_STAGE_GAP_X;
  }

  placeAnchoredRow({
    nodes: roleNodes,
    y: ROLE_ROW_Y,
    edges,
    parentId: context.node.id,
    positioned,
    originalIndexById,
  });
  placeAnchoredRow({
    nodes: genericEvidenceNodes,
    y: EVIDENCE_ROW_Y,
    edges,
    parentId: context.node.id,
    positioned,
    originalIndexById,
  });
  placeAnchoredRow({
    nodes: participantNodes,
    y: PARTICIPANT_ROW_Y,
    edges,
    parentId: context.node.id,
    positioned,
    originalIndexById,
    sort: compareParticipants,
  });
  placeAnchoredRow({
    nodes: otherNodes,
    y: OTHER_ROW_Y,
    edges,
    parentId: context.node.id,
    positioned,
    originalIndexById,
  });

  const childNodeResults = sortedChildren.map(
    (node) =>
      positioned.get(node.id) ??
      positionChildNode(node, context.node.id, {
        x: CONTEXT_LAYOUT_PADDING_X,
        y: OTHER_ROW_Y,
      }),
  );
  const bounds = childBounds(childNodeResults);
  const minSize = contextMinSize(context.role);
  const width = Math.max(
    minSize.width,
    bounds.right + CONTEXT_LAYOUT_PADDING_X,
  );
  const height = Math.max(
    minSize.height,
    bounds.bottom + CONTEXT_LAYOUT_PADDING_Y,
  );

  return {
    childNodes: childNodeResults,
    contextNode: {
      ...context.node,
      width,
      height,
    },
  };
}

function layoutContractContextChildren(
  context: LayoutContext,
  sortedChildren: DiagramNode[],
  edges: DiagramEdge[],
  originalIndexById: Map<string, number>,
): { childNodes: DiagramNode[]; contextNode: DiagramNode } {
  const nodeById = new Map(
    sortedChildren.map((node) => [node.id, node] as const),
  );
  const requestNodes = sortedChildren.filter(
    (node) => fulfillmentStage(node) === 'request',
  );
  const contractNodes = sortedChildren.filter(
    (node) => fulfillmentStage(node) === 'contract',
  );
  const lanes = measureFulfillmentLanes(
    buildFulfillmentLanes(
      requestNodes,
      sortedChildren,
      edges,
      originalIndexById,
    ),
  );
  const laneNodeIds = new Set(
    lanes.flatMap((lane) => [
      lane.requestNode.id,
      ...lane.confirmationNodes.map((node) => node.id),
      ...lane.evidenceNodes.map((node) => node.id),
      ...lane.roleItems.map((node) => node.id),
      ...lane.boundaryItems.map((node) => node.id),
      ...lane.participantItems.map((node) => node.id),
    ]),
  );
  const contractNodeIds = new Set(contractNodes.map((node) => node.id));
  const sharedPoolNodes = sortedChildren.filter(
    (node) =>
      !laneNodeIds.has(node.id) &&
      !contractNodeIds.has(node.id) &&
      (isParticipantNode(node) || isRoleNode(node)),
  );
  const fallbackNodes = sortedChildren.filter(
    (node) =>
      !laneNodeIds.has(node.id) &&
      !contractNodeIds.has(node.id) &&
      !sharedPoolNodes.some((poolNode) => poolNode.id === node.id),
  );
  const resultNodes: DiagramNode[] = [];
  const firstLaneY = lanes[0]?.y ?? LANE_START_Y;
  const lastLane = lanes[lanes.length - 1];
  const laneBottom = lastLane ? lastLane.y + lastLane.height : firstLaneY;
  const spineHeight = Math.max(LANE_NODE_HEIGHT, laneBottom - firstLaneY);

  for (const contractNode of contractNodes) {
    resultNodes.push({
      ...positionChildNode(contractNode, context.node.id, {
        x: CONTRACT_SPINE_X,
        y: firstLaneY,
      }),
      height: spineHeight,
      width: Math.max(CONTRACT_SPINE_WIDTH, getNodeWidth(contractNode)),
    });
  }

  for (const lane of lanes) {
    const laneGroup = syntheticLayoutGroupNode(
      lane.id,
      lane.title,
      'fulfillment_lane',
      context.node.id,
      { x: LANE_X, y: lane.y },
      { height: lane.height, width: LANE_WIDTH },
    );

    context.childIds.add(laneGroup.id);
    resultNodes.push(
      laneGroup,
      ...layoutFulfillmentLaneChildren(lane, laneGroup.id, edges, nodeById),
    );
  }

  if (sharedPoolNodes.length > 0) {
    const poolY = laneBottom + SHARED_POOL_GAP_Y;
    const poolHeight = measureSharedPoolHeight(sharedPoolNodes);
    const poolGroup = syntheticLayoutGroupNode(
      `__evidence-shared-pool-${context.node.id}`,
      'Shared Participants / 共享参与对象池',
      'shared_participant_pool',
      context.node.id,
      { x: SHARED_POOL_X, y: poolY },
      { height: poolHeight, width: SHARED_POOL_WIDTH },
    );

    context.childIds.add(poolGroup.id);
    resultNodes.push(
      poolGroup,
      ...layoutSharedPoolNodes(sharedPoolNodes, poolGroup.id),
    );
  }

  resultNodes.push(
    ...fallbackNodes.map((node, index) =>
      positionChildNode(node, context.node.id, {
        x: SHARED_POOL_X + index * (LAYOUT_NODE_WIDTH + FULFILLMENT_ROW_GAP_X),
        y:
          laneBottom +
          SHARED_POOL_GAP_Y +
          measureSharedPoolHeight(sharedPoolNodes) +
          LAYOUT_GAP_Y,
      }),
    ),
  );

  const bounds = childBounds(resultNodes);
  const minSize = contextMinSize(context.role);
  const width = Math.max(
    minSize.width,
    bounds.right + CONTEXT_LAYOUT_PADDING_X,
  );
  const height = Math.max(
    minSize.height,
    bounds.bottom + CONTEXT_LAYOUT_PADDING_Y,
  );

  return {
    childNodes: resultNodes,
    contextNode: {
      ...context.node,
      width,
      height,
    },
  };
}

function buildFulfillmentLanes(
  requestNodes: DiagramNode[],
  sortedChildren: DiagramNode[],
  edges: DiagramEdge[],
  originalIndexById: Map<string, number>,
): FulfillmentLane[] {
  const nodeById = new Map(
    sortedChildren.map((node) => [node.id, node] as const),
  );
  const usedNodeIds = new Set<string>();

  return requestNodes.map((requestNode) => {
    const confirmationNodes = outgoingNodes(requestNode, edges, nodeById)
      .filter((node) => fulfillmentStage(node) === 'confirmation')
      .sort((left, right) =>
        compareNodesByOriginalIndex(left, right, originalIndexById),
      );
    const firstEvidenceNodes = uniqueLayoutNodes(
      [requestNode, ...confirmationNodes].flatMap((node) =>
        outgoingNodes(node, edges, nodeById),
      ),
    ).filter((node) => isGenericEvidenceNode(node));
    const evidenceNodes = uniqueLayoutNodes([
      ...firstEvidenceNodes,
      ...firstEvidenceNodes
        .flatMap((node) => outgoingNodes(node, edges, nodeById))
        .filter((node) => isGenericEvidenceNode(node)),
    ]).sort((left, right) =>
      compareNodesByOriginalIndex(left, right, originalIndexById),
    );
    const anchorIds = new Set([
      requestNode.id,
      ...confirmationNodes.map((node) => node.id),
      ...evidenceNodes.map((node) => node.id),
    ]);
    const roleItems = sortedChildren
      .filter((node) => !usedNodeIds.has(node.id))
      .filter((node) => isRoleNode(node) && !isBoundaryNode(node))
      .filter((node) => isConnectedToAnyAnchor(node, anchorIds, edges))
      .sort((left, right) =>
        compareNodesByOriginalIndex(left, right, originalIndexById),
      );
    const boundaryItems = sortedChildren
      .filter((node) => !usedNodeIds.has(node.id))
      .filter(isBoundaryNode)
      .filter((node) => isConnectedToAnyAnchor(node, anchorIds, edges))
      .sort((left, right) =>
        compareNodesByOriginalIndex(left, right, originalIndexById),
      );
    const participantItems = sortedChildren
      .filter((node) => !usedNodeIds.has(node.id))
      .filter(isParticipantNode)
      .filter((node) => isConnectedToAnyAnchor(node, anchorIds, edges))
      .sort(
        (left, right) =>
          compareParticipants(left, right) ||
          compareNodesByOriginalIndex(left, right, originalIndexById),
      );
    const lane: FulfillmentLane = {
      boundaryItems,
      confirmationNodes,
      evidenceNodes,
      id: `__evidence-fulfillment-lane-${requestNode.id}`,
      participantItems,
      requestNode,
      roleItems,
      title: fulfillmentLaneTitle(requestNode),
    };

    for (const node of [
      requestNode,
      ...confirmationNodes,
      ...evidenceNodes,
      ...roleItems,
      ...boundaryItems,
      ...participantItems,
    ]) {
      usedNodeIds.add(node.id);
    }

    return lane;
  });
}

function measureFulfillmentLanes(lanes: FulfillmentLane[]): MeasuredLane[] {
  let y = LANE_START_Y;

  return lanes.map((lane) => {
    const roleHeight = laneLayerHeight(lane.roleItems);
    const boundaryHeight = laneLayerHeight(lane.boundaryItems);
    const evidenceHeight = laneLayerHeight(lane.evidenceNodes);
    const participantHeight = laneLayerHeight(lane.participantItems);
    const roleY = LANE_PADDING_Y;
    const boundaryY =
      roleY + roleHeight + (roleHeight > 0 ? LANE_LAYER_GAP_Y : 0);
    const mainY =
      boundaryY + boundaryHeight + (boundaryHeight > 0 ? LANE_LAYER_GAP_Y : 0);
    const evidenceY =
      mainY + LANE_NODE_HEIGHT + (evidenceHeight > 0 ? LANE_LAYER_GAP_Y : 0);
    const participantY =
      evidenceY +
      evidenceHeight +
      (participantHeight > 0 ? LANE_LAYER_GAP_Y : 0);
    const height = participantY + participantHeight + LANE_PADDING_Y;
    const measuredLane: MeasuredLane = {
      ...lane,
      boundaryY,
      evidenceY,
      height,
      mainY,
      participantY,
      roleY,
      y,
    };

    y += height + LANE_GAP_Y;

    return measuredLane;
  });
}

function layoutFulfillmentLaneChildren(
  lane: MeasuredLane,
  parentId: string,
  edges: DiagramEdge[],
  nodeById: Map<string, DiagramNode>,
): DiagramNode[] {
  const result: DiagramNode[] = [];
  result.push(
    ...layoutLaneItems(
      lane.roleItems,
      parentId,
      lane.roleY,
      'top',
      lane,
      edges,
      nodeById,
    ),
  );
  result.push(
    ...layoutLaneItems(
      lane.boundaryItems,
      parentId,
      lane.boundaryY,
      'top',
      lane,
      edges,
      nodeById,
    ),
  );
  result.push(
    positionChildNode(lane.requestNode, parentId, {
      x: LANE_REQUEST_X,
      y: lane.mainY,
    }),
  );
  result.push(
    ...lane.confirmationNodes.map((node, index) =>
      positionChildNode(node, parentId, {
        x: LANE_CONFIRMATION_X + index * (LAYOUT_NODE_WIDTH + LANE_ITEM_GAP_X),
        y: lane.mainY,
      }),
    ),
  );
  result.push(
    ...layoutLaneItems(
      lane.evidenceNodes,
      parentId,
      lane.evidenceY,
      'bottom',
      lane,
      edges,
      nodeById,
    ),
  );
  result.push(
    ...layoutLaneItems(
      lane.participantItems,
      parentId,
      lane.participantY,
      'bottom',
      lane,
      edges,
      nodeById,
    ),
  );

  return result;
}

function layoutLaneItems(
  nodes: DiagramNode[],
  parentId: string,
  y: number,
  side: 'bottom' | 'top',
  lane: MeasuredLane,
  edges: DiagramEdge[],
  nodeById: Map<string, DiagramNode>,
): DiagramNode[] {
  const indexesByAnchorX = new Map<number, number>();

  return nodes.map((node, index) => {
    const anchorX =
      laneItemAnchorX(node, lane, edges, nodeById) ??
      LANE_REQUEST_X + index * (LAYOUT_NODE_WIDTH + LANE_ITEM_GAP_X);
    const stackIndex = indexesByAnchorX.get(anchorX) ?? 0;
    indexesByAnchorX.set(anchorX, stackIndex + 1);

    return positionChildNode(node, parentId, {
      x: anchorX + verticalAttachmentOffsetX(side, stackIndex),
      y: y + stackIndex * (LANE_NODE_HEIGHT + LANE_ROW_GAP_Y),
    });
  });
}

function verticalAttachmentOffsetX(
  side: 'bottom' | 'top',
  stackIndex: number,
): number {
  const direction = side === 'top' ? -1 : 1;
  const spread =
    Math.floor(stackIndex / 2) * (LANE_VERTICAL_ATTACHMENT_OFFSET_X / 2);

  return direction * (LANE_VERTICAL_ATTACHMENT_OFFSET_X + spread);
}

function laneItemAnchorX(
  node: DiagramNode,
  lane: MeasuredLane,
  edges: DiagramEdge[],
  nodeById: Map<string, DiagramNode>,
): number | null {
  const connectedAnchorNodes = edges.flatMap((edge) => {
    const connectedNodeId = connectedNodeIdForEdge(node.id, edge);
    const connectedNode = connectedNodeId
      ? nodeById.get(connectedNodeId)
      : undefined;

    return connectedNode ? [connectedNode] : [];
  });

  if (
    connectedAnchorNodes.some(
      (anchorNode) => anchorNode.id === lane.requestNode.id,
    )
  ) {
    return LANE_REQUEST_X;
  }

  if (
    connectedAnchorNodes.some((anchorNode) =>
      lane.confirmationNodes.some(
        (confirmationNode) => confirmationNode.id === anchorNode.id,
      ),
    )
  ) {
    return LANE_CONFIRMATION_X;
  }

  if (
    connectedAnchorNodes.some((anchorNode) =>
      lane.evidenceNodes.some(
        (evidenceNode) => evidenceNode.id === anchorNode.id,
      ),
    )
  ) {
    return LANE_EVIDENCE_X;
  }

  return null;
}

function laneLayerHeight(nodes: DiagramNode[]): number {
  if (nodes.length === 0) {
    return 0;
  }

  const rowsByX = new Map<number, number>();
  for (const node of nodes) {
    const key = Number(node.position.x) || 0;
    rowsByX.set(key, (rowsByX.get(key) ?? 0) + 1);
  }
  const rowCount = Math.max(1, ...rowsByX.values());

  return rowCount * LANE_NODE_HEIGHT + (rowCount - 1) * LANE_ROW_GAP_Y;
}

function syntheticLayoutGroupNode(
  id: string,
  label: string,
  subType: string,
  parentId: string,
  position: Position,
  size: NodeBounds,
): DiagramNode {
  return {
    id,
    type: 'group-container',
    parentId,
    position,
    width: size.width,
    height: size.height,
    data: {
      id,
      type: 'LAYOUT',
      subType,
      name: label,
      label,
      definition: {},
    },
  };
}

function layoutSharedPoolNodes(
  nodes: DiagramNode[],
  parentId: string,
): DiagramNode[] {
  return nodes.map((node, index) => {
    const column = index % POOL_MAX_COLUMNS;
    const row = Math.floor(index / POOL_MAX_COLUMNS);

    return positionChildNode(node, parentId, {
      x: POOL_NODE_START_X + column * (LAYOUT_NODE_WIDTH + POOL_NODE_GAP_X),
      y: POOL_NODE_START_Y + row * (LANE_NODE_HEIGHT + POOL_NODE_GAP_Y),
    });
  });
}

function measureSharedPoolHeight(nodes: DiagramNode[]): number {
  if (nodes.length === 0) {
    return 0;
  }

  const rowCount = Math.ceil(nodes.length / POOL_MAX_COLUMNS);
  return (
    POOL_NODE_START_Y +
    rowCount * LANE_NODE_HEIGHT +
    (rowCount - 1) * POOL_NODE_GAP_Y +
    LANE_PADDING_Y
  );
}

function outgoingNodes(
  node: DiagramNode,
  edges: DiagramEdge[],
  nodeById: Map<string, DiagramNode>,
): DiagramNode[] {
  return uniqueLayoutNodes(
    edges.flatMap((edge) => {
      if (edge.source !== node.id) {
        return [];
      }

      const targetNode = nodeById.get(edge.target);
      return targetNode ? [targetNode] : [];
    }),
  );
}

function uniqueLayoutNodes(nodes: DiagramNode[]): DiagramNode[] {
  const seenNodeIds = new Set<string>();
  const unique: DiagramNode[] = [];

  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) {
      continue;
    }

    seenNodeIds.add(node.id);
    unique.push(node);
  }

  return unique;
}

function isConnectedToAnyAnchor(
  node: DiagramNode,
  anchorIds: Set<string>,
  edges: DiagramEdge[],
): boolean {
  return edges.some((edge) => {
    if (edge.source === node.id) {
      return anchorIds.has(edge.target);
    }

    if (edge.target === node.id) {
      return anchorIds.has(edge.source);
    }

    return false;
  });
}

function isBoundaryNode(node: DiagramNode): boolean {
  if (!isRoleNode(node)) {
    return false;
  }

  const subType = semanticSubType(node);
  return (
    subType.includes('domain') ||
    subType.includes('3rd-system') ||
    subType.includes('third-system') ||
    subType.includes('context') ||
    subType.includes('evidence')
  );
}

function fulfillmentLaneTitle(requestNode: DiagramNode): string {
  const label = String(
    requestNode.data.label ?? requestNode.data.name ?? requestNode.id,
  );
  const normalizedLabel = label
    .replace(/履约请求/g, '')
    .replace(/申请/g, '')
    .trim();

  return normalizedLabel.length > 0
    ? `${normalizedLabel}履约`
    : 'Fulfillment Process';
}

function stageOrderForContext(
  role: LayoutContextRole,
  stageNodes: DiagramNode[],
): FulfillmentStage[] {
  const stageSet = new Set(
    stageNodes
      .map((node) => fulfillmentStage(node))
      .filter((stage): stage is FulfillmentStage => stage !== null),
  );
  const preferredOrder =
    role === 'pre-contract'
      ? PRE_CONTRACT_STAGE_ORDER
      : role === 'contract'
        ? CONTRACT_STAGE_ORDER
        : FULFILLMENT_STAGE_ORDER;
  const preferredStages = preferredOrder.filter((stage) => stageSet.has(stage));
  const remainingStages = FULFILLMENT_STAGE_ORDER.filter(
    (stage) => stageSet.has(stage) && !preferredStages.includes(stage),
  );

  return [...preferredStages, ...remainingStages];
}

function placeAnchoredRow({
  nodes,
  y,
  edges,
  parentId,
  positioned,
  originalIndexById,
  sort,
}: {
  edges: DiagramEdge[];
  nodes: DiagramNode[];
  originalIndexById: Map<string, number>;
  parentId: string | undefined;
  positioned: Map<string, PositionedNode>;
  sort?: (left: DiagramNode, right: DiagramNode) => number;
  y: number;
}) {
  const sortedNodes = [...nodes].sort((left, right) => {
    const anchorDelta =
      (anchorX(left, edges, positioned) ?? Number.MAX_SAFE_INTEGER) -
      (anchorX(right, edges, positioned) ?? Number.MAX_SAFE_INTEGER);

    return (
      anchorDelta ||
      (sort?.(left, right) ?? 0) ||
      compareNodesByOriginalIndex(left, right, originalIndexById)
    );
  });
  let cursorX = CONTEXT_LAYOUT_PADDING_X;

  for (const node of sortedNodes) {
    const anchoredX = anchorX(node, edges, positioned);
    const desiredX =
      anchoredX == null
        ? cursorX
        : anchoredX +
          verticalAttachmentOffsetX(y < TIMELINE_ROW_Y ? 'top' : 'bottom', 0);
    const x = Math.max(cursorX, desiredX);
    const positionedNode = positionChildNode(node, parentId, { x, y });

    positioned.set(node.id, positionedNode);
    cursorX = x + positionedNode.width + FULFILLMENT_ROW_GAP_X;
  }
}

function layoutRootNodes(
  rootNodes: DiagramNode[],
  edges: DiagramEdge[],
  positionedChildById: Map<string, DiagramNode>,
  contextPositionById: Map<string, Position>,
  positionedContexts: Map<string, DiagramNode>,
  originalIndexById: Map<string, number>,
): DiagramNode[] {
  if (rootNodes.length === 0) {
    return [];
  }

  const maxContextBottom = Math.max(
    0,
    ...[...positionedContexts.values()].map(
      (contextNode) => contextNode.position.y + getNodeHeight(contextNode),
    ),
  );
  const rowY = maxContextBottom + 120;
  const absolutePositioned = new Map<string, PositionedNode>();

  for (const [nodeId, node] of positionedChildById) {
    const parentPosition = node.parentId
      ? contextPositionById.get(node.parentId)
      : undefined;

    absolutePositioned.set(
      nodeId,
      positionChildNode(node, undefined, {
        x: (parentPosition?.x ?? 0) + node.position.x,
        y: (parentPosition?.y ?? 0) + node.position.y,
      }),
    );
  }

  const sortedRootNodes = [...rootNodes].sort((left, right) =>
    compareNodesByOriginalIndex(left, right, originalIndexById),
  );
  const result: DiagramNode[] = [];
  let cursorX = CONTEXT_LAYOUT_PADDING_X;

  for (const node of sortedRootNodes) {
    const y = isParticipantNode(node)
      ? rowY
      : isRoleNode(node)
        ? rowY - 140
        : isGenericEvidenceNode(node)
          ? rowY - 20
          : rowY + 140;
    const desiredX = anchorX(node, edges, absolutePositioned) ?? cursorX;
    const x = Math.max(cursorX, desiredX);
    const positionedNode = positionChildNode(node, undefined, { x, y });

    result.push(positionedNode);
    cursorX = x + positionedNode.width + FULFILLMENT_ROW_GAP_X;
  }

  return result;
}

function orderedContextChildIds(
  context: LayoutContext,
  positionedChildById: Map<string, DiagramNode>,
  originalIndexById: Map<string, number>,
): string[] {
  return [...context.childIds]
    .filter((childId) => positionedChildById.has(childId))
    .sort((leftId, rightId) => {
      const left = positionedChildById.get(leftId);
      const right = positionedChildById.get(rightId);

      if (!left || !right) {
        return 0;
      }

      return (
        laneWeight(left) - laneWeight(right) ||
        left.position.y - right.position.y ||
        left.position.x - right.position.x ||
        (originalIndexById.get(left.id) ?? 0) -
          (originalIndexById.get(right.id) ?? 0)
      );
    });
}

function laneWeight(node: DiagramNode): number {
  if (isRoleNode(node)) {
    return 0;
  }

  if (fulfillmentStage(node)) {
    return 1;
  }

  if (isGenericEvidenceNode(node)) {
    return 2;
  }

  if (isParticipantNode(node)) {
    return 3;
  }

  return 4;
}

function contextMinSize(role: LayoutContextRole): NodeBounds {
  switch (role) {
    case 'pre-contract':
      return {
        height: PRE_CONTRACT_CONTEXT_MIN_HEIGHT,
        width: PRE_CONTRACT_CONTEXT_MIN_WIDTH,
      };
    case 'contract':
      return {
        height: CONTRACT_CONTEXT_MIN_HEIGHT,
        width: CONTRACT_CONTEXT_MIN_WIDTH,
      };
    case 'other':
      return {
        height: OTHER_CONTEXT_MIN_HEIGHT,
        width: OTHER_CONTEXT_MIN_WIDTH,
      };
  }
}

function childBounds(nodes: DiagramNode[]): { bottom: number; right: number } {
  return nodes.reduce(
    (bounds, node) => ({
      bottom: Math.max(bounds.bottom, node.position.y + getNodeHeight(node)),
      right: Math.max(bounds.right, node.position.x + getNodeWidth(node)),
    }),
    { bottom: 0, right: 0 },
  );
}

function positionChildNode(
  node: DiagramNode,
  parentId: string | undefined,
  position: Position,
): PositionedNode {
  return {
    ...node,
    parentId,
    position,
    width: getNodeWidth(node),
    height: getNodeHeight(node),
  };
}

function stackedYPositions(centerY: number, nodes: DiagramNode[]): number[] {
  if (nodes.length === 0) {
    return [];
  }

  const totalHeight = nodes.reduce(
    (total, node) => total + getNodeHeight(node),
    STACK_GAP_Y * (nodes.length - 1),
  );
  let cursorY = Math.max(
    ROLE_ROW_Y + LAYOUT_NODE_HEIGHT + STACK_GAP_Y,
    centerY - totalHeight / 2,
  );

  return nodes.map((node) => {
    const y = cursorY;
    cursorY += getNodeHeight(node) + STACK_GAP_Y;
    return y;
  });
}

function maxNodeWidth(nodes: DiagramNode[]): number {
  return Math.max(
    LAYOUT_NODE_WIDTH,
    ...nodes.map((node) => getNodeWidth(node)),
  );
}

function anchorX(
  node: DiagramNode,
  edges: DiagramEdge[],
  positioned: Map<string, DiagramNode>,
): number | null {
  const anchors: number[] = [];

  for (const edge of edges) {
    const connectedNodeId = connectedNodeIdForEdge(node.id, edge);
    const connectedNode = connectedNodeId
      ? positioned.get(connectedNodeId)
      : undefined;

    if (connectedNode) {
      anchors.push(connectedNode.position.x);
    }
  }

  if (anchors.length === 0) {
    return null;
  }

  return Math.round(
    anchors.reduce((total, value) => total + value, 0) / anchors.length,
  );
}

function connectedNodeIdForEdge(
  nodeId: string,
  edge: DiagramEdge,
): string | null {
  if (edge.source === nodeId) {
    return edge.target;
  }

  if (edge.target === nodeId) {
    return edge.source;
  }

  return null;
}

function compareNodesByOriginalIndex(
  left: DiagramNode,
  right: DiagramNode,
  originalIndexById: Map<string, number>,
): number {
  return (
    (originalIndexById.get(left.id) ?? 0) -
    (originalIndexById.get(right.id) ?? 0)
  );
}

function compareParticipants(left: DiagramNode, right: DiagramNode): number {
  return (
    participantKindWeight(participantKind(left)) -
    participantKindWeight(participantKind(right))
  );
}

function participantKindWeight(kind: ParticipantKind): number {
  const index = PARTICIPANT_KIND_ORDER.indexOf(
    kind as (typeof PARTICIPANT_KIND_ORDER)[number],
  );

  return index >= 0 ? index : PARTICIPANT_KIND_ORDER.length;
}

function resolveContextRole(
  contextNode: DiagramNode,
  childNodes: DiagramNode[],
): LayoutContextRole {
  const text = rawSearchText(contextNode);
  const childStages = new Set(
    childNodes
      .map((node) => fulfillmentStage(node))
      .filter((stage): stage is FulfillmentStage => stage !== null),
  );

  if (
    text.includes('pre-contract') ||
    text.includes('pre contract') ||
    text.includes('precontract') ||
    text.includes('合约前') ||
    text.includes('合同前') ||
    text.includes('售前') ||
    text.includes('rfp') ||
    text.includes('proposal') ||
    ((childStages.has('rfp') || childStages.has('proposal')) &&
      !childStages.has('contract') &&
      !childStages.has('request') &&
      !childStages.has('confirmation'))
  ) {
    return 'pre-contract';
  }

  if (
    text.includes('contract') ||
    text.includes('合约') ||
    text.includes('合同') ||
    childStages.has('contract') ||
    childStages.has('request') ||
    childStages.has('confirmation')
  ) {
    return 'contract';
  }

  return 'other';
}

function isContextNode(node: DiagramNode): boolean {
  return (
    normalizedToken(node.type) === 'group-container' ||
    semanticType(node) === 'context'
  );
}

function isRoleNode(node: DiagramNode): boolean {
  return semanticType(node) === 'role';
}

function isParticipantNode(node: DiagramNode): boolean {
  const type = semanticType(node);

  return (
    type === 'participant' ||
    type === 'party' ||
    type === 'thing' ||
    type === 'place' ||
    type === 'domain' ||
    type === 'third-system' ||
    type === 'thirdsystem' ||
    type === '3rd-system'
  );
}

function isEvidenceLikeNode(node: DiagramNode): boolean {
  const type = semanticType(node);

  return (
    type === 'evidence' ||
    type === 'rfp' ||
    type === 'proposal' ||
    type === 'contract' ||
    type === 'request' ||
    type.includes('fulfillment-request') ||
    type === 'confirmation' ||
    type.includes('fulfillment-confirmation')
  );
}

function isGenericEvidenceNode(node: DiagramNode): boolean {
  return isEvidenceLikeNode(node) && !fulfillmentStage(node);
}

function fulfillmentStage(node: DiagramNode): FulfillmentStage | null {
  if (!isEvidenceLikeCandidate(node)) {
    return null;
  }

  const type = semanticType(node);
  const subType = semanticSubType(node);
  const rawText = rawSearchText(node);
  const tokenText = normalizedToken(rawText);

  if (
    type === 'rfp' ||
    type.includes('request-for-proposal') ||
    subType.includes('rfp') ||
    subType.includes('request-for-proposal') ||
    tokenText.includes('request-for-proposal') ||
    rawText.includes('索取提案') ||
    rawText.includes('询价') ||
    rawText.includes('招标')
  ) {
    return 'rfp';
  }

  if (
    type === 'proposal' ||
    subType.includes('proposal') ||
    tokenText.includes('proposal') ||
    rawText.includes('提案') ||
    rawText.includes('报价')
  ) {
    return 'proposal';
  }

  if (
    type === 'contract' ||
    subType.includes('contract') ||
    tokenText.includes('contract') ||
    rawText.includes('合同') ||
    rawText.includes('合约')
  ) {
    return 'contract';
  }

  if (
    type === 'request' ||
    type.includes('fulfillment-request') ||
    subType.includes('fulfillment-request') ||
    tokenText.includes('fulfillment-request') ||
    rawText.includes('履约请求')
  ) {
    return 'request';
  }

  if (
    type === 'confirmation' ||
    type.includes('fulfillment-confirmation') ||
    subType.includes('fulfillment-confirmation') ||
    tokenText.includes('fulfillment-confirmation') ||
    rawText.includes('履约确认')
  ) {
    return 'confirmation';
  }

  return null;
}

function isEvidenceLikeCandidate(node: DiagramNode): boolean {
  const subType = semanticSubType(node);

  return (
    isEvidenceLikeNode(node) ||
    subType.includes('evidence') ||
    subType.includes('rfp') ||
    subType.includes('proposal') ||
    subType.includes('contract') ||
    subType.includes('request') ||
    subType.includes('confirmation')
  );
}

function participantKind(node: DiagramNode): ParticipantKind {
  const subType = semanticSubType(node);
  const type = semanticType(node);
  const value = subType || type;

  if (value.includes('party')) {
    return 'party';
  }

  if (value.includes('thing')) {
    return 'thing';
  }

  if (value.includes('place')) {
    return 'place';
  }

  if (value.includes('domain')) {
    return 'domain';
  }

  if (value.includes('third') || value.includes('3rd')) {
    return 'third-system';
  }

  return 'participant';
}

function semanticType(node: DiagramNode): string {
  return normalizedToken(node.data.type);
}

function semanticSubType(node: DiagramNode): string {
  return normalizedToken(node.data.subType);
}

function rawSearchText(node: DiagramNode): string {
  return [
    node.id,
    node.type,
    node.data.type,
    node.data.subType,
    node.data.name,
    node.data.label,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function normalizedToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/evidence:/g, '')
    .replace(/participant:/g, '')
    .replace(/role:/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

  if (shouldUseFulfillmentLayout(nodes)) {
    return calculateFulfillmentLayout(nodes, edges);
  }

  const layoutedGraph = await elk.layout(toElkGraph(nodes, edges));
  const layoutedNodes = layoutedNodesToCanvasNodes(nodes, layoutedGraph);

  return orderNodesForReactFlow(layoutedNodes);
}
