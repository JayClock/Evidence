import { describe, expect, it } from 'vitest';
import { PrismaDiagramVersions } from './diagram-versions';
import {
  asStore,
  diagramVersionDescription,
  mockPrismaStore,
  versionRow,
} from './test-support';

describe('PrismaDiagramVersions', () => {
  it('reads versions only from the scoped diagram', async () => {
    const store = mockPrismaStore();
    store.diagramVersion.findMany.mockResolvedValue([versionRow()]);
    store.diagramVersion.findFirst.mockResolvedValue(versionRow());
    store.diagramVersion.count.mockResolvedValue(1);
    const versions = new PrismaDiagramVersions(asStore(store), 'diagram-1');

    await expect(
      versions.findAll().subCollection(0, 10).toArray(),
    ).resolves.toHaveLength(1);
    await expect(versions.findByIdentity('version-1')).resolves.toMatchObject({
      identity: expect.any(Function),
    });
    await expect(versions.findAll().size()).resolves.toBe(1);

    expect(store.diagramVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { diagramId: 'diagram-1' },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.diagramVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'version-1', diagramId: 'diagram-1' },
    });
  });

  it('adds a version snapshot in the scoped diagram', async () => {
    const store = mockPrismaStore();
    store.diagramVersion.create.mockResolvedValue(versionRow());
    const versions = new PrismaDiagramVersions(asStore(store), 'diagram-1');
    const description = diagramVersionDescription({ name: 'v2' });

    const version = await versions.add(description);

    expect(version.identity()).toBe('version-1');
    expect(store.diagramVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        diagramId: 'diagram-1',
        name: 'v2',
        snapshot: description.snapshot,
        createdAt: expect.any(Date),
      }),
    });
  });
});
