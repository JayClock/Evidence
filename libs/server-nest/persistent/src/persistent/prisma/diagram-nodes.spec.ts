import { describe, expect, it } from 'vitest';
import { PrismaDiagramNodes } from './diagram-nodes';
import {
  asStore,
  mockPrismaStore,
  nodeDescription,
  nodeRow,
} from './test-support';

describe('PrismaDiagramNodes', () => {
  it('reads nodes only from the scoped diagram', async () => {
    const store = mockPrismaStore();
    store.diagramNode.findMany.mockResolvedValue([nodeRow()]);
    store.diagramNode.findFirst.mockResolvedValue(nodeRow());
    store.diagramNode.count.mockResolvedValue(1);
    const nodes = new PrismaDiagramNodes(asStore(store), 'diagram-1');

    await expect(
      nodes.findAll().subCollection(0, 10).toArray(),
    ).resolves.toHaveLength(1);
    await expect(nodes.findByIdentity('node-1')).resolves.toMatchObject({
      identity: expect.any(Function),
    });
    await expect(nodes.size()).resolves.toBe(1);

    expect(store.diagramNode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { diagramId: 'diagram-1' },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.diagramNode.findFirst).toHaveBeenCalledWith({
      where: { id: 'node-1', diagramId: 'diagram-1' },
    });
  });

  it('adds nodes with explicit ids and maps unique conflicts', async () => {
    const store = mockPrismaStore();
    store.diagramNode.create.mockResolvedValue(
      nodeRow({ id: 'node-explicit' }),
    );
    const nodes = new PrismaDiagramNodes(asStore(store), 'diagram-1');

    const node = await nodes.addWithId('node-explicit', nodeDescription());

    expect(node.identity()).toBe('node-explicit');
    expect(store.diagramNode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'node-explicit',
        diagramId: 'diagram-1',
        logicalEntityId: 'entity-1',
        position: { x: 100, y: 200 },
      }),
    });

    store.diagramNode.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      nodes.addWithId('node-explicit', nodeDescription()),
    ).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('updates and deletes nodes only within the scoped diagram', async () => {
    const store = mockPrismaStore();
    store.diagramNode.findFirst.mockResolvedValue(nodeRow());
    store.diagramNode.update.mockResolvedValue(nodeRow({ kind: 'group' }));
    store.diagramNode.delete.mockResolvedValue(nodeRow());
    const nodes = new PrismaDiagramNodes(asStore(store), 'diagram-1');

    await expect(
      nodes.update('node-1', nodeDescription({ kind: 'group' })),
    ).resolves.toMatchObject({ identity: expect.any(Function) });
    await expect(nodes.delete('node-1')).resolves.toBeUndefined();

    expect(store.diagramNode.findFirst).toHaveBeenCalledWith({
      where: { id: 'node-1', diagramId: 'diagram-1' },
    });
    expect(store.diagramNode.update).toHaveBeenCalledWith({
      where: { id: 'node-1' },
      data: expect.objectContaining({
        kind: 'group',
        updatedAt: expect.any(Date),
      }),
    });
    expect(store.diagramNode.delete).toHaveBeenCalledWith({
      where: { id: 'node-1' },
    });
  });
});
