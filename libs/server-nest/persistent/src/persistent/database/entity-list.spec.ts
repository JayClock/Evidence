import { describe, expect, it } from 'vitest';
import { Entity } from '@evidence/server-nest-domain';
import { EntityList } from './entity-list';

class TestEntity implements Entity<string, { name: string }> {
  constructor(
    private readonly id: string,
    private readonly desc: { name: string },
  ) {}

  identity(): string {
    return this.id;
  }

  description(): { name: string } {
    return this.desc;
  }
}

class TestEntityList extends EntityList<TestEntity> {
  constructor(private readonly entities: TestEntity[]) {
    super();
  }

  override async size(): Promise<number> {
    return this.entities.length;
  }

  protected override batchSize(): number {
    return 1;
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<TestEntity[]> {
    return this.entities.slice(from, to);
  }

  protected override async findEntity(id: string): Promise<TestEntity | null> {
    return this.entities.find((entity) => entity.identity() === id) ?? null;
  }
}

describe('database EntityList', () => {
  it('implements HasMany and batches Many iteration', async () => {
    const first = new TestEntity('entity-1', { name: 'first' });
    const second = new TestEntity('entity-2', { name: 'second' });
    const list = new TestEntityList([first, second]);

    expect(list.findAll()).toBe(list);
    await expect(list.findByIdentity('entity-2')).resolves.toBe(second);
    await expect(list.findByIdentity('missing')).resolves.toBeNull();
    await expect(list.findAll().size()).resolves.toBe(2);
    await expect(list.findAll().subCollection(1, 2).toArray()).resolves.toEqual(
      [second],
    );

    const iterated: TestEntity[] = [];
    for await (const entity of list.findAll()) {
      iterated.push(entity);
    }
    expect(iterated).toEqual([first, second]);
  });
});
