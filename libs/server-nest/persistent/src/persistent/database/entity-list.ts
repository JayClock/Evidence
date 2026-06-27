import {
  Entity,
  HasMany,
  Many,
  validateRange,
} from '@evidence/server-nest-domain';
import { EntityList as MemoryEntityList } from '../memory';

/** Base class for database-backed one-to-many associations. */
export abstract class EntityList<E extends Entity<string, unknown>>
  implements Many<E>, HasMany<E>
{
  findAll(): Many<E> {
    return this;
  }

  async findByIdentity(id: string): Promise<E | null> {
    return this.findEntity(id);
  }

  subCollection(from: number, to: number): Many<E> {
    validateRange(from, to);
    return this.lazySnapshot(from, to);
  }

  async toArray(): Promise<E[]> {
    return this.subCollection(0, await this.size()).toArray();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<E> {
    const total = await this.size();
    for (let current = 0; current < total; ) {
      const batch = this.subCollection(
        current,
        Math.min(current + this.batchSize(), total),
      );
      const items = await batch.toArray();
      if (items.length === 0) {
        break;
      }
      for (const entity of items) {
        current += 1;
        yield entity;
      }
    }
  }

  private lazySnapshot(from: number, to: number): Many<E> {
    let snapshot: Promise<Many<E>> | null = null;
    const load = () => {
      snapshot ??= this.findEntities(from, to).then((items) =>
        this.snapshot(items),
      );
      return snapshot;
    };

    return {
      size: async () => (await load()).size(),
      subCollection: (nestedFrom: number, nestedTo: number) => {
        validateRange(nestedFrom, nestedTo);
        return this.lazySnapshot(
          from + nestedFrom,
          Math.min(from + nestedTo, to),
        );
      },
      toArray: async () => (await load()).toArray(),
      async *[Symbol.asyncIterator]() {
        for await (const entity of await load()) {
          yield entity;
        }
      },
    };
  }

  protected batchSize(): number {
    return 100;
  }

  protected snapshot(items: E[]): Many<E> {
    return new MemoryEntityList(items);
  }

  abstract size(): Promise<number>;

  protected abstract findEntities(from: number, to: number): Promise<E[]>;

  protected abstract findEntity(id: string): Promise<E | null>;
}
