import { describe, expect, it } from 'vitest';
import { PrismaWorkspaceLogicalEntities } from './workspace-logical-entities';
import {
  asStore,
  logicalEntityDescription,
  logicalEntityRow,
  mockPrismaStore,
} from './test-support';

describe('PrismaWorkspaceLogicalEntities', () => {
  it('reads only non-deleted logical entities from the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.logicalEntity.findMany.mockResolvedValue([logicalEntityRow()]);
    store.logicalEntity.findFirst.mockResolvedValue(logicalEntityRow());
    store.logicalEntity.count.mockResolvedValue(1);
    const entities = new PrismaWorkspaceLogicalEntities(
      asStore(store),
      'workspace-1',
    );

    await expect(entities.findAll(0, 10)).resolves.toHaveLength(1);
    await expect(entities.findByIdentity('entity-1')).resolves.toMatchObject({
      identity: expect.any(Function),
    });
    await expect(entities.size()).resolves.toBe(1);

    expect(store.logicalEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', deletedAt: null },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.logicalEntity.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        deletedAt: null,
        id: 'entity-1',
      },
    });
  });

  it('adds a normalized logical entity in the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.logicalEntity.create.mockResolvedValue(logicalEntityRow());
    const entities = new PrismaWorkspaceLogicalEntities(
      asStore(store),
      'workspace-1',
    );

    const entity = await entities.add(
      logicalEntityDescription({
        name: '  RFP  ',
        subType: 'EVIDENCE:RFP',
      }),
    );

    expect(entity.identity()).toBe('entity-1');
    expect(entity.description().subType).toBe('rfp');
    expect(store.logicalEntity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        workspaceId: 'workspace-1',
        name: 'RFP',
        subType: 'rfp',
        attributes: [{ id: 'attribute-1', name: 'number' }],
      }),
    });
  });

  it('updates and soft deletes only visible logical entities', async () => {
    const store = mockPrismaStore();
    store.logicalEntity.findFirst.mockResolvedValue(logicalEntityRow());
    store.logicalEntity.update.mockResolvedValue(
      logicalEntityRow({ name: 'Updated RFP' }),
    );
    const entities = new PrismaWorkspaceLogicalEntities(
      asStore(store),
      'workspace-1',
    );

    await expect(
      entities.update(
        'entity-1',
        logicalEntityDescription({ name: 'Updated RFP' }),
      ),
    ).resolves.toMatchObject({ identity: expect.any(Function) });
    await expect(entities.delete('entity-1')).resolves.toBeUndefined();

    expect(store.logicalEntity.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        deletedAt: null,
        id: 'entity-1',
      },
    });
    expect(store.logicalEntity.update).toHaveBeenLastCalledWith({
      where: { id: 'entity-1' },
      data: {
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
  });
});
