import { describe, expect, it } from 'vitest';
import { PrismaWorkspaceLogicalRelationships } from './workspace-logical-relationships';
import {
  asStore,
  logicalEntityRow,
  logicalRelationshipDescription,
  logicalRelationshipRow,
  mockPrismaStore,
} from './test-support';

describe('PrismaWorkspaceLogicalRelationships', () => {
  it('reads only non-deleted relationships from the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.logicalRelationship.findMany.mockResolvedValue([
      logicalRelationshipRow(),
    ]);
    store.logicalRelationship.findFirst.mockResolvedValue(
      logicalRelationshipRow(),
    );
    store.logicalRelationship.count.mockResolvedValue(1);
    const relationships = new PrismaWorkspaceLogicalRelationships(
      asStore(store),
      'workspace-1',
    );

    await expect(relationships.findAll(0, 10)).resolves.toHaveLength(1);
    await expect(
      relationships.findByIdentity('relationship-1'),
    ).resolves.toMatchObject({ identity: expect.any(Function) });
    await expect(relationships.size()).resolves.toBe(1);

    expect(store.logicalRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', deletedAt: null },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.logicalRelationship.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        deletedAt: null,
        id: 'relationship-1',
      },
    });
  });

  it('adds a relationship only after validating both endpoint entities', async () => {
    const store = mockPrismaStore();
    store.logicalEntity.findFirst.mockResolvedValue(logicalEntityRow());
    store.logicalRelationship.create.mockResolvedValue(
      logicalRelationshipRow(),
    );
    const relationships = new PrismaWorkspaceLogicalRelationships(
      asStore(store),
      'workspace-1',
    );

    const relationship = await relationships.add(
      logicalRelationshipDescription(),
    );

    expect(relationship.identity()).toBe('relationship-1');
    expect(store.logicalEntity.findFirst).toHaveBeenCalledTimes(2);
    expect(store.logicalEntity.findFirst).toHaveBeenCalledWith({
      where: { id: 'entity-1', workspaceId: 'workspace-1', deletedAt: null },
    });
    expect(store.logicalEntity.findFirst).toHaveBeenCalledWith({
      where: { id: 'entity-2', workspaceId: 'workspace-1', deletedAt: null },
    });
    expect(store.logicalRelationship.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        sourceId: 'entity-1',
        targetId: 'entity-2',
        label: 'fulfills',
      }),
    });
  });

  it('rejects relationships whose endpoint is outside the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.logicalEntity.findFirst.mockResolvedValueOnce(logicalEntityRow());
    store.logicalEntity.findFirst.mockResolvedValueOnce(null);
    const relationships = new PrismaWorkspaceLogicalRelationships(
      asStore(store),
      'workspace-1',
    );

    await expect(
      relationships.add(logicalRelationshipDescription()),
    ).rejects.toMatchObject({ kind: 'validation' });
  });

  it('soft deletes an existing relationship', async () => {
    const store = mockPrismaStore();
    store.logicalRelationship.findFirst.mockResolvedValue(
      logicalRelationshipRow(),
    );
    store.logicalRelationship.update.mockResolvedValue(
      logicalRelationshipRow(),
    );
    const relationships = new PrismaWorkspaceLogicalRelationships(
      asStore(store),
      'workspace-1',
    );

    await expect(
      relationships.delete('relationship-1'),
    ).resolves.toBeUndefined();

    expect(store.logicalRelationship.update).toHaveBeenCalledWith({
      where: { id: 'relationship-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
