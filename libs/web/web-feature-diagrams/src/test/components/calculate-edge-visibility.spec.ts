import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgeVisibility } from '../../lib/components/calculate-edge-visibility';
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

describe('calculateEdgeVisibility', () => {
  it('makes all relationship edges visible by default', () => {
    const nextEdges = calculateEdgeVisibility(
      FIXTURE_NODES,
      FIXTURE_EDGES.map((edge) => ({ ...edge, hidden: true })),
    );

    expect(nextEdges.every((edge) => edge.hidden === false)).toBe(true);
    expect(nextEdges.every((edge) => edge.data?.visibility === 'always')).toBe(
      true,
    );
  });

  it('shows every Thing relation, including RFP, Proposal, and Evidence attachments', () => {
    const nextEdges = calculateEdgeVisibility(
      [
        testNode('rfp', 'EVIDENCE', 'rfp'),
        testNode('proposal', 'EVIDENCE', 'proposal'),
        testNode('contract', 'EVIDENCE', 'contract'),
        testNode('request', 'EVIDENCE', 'fulfillment_request'),
        testNode('confirmation', 'EVIDENCE', 'fulfillment_confirmation'),
        testNode('evidence', 'EVIDENCE', 'other_evidence'),
        testNode('thing', 'PARTICIPANT', 'thing'),
      ],
      [
        testEdge('rfp', 'thing'),
        testEdge('proposal', 'thing'),
        testEdge('contract', 'thing'),
        testEdge('request', 'thing'),
        testEdge('confirmation', 'thing'),
        testEdge('evidence', 'thing'),
      ],
    );
    const edgeById = new Map(nextEdges.map((edge) => [edge.id, edge]));

    expect(edgeById.get('rfp->thing')?.hidden).toBe(false);
    expect(edgeById.get('proposal->thing')?.hidden).toBe(false);
    expect(edgeById.get('contract->thing')?.hidden).toBe(false);
    expect(edgeById.get('request->thing')?.hidden).toBe(false);
    expect(edgeById.get('confirmation->thing')?.hidden).toBe(false);
    expect(edgeById.get('evidence->thing')?.hidden).toBe(false);
    expect(edgeById.get('rfp->thing')?.data?.visibility).toBe('always');
    expect(edgeById.get('evidence->thing')?.data?.visibility).toBe('always');
  });
});
