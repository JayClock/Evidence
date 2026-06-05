import { DomainError } from '@evidence/server-nest-domain';
import { Prisma } from '@prisma/client';

export function now(): Date {
  return new Date();
}

export function defaultIfBlank(value: string, defaultValue: string): string {
  const normalized = value.trim();
  return normalized.length === 0 ? defaultValue : normalized;
}

export function rejectInvalidPage(page: number, pageSize: number): void {
  if (page === 0 || pageSize === 0) {
    throw DomainError.validation('page and pageSize must be greater than 0');
  }
}

export function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002',
  );
}

export function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function nullableInputJson(
  value: unknown | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.DbNull : inputJson(value);
}
