import { describe, expect, it } from 'vitest';
import { PrismaWorkspaceDiagrams } from './workspace-diagrams';
import {
  asStore,
  diagramDescription,
  diagramRow,
  edgeDescription,
  mockPrismaStore,
  nodeDescription,
} from './test-support';

describe('PrismaWorkspaceDiagrams', () => {
  it('reads only non-deleted diagrams from the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.diagram.findMany.mockResolvedValue([diagramRow()]);
    store.diagram.findFirst.mockResolvedValue(diagramRow());
    store.diagram.count.mockResolvedValue(1);
    const diagrams = new PrismaWorkspaceDiagrams(asStore(store), 'workspace-1');

    await expect(
      diagrams.findAll().subCollection(0, 10).toArray(),
    ).resolves.toHaveLength(1);
    await expect(diagrams.findByIdentity('diagram-1')).resolves.toMatchObject({
      identity: expect.any(Function),
    });
    await expect(diagrams.size()).resolves.toBe(1);

    expect(store.diagram.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', deletedAt: null },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.diagram.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        deletedAt: null,
        id: 'diagram-1',
      },
    });
  });

  it('adds and soft deletes diagrams in the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.diagram.create.mockResolvedValue(diagramRow());
    store.diagram.findFirst.mockResolvedValue(diagramRow());
    store.diagram.update.mockResolvedValue(diagramRow());
    const diagrams = new PrismaWorkspaceDiagrams(asStore(store), 'workspace-1');

    const diagram = await diagrams.add(
      diagramDescription({ title: '  Fulfillment  ' }),
    );
    await expect(diagrams.delete('diagram-1')).resolves.toBeUndefined();

    expect(diagram.identity()).toBe('diagram-1');
    expect(store.diagram.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        workspaceId: 'workspace-1',
        title: 'Fulfillment',
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    });
    expect(store.diagram.update).toHaveBeenCalledWith({
      where: { id: 'diagram-1' },
      data: {
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
  });

  it('replaces draft nodes and edges atomically when saving a diagram', async () => {
    const store = mockPrismaStore();
    store.diagram.findFirst.mockResolvedValue(diagramRow());
    store.diagramNode.deleteMany.mockResolvedValue({ count: 2 });
    store.diagramEdge.deleteMany.mockResolvedValue({ count: 1 });
    store.diagramNode.createMany.mockResolvedValue({ count: 2 });
    store.diagramEdge.createMany.mockResolvedValue({ count: 1 });
    const diagrams = new PrismaWorkspaceDiagrams(asStore(store), 'workspace-1');

    await diagrams.saveDiagram(
      'diagram-1',
      [
        { id: 'node-1', description: nodeDescription() },
        { id: 'node-2', description: nodeDescription({ logicalEntity: null }) },
      ],
      [{ id: 'edge-1', description: edgeDescription() }],
    );

    expect(store.$transaction).toHaveBeenCalledOnce();
    expect(store.diagramEdge.deleteMany).toHaveBeenCalledWith({
      where: { diagramId: 'diagram-1' },
    });
    expect(store.diagramNode.deleteMany).toHaveBeenCalledWith({
      where: { diagramId: 'diagram-1' },
    });
    expect(store.diagramNode.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'node-1', diagramId: 'diagram-1' }),
        expect.objectContaining({ id: 'node-2', diagramId: 'diagram-1' }),
      ]),
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
    expect(store.diagram.update).toHaveBeenCalledWith({
      where: { id: 'diagram-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('rejects draft edges whose nodes are not in the same draft payload', async () => {
    const store = mockPrismaStore();
    store.diagram.findFirst.mockResolvedValue(diagramRow());
    const diagrams = new PrismaWorkspaceDiagrams(asStore(store), 'workspace-1');

    await expect(
      diagrams.saveDiagram(
        'diagram-1',
        [{ id: 'node-1', description: nodeDescription() }],
        [{ id: 'edge-1', description: edgeDescription() }],
      ),
    ).rejects.toMatchObject({ kind: 'validation' });
  });
});
