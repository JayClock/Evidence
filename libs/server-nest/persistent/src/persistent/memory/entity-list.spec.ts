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

describe('memory EntityList', () => {
  it('implements HasMany and Many over in-memory entities', async () => {
    const first = new TestEntity('entity-1', { name: 'first' });
    const second = new TestEntity('entity-2', { name: 'second' });
    const list = new EntityList([first, second]);

    expect(list.findAll()).toBe(list);
    await expect(list.findByIdentity('entity-2')).resolves.toBe(second);
    await expect(list.findByIdentity('missing')).resolves.toBeNull();
    await expect(list.findAll().size()).resolves.toBe(2);
    await expect(list.findAll().subCollection(0, 1).toArray()).resolves.toEqual(
      [first],
    );

    const iterated: TestEntity[] = [];
    for await (const entity of list.findAll()) {
      iterated.push(entity);
    }
    expect(iterated).toEqual([first, second]);
  });
});
