import { DomainError } from '../error';
import type { Entity } from './entity';

export interface Many<E extends Entity<string, unknown>> {
  size(): Promise<number>;
  subCollection(from: number, to: number): Many<E>;
  toArray(): Promise<E[]>;
  [Symbol.asyncIterator](): AsyncIterator<E>;
}

export function validateRange(from: number, to: number): void {
  if (from < 0 || to < from) {
    throw DomainError.validation('invalid collection range');
  }
}
