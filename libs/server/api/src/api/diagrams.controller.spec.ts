import { describe, expect, it, vi } from 'vitest';
import {
  Ref,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type DomainArchitect,
  type Entity,
  type Many,
  type ModelingEvent,
  type Workspace,
} from '@evidence/server-domain';
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

function fixture(modelingEvents: ModelingEvent[] = [{ type: 'completed' }]) {
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
    description: () => ({
      metadata: { evidenceRoot: '/projects/orders/.evidence' },
    }),
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

  const domainArchitect = {
    proposeModelStream: vi.fn(async function* () {
      for (const event of modelingEvents) {
        yield event;
      }
    }),
  } as DomainArchitect;

  return {
    controller: new DiagramsController(resolver, domainArchitect),
    resolver,
    domainArchitect,
  };
}

async function readStream(stream: AsyncIterable<unknown>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
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
    const { controller, resolver, domainArchitect } = fixture();

    await expect(
      controller.proposeModel('workspace-1', { requirement: '  ' }),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(resolver.requireWorkspaceDiagram).not.toHaveBeenCalled();
    expect(domainArchitect.proposeModelStream).not.toHaveBeenCalled();
  });

  it('streams architect events from the workspace evidence root', async () => {
    const { controller, domainArchitect } = fixture([
      { type: 'reasoning-started' },
      { type: 'text-chunk', chunk: 'line one\nline two' },
      {
        type: 'tool-call-ready',
        toolCallId: 'call-1',
        toolName: 'read',
        input: { path: 'entities' },
      },
      { type: 'completed' },
    ]);

    const response = await controller.proposeModel('workspace-1', {
      requirement: 'Add an order',
    });

    await expect(readStream(response.getStream())).resolves.toBe(
      'event: thinking-start\ndata: \n\n' +
        'data: line one\ndata: line two\n\n' +
        'event: tool-call\n' +
        'data: {"toolCallId":"call-1","toolName":"read","input":{"path":"entities"}}\n\n' +
        'event: complete\ndata: \n\n',
    );
    expect(domainArchitect.proposeModelStream).toHaveBeenCalledWith({
      requirement: 'Add an order',
      modelDirectory: '/projects/orders/.evidence',
      signal: expect.any(AbortSignal),
    });
  });
});
