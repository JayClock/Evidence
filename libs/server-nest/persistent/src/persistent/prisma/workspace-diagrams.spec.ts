import { describe, expect, it } from 'vitest';
import { PrismaWorkspaceDiagrams } from './workspace-diagrams';
import {
  asStore,
  diagramDescription,
  diagramRow,
  mockPrismaStore,
} from './test-support';

describe('PrismaWorkspaceDiagrams', () => {
  it('projects the current workspace model as one stable diagram', async () => {
    const store = mockPrismaStore();
    const diagrams = new PrismaWorkspaceDiagrams(asStore(store), 'workspace-1');

    const diagram = await diagrams.get();

    expect(diagram.identity()).toBe('model');
    expect(diagram.description()).toMatchObject({
      workspace: expect.objectContaining({ id: expect.any(Function) }),
      title: 'Model',
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(diagram.description().workspace.id()).toBe('workspace-1');
  });

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
});
