import { describe, expect, it, vi } from 'vitest';
import { HasMany, Ref, type Entity, type Many } from '../core';
import { Diagram, type DiagramDescription } from './diagram';
import { DiagramEdge, type DiagramEdges, type EdgeDescription } from './edge';
import { DiagramNode, type DiagramNodes, type NodeDescription } from './node';

const timestamp = '2026-01-01T00:00:00Z';

const diagramDescription: DiagramDescription = {
  workspace: new Ref('workspace-1'),
  title: 'Fulfillment',
  viewport: { x: 10, y: 20, zoom: 1.5 },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const nodeDescription: NodeDescription = {
  diagram: new Ref('diagram-1'),
  kind: 'default',
  logicalEntity: new Ref('entity-1'),
  parent: null,
  position: { x: 100, y: 200 },
  width: 320,
  height: 120,
  data: { label: 'RFP' },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const edgeDescription: EdgeDescription = {
  diagram: new Ref('diagram-1'),
  source: new Ref('node-1'),
  target: new Ref('node-2'),
  logicalRelationship: new Ref('relationship-1'),
  sourceHandle: 'source',
  targetHandle: 'target',
  kind: 'default',
  style: { stroke: '#111827' },
  data: { label: 'fulfills' },
  animated: false,
  hidden: false,
  markerStart: null,
  markerEnd: { type: 'arrowclosed' },
  pathOptions: {},
  interactionWidth: 20,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function many<E extends Entity<string, unknown>>(items: E[]): Many<E> {
  return {
    size: vi.fn(async () => items.length),
    subCollection: vi.fn((from: number, to: number) =>
      many(items.slice(from, to)),
    ),
    toArray: vi.fn(async () => [...items]),
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

function diagramFixture() {
  const node = new DiagramNode('node-1', nodeDescription);
  const edge = new DiagramEdge('edge-1', edgeDescription);
  const manyNodes = many([node]);
  const manyEdges = many([edge]);

  const nodes = {
    findAll: vi.fn(() => manyNodes),
    findByIdentity: vi.fn(async () => node),
  } satisfies DiagramNodes;

  const edges = {
    findAll: vi.fn(() => manyEdges),
    findByIdentity: vi.fn(async () => edge),
  } satisfies DiagramEdges;

  const diagram = new Diagram('diagram-1', diagramDescription, nodes, edges);

  return {
    diagram,
    edge,
    edges,
    manyEdges,
    manyNodes,
    node,
    nodes,
  };
}

describe('Diagram', () => {
  it('returns identity and description', () => {
    const { diagram } = diagramFixture();

    expect(diagram.identity()).toBe('diagram-1');
    expect(diagram.description()).toBe(diagramDescription);
  });

  it('exposes child collections as HasMany collections', async () => {
    const { diagram, edge, node } = diagramFixture();

    const nodes: HasMany<DiagramNode> = diagram.nodes();
    const edges: HasMany<DiagramEdge> = diagram.edges();

    await expect(
      nodes.findAll().subCollection(0, 10).toArray(),
    ).resolves.toEqual([node]);
    await expect(edges.findByIdentity('edge-1')).resolves.toBe(edge);
  });
});
