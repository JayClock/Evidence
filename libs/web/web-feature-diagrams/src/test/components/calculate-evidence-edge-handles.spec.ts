import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  calculateEvidenceEdgeHandles,
  EVIDENCE_SOURCE_HANDLE_RIGHT,
  EVIDENCE_TARGET_HANDLE_LEFT,
  FULFILLMENT_SOURCE_HANDLE_BOTTOM,
  FULFILLMENT_SOURCE_HANDLE_TOP,
  FULFILLMENT_TARGET_HANDLE_BOTTOM,
  FULFILLMENT_TARGET_HANDLE_TOP,
} from '../../lib/components/calculate-evidence-edge-handles';
import type {
  DiagramCanvasEdge,
  DiagramNodeData,
} from '../../lib/components/diagram-types';
import edges from '../fixture/edges.json' with { type: 'json' };
import nodes from '../fixture/nodes.json' with { type: 'json' };

type LNode = Node<DiagramNodeData>;
type LEdge = Pick<Edge, 'id' | 'source' | 'target'>;
const FIXTURE_NODES = nodes as LNode[];
const FIXTURE_EDGES = (edges as LEdge[]).map(
  (edge): DiagramCanvasEdge => ({
    ...edge,
    data: {
      relationType: null,
    },
  }),
);

function testNode(id: string, type: string, subType: string | null): LNode {
  return {
    id,
    type: 'fulfillment-node',
    position: { x: 0, y: 0 },
    data: {
      id,
      type,
      subType,
      name: id,
      label: id,
      definition: {},
    },
  };
}

function testEdge(source: string, target: string): DiagramCanvasEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    data: { relationType: null },
  };
}

describe('calculateEvidenceEdgeHandles', () => {
  it('connects fulfillment timeline edges from source right to target left', () => {
    const nextEdges = calculateEvidenceEdgeHandles(
      FIXTURE_NODES,
      FIXTURE_EDGES,
    );
    const edgeById = new Map(nextEdges.map((edge) => [edge.id, edge]));

    expect(edgeById.get('generated:node-2::node-5')?.sourceHandle).toBe(
      EVIDENCE_SOURCE_HANDLE_RIGHT,
    );
    expect(edgeById.get('generated:node-2::node-5')?.targetHandle).toBe(
      EVIDENCE_TARGET_HANDLE_LEFT,
    );
    expect(edgeById.get('generated:node-5::node-6')?.sourceHandle).toBe(
      EVIDENCE_SOURCE_HANDLE_RIGHT,
    );
    expect(edgeById.get('generated:node-5::node-6')?.targetHandle).toBe(
      EVIDENCE_TARGET_HANDLE_LEFT,
    );
  });

  it('uses vertical handles from fulfillment nodes to thing, domain, and attached evidence', () => {
    const nextEdges = calculateEvidenceEdgeHandles(
      [
        testNode('request', 'EVIDENCE', 'fulfillment_request'),
        testNode('confirmation', 'EVIDENCE', 'fulfillment_confirmation'),
        testNode('evidence', 'EVIDENCE', 'other_evidence'),
        testNode('thing', 'PARTICIPANT', 'thing'),
        testNode('domain', 'ROLE', 'domain'),
      ],
      [
        testEdge('request', 'confirmation'),
        testEdge('confirmation', 'evidence'),
        testEdge('request', 'thing'),
        testEdge('request', 'domain'),
        testEdge('domain', 'confirmation'),
      ],
    );
    const edgeById = new Map(nextEdges.map((edge) => [edge.id, edge]));

    expect(edgeById.get('request->confirmation')?.sourceHandle).toBe(
      EVIDENCE_SOURCE_HANDLE_RIGHT,
    );
    expect(edgeById.get('request->confirmation')?.targetHandle).toBe(
      EVIDENCE_TARGET_HANDLE_LEFT,
    );
    expect(edgeById.get('confirmation->evidence')?.sourceHandle).toBe(
      FULFILLMENT_SOURCE_HANDLE_BOTTOM,
    );
    expect(edgeById.get('confirmation->evidence')?.targetHandle).toBe(
      FULFILLMENT_TARGET_HANDLE_TOP,
    );
    expect(edgeById.get('request->thing')?.sourceHandle).toBe(
      FULFILLMENT_SOURCE_HANDLE_BOTTOM,
    );
    expect(edgeById.get('request->thing')?.targetHandle).toBe(
      FULFILLMENT_TARGET_HANDLE_TOP,
    );
    expect(edgeById.get('request->domain')?.sourceHandle).toBe(
      FULFILLMENT_SOURCE_HANDLE_TOP,
    );
    expect(edgeById.get('request->domain')?.targetHandle).toBe(
      FULFILLMENT_TARGET_HANDLE_BOTTOM,
    );
    expect(edgeById.get('domain->confirmation')?.sourceHandle).toBeUndefined();
    expect(edgeById.get('domain->confirmation')?.targetHandle).toBeUndefined();
  });
});
