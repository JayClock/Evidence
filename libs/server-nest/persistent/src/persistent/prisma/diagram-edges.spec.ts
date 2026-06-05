import { describe, expect, it } from 'vitest';
import { PrismaDiagramEdges } from './diagram-edges';
import {
  asStore,
  edgeDescription,
  edgeRow,
  mockPrismaStore,
} from './test-support';

describe('PrismaDiagramEdges', () => {
  it('reads edges only from the scoped diagram', async () => {
    const store = mockPrismaStore();
    store.diagramEdge.findMany.mockResolvedValue([edgeRow()]);
    store.diagramEdge.findFirst.mockResolvedValue(edgeRow());
    store.diagramEdge.count.mockResolvedValue(1);
    const edges = new PrismaDiagramEdges(asStore(store), 'diagram-1');

    await expect(edges.findAll(0, 10)).resolves.toHaveLength(1);
    await expect(edges.findByIdentity('edge-1')).resolves.toMatchObject({
      identity: expect.any(Function),
    });
    await expect(edges.size()).resolves.toBe(1);

    expect(store.diagramEdge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { diagramId: 'diagram-1' },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.diagramEdge.findFirst).toHaveBeenCalledWith({
      where: { id: 'edge-1', diagramId: 'diagram-1' },
    });
  });

  it('adds edges with explicit ids and maps unique conflicts', async () => {
    const store = mockPrismaStore();
    store.diagramEdge.create.mockResolvedValue(
      edgeRow({ id: 'edge-explicit' }),
    );
    const edges = new PrismaDiagramEdges(asStore(store), 'diagram-1');

    const edge = await edges.addWithId('edge-explicit', edgeDescription());

    expect(edge.identity()).toBe('edge-explicit');
    expect(store.diagramEdge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'edge-explicit',
        diagramId: 'diagram-1',
        sourceId: 'node-1',
        targetId: 'node-2',
        logicalRelationshipId: 'relationship-1',
        sourceHandle: 'source',
        targetHandle: 'target',
      }),
    });

    store.diagramEdge.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      edges.addWithId('edge-explicit', edgeDescription()),
    ).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('updates and deletes edges only within the scoped diagram', async () => {
    const store = mockPrismaStore();
    store.diagramEdge.findFirst.mockResolvedValue(edgeRow());
    store.diagramEdge.update.mockResolvedValue(edgeRow({ kind: 'smoothstep' }));
    store.diagramEdge.delete.mockResolvedValue(edgeRow());
    const edges = new PrismaDiagramEdges(asStore(store), 'diagram-1');

    await expect(
      edges.update('edge-1', edgeDescription({ kind: 'smoothstep' })),
    ).resolves.toMatchObject({ identity: expect.any(Function) });
    await expect(edges.delete('edge-1')).resolves.toBeUndefined();

    expect(store.diagramEdge.findFirst).toHaveBeenCalledWith({
      where: { id: 'edge-1', diagramId: 'diagram-1' },
    });
    expect(store.diagramEdge.update).toHaveBeenCalledWith({
      where: { id: 'edge-1' },
      data: expect.objectContaining({
        id: 'edge-1',
        diagramId: 'diagram-1',
        kind: 'smoothstep',
        updatedAt: expect.any(Date),
      }),
    });
    expect(store.diagramEdge.delete).toHaveBeenCalledWith({
      where: { id: 'edge-1' },
    });
  });

  it('replaces all edges for the scoped diagram', async () => {
    const store = mockPrismaStore();
    store.diagramEdge.deleteMany.mockResolvedValue({ count: 1 });
    store.diagramEdge.createMany.mockResolvedValue({ count: 1 });
    const edges = new PrismaDiagramEdges(asStore(store), 'diagram-1');

    await edges.replaceAll([{ id: 'edge-1', description: edgeDescription() }]);

    expect(store.diagramEdge.deleteMany).toHaveBeenCalledWith({
      where: { diagramId: 'diagram-1' },
    });
    expect(store.diagramEdge.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'edge-1',
          diagramId: 'diagram-1',
          sourceId: 'node-1',
          targetId: 'node-2',
        }),
      ],
    });
  });
});
