import type { DiagramCanvasEdge, DiagramCanvasNode } from './diagram-types';

export const EVIDENCE_SOURCE_HANDLE_RIGHT = 'evidence-source-right';
export const EVIDENCE_TARGET_HANDLE_LEFT = 'evidence-target-left';
export const FULFILLMENT_SOURCE_HANDLE_TOP = 'fulfillment-source-top';
export const FULFILLMENT_TARGET_HANDLE_TOP = 'fulfillment-target-top';
export const FULFILLMENT_SOURCE_HANDLE_BOTTOM = 'fulfillment-source-bottom';
export const FULFILLMENT_TARGET_HANDLE_BOTTOM = 'fulfillment-target-bottom';

type FulfillmentStage =
  | 'confirmation'
  | 'contract'
  | 'proposal'
  | 'request'
  | 'rfp';

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

function isPrimaryFulfillmentNode(
  node: DiagramCanvasNode | undefined,
): boolean {
  return fulfillmentStage(node) !== null;
}

function isGenericEvidenceNode(node: DiagramCanvasNode | undefined): boolean {
  return isEvidenceLikeNode(node) && !isPrimaryFulfillmentNode(node);
}

function isThingNode(node: DiagramCanvasNode | undefined): boolean {
  const type = semanticType(node);
  const subType = semanticSubType(node);

  return (
    (type === 'participant' && subType.includes('thing')) || type === 'thing'
  );
}

function isDomainNode(node: DiagramCanvasNode | undefined): boolean {
  const type = semanticType(node);
  const subType = semanticSubType(node);

  return type === 'domain' || (type === 'role' && subType.includes('domain'));
}

function isVerticalAttachmentNode(
  node: DiagramCanvasNode | undefined,
): boolean {
  return isThingNode(node) || isDomainNode(node) || isGenericEvidenceNode(node);
}

function verticalHandlesForAttachment(
  sourceNode: DiagramCanvasNode | undefined,
  targetNode: DiagramCanvasNode | undefined,
): Pick<DiagramCanvasEdge, 'sourceHandle' | 'targetHandle'> | null {
  const sourceIsFulfillmentItem = isEvidenceLikeNode(sourceNode);
  const targetIsAttachment = isVerticalAttachmentNode(targetNode);

  if (!sourceIsFulfillmentItem || !targetIsAttachment) {
    return null;
  }

  if (isDomainNode(targetNode)) {
    return {
      sourceHandle: FULFILLMENT_SOURCE_HANDLE_TOP,
      targetHandle: FULFILLMENT_TARGET_HANDLE_BOTTOM,
    };
  }

  return {
    sourceHandle: FULFILLMENT_SOURCE_HANDLE_BOTTOM,
    targetHandle: FULFILLMENT_TARGET_HANDLE_TOP,
  };
}

function horizontalHandlesForTimeline(
  sourceNode: DiagramCanvasNode | undefined,
  targetNode: DiagramCanvasNode | undefined,
): Pick<DiagramCanvasEdge, 'sourceHandle' | 'targetHandle'> | null {
  if (
    !isPrimaryFulfillmentNode(sourceNode) ||
    !isPrimaryFulfillmentNode(targetNode)
  ) {
    return null;
  }

  return {
    sourceHandle: EVIDENCE_SOURCE_HANDLE_RIGHT,
    targetHandle: EVIDENCE_TARGET_HANDLE_LEFT,
  };
}

function applyHandles(
  edge: DiagramCanvasEdge,
  handles: Pick<DiagramCanvasEdge, 'sourceHandle' | 'targetHandle'> | null,
): DiagramCanvasEdge {
  if (!handles) {
    return edge;
  }

  if (
    edge.sourceHandle === handles.sourceHandle &&
    edge.targetHandle === handles.targetHandle
  ) {
    return edge;
  }

  return {
    ...edge,
    ...handles,
  };
}

export function calculateEvidenceEdgeHandles(
  nodes: DiagramCanvasNode[],
  edges: DiagramCanvasEdge[],
): DiagramCanvasEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    return applyHandles(
      edge,
      verticalHandlesForAttachment(sourceNode, targetNode) ??
        horizontalHandlesForTimeline(sourceNode, targetNode),
    );
  });
}
