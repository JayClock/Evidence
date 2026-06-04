import { describe, expect, it, vi } from 'vitest';
import { HasMany, Ref } from '../core';
import { Diagram, type DiagramDescription } from './diagram';
import { DiagramEdge, type DiagramEdges, type EdgeDescription } from './edge';
import { DiagramNode, type DiagramNodes, type NodeDescription } from './node';
import type { DraftEdge, DraftNode } from './types';
import {
  DiagramVersion,
  type DiagramVersionDescription,
  type DiagramVersions,
} from './version';

const timestamp = '2026-01-01T00:00:00Z';

const diagramDescription: DiagramDescription = {
  workspace: new Ref('workspace-1'),
  title: 'Fulfillment',
  type: 'flowchart',
  viewport: { x: 10, y: 20, zoom: 1.5 },
  status: 'draft',
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

const versionDescription: DiagramVersionDescription = {
  diagram: new Ref('diagram-1'),
  name: 'v1',
  snapshot: {
    nodes: [],
    edges: [],
    viewport: diagramDescription.viewport,
  },
  createdAt: timestamp,
};

function diagramFixture() {
  const node = new DiagramNode('node-1', nodeDescription);
  const edge = new DiagramEdge('edge-1', edgeDescription);
  const version = new DiagramVersion('version-1', versionDescription);
  const draftNodes: DraftNode[] = [
    { id: 'node-1', description: nodeDescription },
  ];
  const draftEdges: DraftEdge[] = [
    { id: 'edge-1', description: edgeDescription },
  ];

  const nodes = {
    findAll: vi.fn(async () => [node]),
    findByIdentity: vi.fn(async () => node),
    size: vi.fn(async () => 1),
    add: vi.fn(async () => node),
    addWithId: vi.fn(async () => node),
    addAll: vi.fn(async () => [node]),
    update: vi.fn(async () => node),
    delete: vi.fn(async () => undefined),
    replaceAll: vi.fn(async () => undefined),
  } satisfies DiagramNodes;

  const edges = {
    findAll: vi.fn(async () => [edge]),
    findByIdentity: vi.fn(async () => edge),
    size: vi.fn(async () => 1),
    add: vi.fn(async () => edge),
    addWithId: vi.fn(async () => edge),
    addAll: vi.fn(async () => [edge]),
    update: vi.fn(async () => edge),
    delete: vi.fn(async () => undefined),
    replaceAll: vi.fn(async () => undefined),
  } satisfies DiagramEdges;

  const versions = {
    findAll: vi.fn(async () => [version]),
    findByIdentity: vi.fn(async () => version),
    size: vi.fn(async () => 1),
    add: vi.fn(async () => version),
  } satisfies DiagramVersions;

  const diagram = new Diagram(
    'diagram-1',
    diagramDescription,
    nodes,
    edges,
    versions,
  );

  return {
    diagram,
    draftEdges,
    draftNodes,
    edge,
    edges,
    node,
    nodes,
    version,
    versions,
  };
}

describe('Diagram', () => {
  it('returns identity and description', () => {
    const { diagram } = diagramFixture();

    expect(diagram.identity()).toBe('diagram-1');
    expect(diagram.description()).toBe(diagramDescription);
  });

  it('exposes child collections as HasMany collections', async () => {
    const { diagram, edge, node, version } = diagramFixture();

    const nodes: HasMany<DiagramNode> = diagram.nodes();
    const edges: HasMany<DiagramEdge> = diagram.edges();
    const versions: HasMany<DiagramVersion> = diagram.versions();

    await expect(nodes.findAll(0, 10)).resolves.toEqual([node]);
    await expect(edges.findByIdentity('edge-1')).resolves.toBe(edge);
    await expect(versions.size()).resolves.toBe(1);
    await expect(versions.findAll(0, 10)).resolves.toEqual([version]);
  });

  it('delegates node commands to the diagram nodes collection', async () => {
    const { diagram, draftNodes, node, nodes } = diagramFixture();

    await expect(diagram.addNode(nodeDescription)).resolves.toBe(node);
    await expect(
      diagram.addNodeWithId('node-1', nodeDescription),
    ).resolves.toBe(node);
    await expect(diagram.addNodes([nodeDescription])).resolves.toEqual([node]);
    await expect(diagram.updateNode('node-1', nodeDescription)).resolves.toBe(
      node,
    );
    await expect(diagram.deleteNode('node-1')).resolves.toBeUndefined();
    await expect(diagram.replaceNodes(draftNodes)).resolves.toBeUndefined();

    expect(nodes.add).toHaveBeenCalledWith(nodeDescription);
    expect(nodes.addWithId).toHaveBeenCalledWith('node-1', nodeDescription);
    expect(nodes.addAll).toHaveBeenCalledWith([nodeDescription]);
    expect(nodes.update).toHaveBeenCalledWith('node-1', nodeDescription);
    expect(nodes.delete).toHaveBeenCalledWith('node-1');
    expect(nodes.replaceAll).toHaveBeenCalledWith(draftNodes);
  });

  it('delegates edge commands to the diagram edges collection', async () => {
    const { diagram, draftEdges, edge, edges } = diagramFixture();

    await expect(diagram.addEdge(edgeDescription)).resolves.toBe(edge);
    await expect(
      diagram.addEdgeWithId('edge-1', edgeDescription),
    ).resolves.toBe(edge);
    await expect(diagram.addEdges([edgeDescription])).resolves.toEqual([edge]);
    await expect(diagram.updateEdge('edge-1', edgeDescription)).resolves.toBe(
      edge,
    );
    await expect(diagram.deleteEdge('edge-1')).resolves.toBeUndefined();
    await expect(diagram.replaceEdges(draftEdges)).resolves.toBeUndefined();

    expect(edges.add).toHaveBeenCalledWith(edgeDescription);
    expect(edges.addWithId).toHaveBeenCalledWith('edge-1', edgeDescription);
    expect(edges.addAll).toHaveBeenCalledWith([edgeDescription]);
    expect(edges.update).toHaveBeenCalledWith('edge-1', edgeDescription);
    expect(edges.delete).toHaveBeenCalledWith('edge-1');
    expect(edges.replaceAll).toHaveBeenCalledWith(draftEdges);
  });

  it('creates diagram versions from current nodes and edges', async () => {
    const { diagram, version, versions } = diagramFixture();

    await expect(diagram.createVersion()).resolves.toBe(version);

    expect(versions.add).toHaveBeenCalledWith({
      diagram: new Ref('diagram-1'),
      name: 'v2',
      snapshot: {
        nodes: [
          {
            id: 'node-1',
            description: nodeDescription,
          },
        ],
        edges: [
          {
            id: 'edge-1',
            description: edgeDescription,
          },
        ],
        viewport: diagramDescription.viewport,
      },
      createdAt: '',
    });
  });
});
