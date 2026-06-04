import { DomainError } from '../error';

export interface HasMany<E> {
  findAll(from: number, to: number): Promise<E[]>;
  findByIdentity(id: string): Promise<E | null>;
  size(): Promise<number>;
}

export function validateRange(from: number, to: number): void {
  if (from < 0 || to < from) {
    throw DomainError.validation('invalid collection range');
  }
}
