import type { DiagramCanvasEdge, DiagramCanvasNode } from './diagram-types';

type EdgeVisibility = 'always';

type EdgeDisplay = {
  hidden: boolean;
  kind: string;
  visibility: EdgeVisibility;
};

function normalized(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/evidence:/g, '')
    .replace(/participant:/g, '')
    .replace(/role:/g, '')
    .replace(/[^a-z0-9]+/g, '-');
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
  return normalized(node?.data?.type);
}

function semanticSubType(node: DiagramCanvasNode | undefined): string {
  return normalized(node?.data?.subType);
}

function isPartyRoleNode(node: DiagramCanvasNode | undefined): boolean {
  return (
    semanticType(node) === 'role' && semanticSubType(node).includes('party')
  );
}

function isParticipantNode(node: DiagramCanvasNode | undefined): boolean {
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

function isEvidenceNode(node: DiagramCanvasNode | undefined): boolean {
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

function evidenceStage(
  node: DiagramCanvasNode | undefined,
): 'confirmation' | 'contract' | 'proposal' | 'request' | 'rfp' | null {
  if (!isEvidenceNode(node)) {
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

function edgeKind(
  sourceNode: DiagramCanvasNode | undefined,
  targetNode: DiagramCanvasNode | undefined,
): string {
  const sourceStage = evidenceStage(sourceNode);
  const targetStage = evidenceStage(targetNode);

  if (sourceStage === 'proposal' && targetStage === 'contract') {
    return 'contextTransition';
  }

  if (sourceStage && targetStage) {
    return 'timeline';
  }

  if (isPartyRoleNode(sourceNode) || isPartyRoleNode(targetNode)) {
    return 'role';
  }

  if (isParticipantNode(sourceNode) || isParticipantNode(targetNode)) {
    return 'participant';
  }

  if (isEvidenceNode(sourceNode) || isEvidenceNode(targetNode)) {
    return 'evidence';
  }

  return 'relationship';
}

function edgeDisplay(
  edge: DiagramCanvasEdge,
  sourceNode: DiagramCanvasNode | undefined,
  targetNode: DiagramCanvasNode | undefined,
): EdgeDisplay {
  const inferredKind = edgeKind(sourceNode, targetNode);
  const kind =
    typeof edge.data?.kind === 'string' ? edge.data.kind : inferredKind;

  return {
    hidden: false,
    kind,
    visibility: 'always',
  };
}

function edgeStyle(edge: DiagramCanvasEdge, display: EdgeDisplay) {
  const style = { ...(edge.style ?? {}) };

  if (display.kind === 'contextTransition') {
    style.strokeDasharray = style.strokeDasharray ?? '6 4';
  }

  if (display.kind === 'participant') {
    style.strokeDasharray = style.strokeDasharray ?? '4 4';
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

export function calculateEdgeVisibility(
  nodes: DiagramCanvasNode[],
  edges: DiagramCanvasEdge[],
): DiagramCanvasEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const display = edgeDisplay(edge, sourceNode, targetNode);
    const data = edge.data ?? { relationType: null };

    return {
      ...edge,
      hidden: display.hidden,
      style: edgeStyle(edge, display),
      data: {
        ...data,
        kind: display.kind,
        visibility: display.visibility,
      },
    };
  });
}
