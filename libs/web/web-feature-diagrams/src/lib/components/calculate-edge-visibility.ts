import type { DiagramCanvasEdge, DiagramCanvasNode } from './diagram-types';

function isPartyRoleNode(node: DiagramCanvasNode | undefined): boolean {
  return node?.data?.type === 'ROLE' && node.data?.subType === 'party';
}

function isContractNode(node: DiagramCanvasNode | undefined): boolean {
  return node?.data?.type === 'EVIDENCE' && node.data?.subType === 'contract';
}

function isEvidenceNode(node: DiagramCanvasNode | undefined): boolean {
  return node?.data?.type === 'EVIDENCE';
}

export function calculateEdgeVisibility(
  nodes: DiagramCanvasNode[],
  edges: DiagramCanvasEdge[],
): DiagramCanvasEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const hasPartyRoleEndpoint =
      isPartyRoleNode(sourceNode) || isPartyRoleNode(targetNode);

    if (!hasPartyRoleEndpoint) {
      return edge;
    }

    const isSourcePartyRole = isPartyRoleNode(sourceNode);
    const isTargetPartyRole = isPartyRoleNode(targetNode);
    const connectedNode = isSourcePartyRole
      ? targetNode
      : isTargetPartyRole
        ? sourceNode
        : undefined;

    if (!isEvidenceNode(connectedNode)) {
      return edge;
    }

    const hidden = !isContractNode(connectedNode);
    if (edge.hidden === hidden) {
      return edge;
    }

    return {
      ...edge,
      hidden,
    };
  });
}
