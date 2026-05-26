import type { DiagramCanvasEdge, DiagramCanvasNode } from './diagram-types';

export const EVIDENCE_SOURCE_HANDLE_RIGHT = 'evidence-source-right';
export const EVIDENCE_TARGET_HANDLE_LEFT = 'evidence-target-left';

function isEvidenceNode(node: DiagramCanvasNode | undefined): boolean {
  return node?.data?.type === 'EVIDENCE';
}

export function calculateEvidenceEdgeHandles(
  nodes: DiagramCanvasNode[],
  edges: DiagramCanvasEdge[],
): DiagramCanvasEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const isEvidenceToEvidence =
      isEvidenceNode(sourceNode) && isEvidenceNode(targetNode);

    if (!isEvidenceToEvidence) {
      return edge;
    }

    if (
      edge.sourceHandle === EVIDENCE_SOURCE_HANDLE_RIGHT &&
      edge.targetHandle === EVIDENCE_TARGET_HANDLE_LEFT
    ) {
      return edge;
    }

    return {
      ...edge,
      sourceHandle: EVIDENCE_SOURCE_HANDLE_RIGHT,
      targetHandle: EVIDENCE_TARGET_HANDLE_LEFT,
    };
  });
}
