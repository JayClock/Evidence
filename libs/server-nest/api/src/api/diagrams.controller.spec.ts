import { describe, expect, it, vi } from 'vitest';
import {
  Ref,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type Entity,
  type Many,
  type Workspace,
} from '@evidence/server-nest-domain';
import { DiagramsController } from './diagrams.controller';
import type { ResourceResolver } from './resource-resolver.service';

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

function fixture() {
  const node = {
    identity: () => 'node-1',
    description: () => ({
      diagram: new Ref('model'),
      kind: 'EVIDENCE',
      logicalEntity: null,
      parent: null,
      position: { x: 0, y: 0 },
      width: null,
      height: null,
      data: {},
      createdAt: '',
      updatedAt: '',
    }),
  } as unknown as DiagramNode;
  const edge = {
    identity: () => 'edge-1',
    description: () => ({
      diagram: new Ref('model'),
      source: new Ref('node-1'),
      target: new Ref('node-2'),
      logicalRelationship: null,
      sourceHandle: null,
      targetHandle: null,
      kind: null,
      style: {},
      data: {},
      animated: false,
      hidden: false,
      markerStart: null,
      markerEnd: null,
      pathOptions: {},
      interactionWidth: null,
      createdAt: '',
      updatedAt: '',
    }),
  } as unknown as DiagramEdge;
  const diagram = {
    identity: () => 'model',
    description: () => ({
      workspace: new Ref('workspace-1'),
      title: 'Model',
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: '',
      updatedAt: '',
    }),
    nodes: () => ({
      findAll: () => many([node]),
      findByIdentity: vi.fn(async () => node),
    }),
    edges: () => ({
      findAll: () => many([edge]),
      findByIdentity: vi.fn(async () => edge),
    }),
  } as unknown as Diagram;
  const workspace = {
    identity: () => 'workspace-1',
    logicalEntities: () => ({
      findAll: () => many([]),
      findByIdentity: vi.fn(async () => null),
    }),
  } as unknown as Workspace;
  const resolver = {
    requireWorkspaceDiagram: vi.fn(async () => [workspace, diagram]),
    requireDiagramNode: vi.fn(async () => [workspace, diagram, node]),
    requireDiagramEdge: vi.fn(async () => [workspace, diagram, edge]),
  } as unknown as ResourceResolver;

  return {
    controller: new DiagramsController(resolver),
    resolver,
  };
}

describe('DiagramsController', () => {
  it('returns the singular workspace diagram resource', async () => {
    const { controller } = fixture();

    const model = await controller.getDiagram('workspace-1');

    expect(model.id).toBe('model');
    expect(model._links).toMatchObject({
      self: { href: '/api/workspaces/workspace-1/diagram' },
      nodes: { href: '/api/workspaces/workspace-1/diagram/nodes' },
      edges: { href: '/api/workspaces/workspace-1/diagram/edges' },
    });
    expect(model._links).not.toHaveProperty('collection');
  });

  it('returns projected nodes and edges with singular links', async () => {
    const { controller } = fixture();

    const nodes = await controller.listNodes('workspace-1');
    const edges = await controller.listEdges('workspace-1');

    expect(nodes._links.self.href).toBe(
      '/api/workspaces/workspace-1/diagram/nodes',
    );
    expect(nodes._embedded.nodes[0]?._links.self.href).toBe(
      '/api/workspaces/workspace-1/diagram/nodes/node-1',
    );
    expect(edges._links.self.href).toBe(
      '/api/workspaces/workspace-1/diagram/edges',
    );
    expect(edges._embedded.edges[0]?._links.self.href).toBe(
      '/api/workspaces/workspace-1/diagram/edges/edge-1',
    );
  });

  it('validates a proposal requirement before loading the diagram', async () => {
    const { controller, resolver } = fixture();

    await expect(
      controller.proposeModel('workspace-1', { requirement: '  ' }),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(resolver.requireWorkspaceDiagram).not.toHaveBeenCalled();
  });
});
