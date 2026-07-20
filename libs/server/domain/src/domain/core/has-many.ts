import type { Entity } from './entity';
import type { Many } from './many';

export interface HasMany<E extends Entity<string, unknown>> {
  findAll(): Many<E>;
  findByIdentity(id: string): Promise<E | null>;
}
