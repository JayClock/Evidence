import type {
  DiagramCanvasEdge,
  DiagramCanvasNode,
  DiagramNodeData,
} from './diagram-types';

type FulfillmentStage =
  | 'confirmation'
  | 'contract'
  | 'proposal'
  | 'request'
  | 'rfp';

type ProjectedGraph = {
  edges: DiagramCanvasEdge[];
  nodes: DiagramCanvasNode[];
};

function normalized(value: unknown): string {
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

function rawSearchText(node: DiagramCanvasNode | undefined): string {
  if (!node) {
    return '';
  }

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

function semanticType(node: DiagramCanvasNode | undefined): string {
  return normalized(node?.data.type);
}

function semanticSubType(node: DiagramCanvasNode | undefined): string {
  return normalized(node?.data.subType);
}

function isRoleNode(node: DiagramCanvasNode | undefined): boolean {
  return semanticType(node) === 'role';
}

function isParticipantNode(node: DiagramCanvasNode | undefined): boolean {
  const type = semanticType(node);

  return (
    node?.data.isReference !== true &&
    (type === 'participant' ||
      type === 'party' ||
      type === 'thing' ||
      type === 'place' ||
      type === 'domain' ||
      type === 'third-system' ||
      type === 'thirdsystem' ||
      type === '3rd-system')
  );
}

function isEvidenceLikeNode(node: DiagramCanvasNode | undefined): boolean {
  const type = semanticType(node);
  const subType = semanticSubType(node);

  return (
    type === 'evidence' ||
    type === 'rfp' ||
    type === 'proposal' ||
    type === 'contract' ||
    type === 'request' ||
    type.includes('fulfillment-request') ||
    type === 'confirmation' ||
    type.includes('fulfillment-confirmation') ||
    subType.includes('evidence') ||
    subType.includes('rfp') ||
    subType.includes('proposal') ||
    subType.includes('contract') ||
    subType.includes('request') ||
    subType.includes('confirmation')
  );
}

function fulfillmentStage(
  node: DiagramCanvasNode | undefined,
): FulfillmentStage | null {
  if (!isEvidenceLikeNode(node)) {
    return null;
  }

  const type = semanticType(node);
  const subType = semanticSubType(node);
  const rawText = rawSearchText(node);
  const tokenText = normalized(rawText);

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

function outgoingNodes(
  node: DiagramCanvasNode,
  edges: DiagramCanvasEdge[],
  nodeById: Map<string, DiagramCanvasNode>,
): DiagramCanvasNode[] {
  return uniqueNodes(
    edges.flatMap((edge) => {
      if (edge.source !== node.id) {
        return [];
      }

      const targetNode = nodeById.get(edge.target);
      return targetNode ? [targetNode] : [];
    }),
  );
}

function uniqueNodes(nodes: DiagramCanvasNode[]): DiagramCanvasNode[] {
  const seenNodeIds = new Set<string>();
  const unique: DiagramCanvasNode[] = [];

  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) {
      continue;
    }

    seenNodeIds.add(node.id);
    unique.push(node);
  }

  return unique;
}

function isConnectedToAny(
  node: DiagramCanvasNode,
  targetNodeIds: Set<string>,
  edges: DiagramCanvasEdge[],
): boolean {
  return edges.some((edge) => {
    if (edge.source === node.id) {
      return targetNodeIds.has(edge.target);
    }

    if (edge.target === node.id) {
      return targetNodeIds.has(edge.source);
    }

    return false;
  });
}

function rowNodeIds(
  requestNode: DiagramCanvasNode,
  edges: DiagramCanvasEdge[],
  nodeById: Map<string, DiagramCanvasNode>,
): Set<string> {
  const confirmations = outgoingNodes(requestNode, edges, nodeById).filter(
    (node) => fulfillmentStage(node) === 'confirmation',
  );
  const firstEvidenceNodes = uniqueNodes(
    [requestNode, ...confirmations].flatMap((node) =>
      outgoingNodes(node, edges, nodeById),
    ),
  ).filter((node) => isEvidenceLikeNode(node) && !fulfillmentStage(node));
  const chainedEvidenceNodes = uniqueNodes(
    firstEvidenceNodes.flatMap((node) => outgoingNodes(node, edges, nodeById)),
  ).filter((node) => isEvidenceLikeNode(node) && !fulfillmentStage(node));
  const ids = new Set(
    [
      requestNode,
      ...confirmations,
      ...firstEvidenceNodes,
      ...chainedEvidenceNodes,
    ].map((node) => node.id),
  );

  for (const node of nodeById.values()) {
    if (isRoleNode(node) && isConnectedToAny(node, ids, edges)) {
      ids.add(node.id);
    }
  }

  return ids;
}

function makeReferenceNode(
  canonicalNode: DiagramCanvasNode,
  requestNode: DiagramCanvasNode,
): DiagramCanvasNode {
  const id = `__evidence-ref-${canonicalNode.id}-${requestNode.id}`;
  const data: DiagramNodeData = {
    ...canonicalNode.data,
    canonicalId: canonicalNode.id,
    id,
    isReference: true,
    label: canonicalNode.data.label,
    name: canonicalNode.data.name,
    referenceScope: requestNode.id,
  };

  return {
    ...canonicalNode,
    data,
    id,
    selected: false,
  };
}

function canonicalReferenceEdge(
  referenceNode: DiagramCanvasNode,
  canonicalNode: DiagramCanvasNode,
): DiagramCanvasEdge {
  return {
    id: `__evidence-canonical-${referenceNode.id}`,
    source: referenceNode.id,
    target: canonicalNode.id,
    type: 'smoothstep',
    hidden: false,
    style: { strokeDasharray: '4 4' },
    data: {
      kind: 'participantReference',
      relationType: 'participantReference',
      visibility: 'always',
    },
  };
}

export function projectFulfillmentReferences(
  nodes: DiagramCanvasNode[],
  edges: DiagramCanvasEdge[],
): ProjectedGraph {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const requestNodes = nodes.filter(
    (node) => fulfillmentStage(node) === 'request',
  );
  const rowRequestByNodeId = new Map<string, string>();

  for (const requestNode of requestNodes) {
    for (const nodeId of rowNodeIds(requestNode, edges, nodeById)) {
      rowRequestByNodeId.set(nodeId, requestNode.id);
    }
  }

  if (rowRequestByNodeId.size === 0) {
    return { nodes, edges };
  }

  const referenceNodeByKey = new Map<string, DiagramCanvasNode>();
  const ensureReferenceNode = (
    canonicalNode: DiagramCanvasNode,
    requestNodeId: string,
  ) => {
    const key = `${canonicalNode.id}:${requestNodeId}`;
    const existing = referenceNodeByKey.get(key);

    if (existing) {
      return existing;
    }

    const requestNode = nodeById.get(requestNodeId) ?? canonicalNode;
    const referenceNode = makeReferenceNode(canonicalNode, requestNode);
    referenceNodeByKey.set(key, referenceNode);

    return referenceNode;
  };
  const projectedEdges = edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    if (isParticipantNode(sourceNode)) {
      const requestNodeId = rowRequestByNodeId.get(edge.target);

      if (sourceNode && requestNodeId) {
        return {
          ...edge,
          source: ensureReferenceNode(sourceNode, requestNodeId).id,
        };
      }
    }

    if (isParticipantNode(targetNode)) {
      const requestNodeId = rowRequestByNodeId.get(edge.source);

      if (targetNode && requestNodeId) {
        return {
          ...edge,
          target: ensureReferenceNode(targetNode, requestNodeId).id,
        };
      }
    }

    return edge;
  });
  const referenceNodes = [...referenceNodeByKey.values()];
  const canonicalEdges = referenceNodes.flatMap((referenceNode) => {
    const canonicalId =
      typeof referenceNode.data.canonicalId === 'string'
        ? referenceNode.data.canonicalId
        : null;
    const canonicalNode = canonicalId ? nodeById.get(canonicalId) : undefined;

    return canonicalNode
      ? [canonicalReferenceEdge(referenceNode, canonicalNode)]
      : [];
  });

  return {
    edges: [...projectedEdges, ...canonicalEdges],
    nodes: [...nodes, ...referenceNodes],
  };
}
