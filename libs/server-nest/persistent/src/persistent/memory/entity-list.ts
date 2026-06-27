import {
  Entity,
  HasMany,
  Many,
  validateRange,
} from '@evidence/server-nest-domain';

/** In-memory one-to-many association implementation for eager hydration and tests. */
export class EntityList<E extends Entity<string, unknown>>
  implements Many<E>, HasMany<E>
{
  constructor(protected readonly items: E[] = []) {}

  findAll(): Many<E> {
    return this;
  }

  async findByIdentity(id: string): Promise<E | null> {
    return this.items.find((entity) => entity.identity() === id) ?? null;
  }

  async size(): Promise<number> {
    return this.items.length;
  }

  subCollection(from: number, to: number): Many<E> {
    validateRange(from, to);
    return new EntityList(this.items.slice(from, to));
  }

  async toArray(): Promise<E[]> {
    return [...this.items];
  }

  async *[Symbol.asyncIterator](): AsyncIterator<E> {
    for (const item of this.items) {
      yield item;
    }
  }
}
