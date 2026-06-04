import { ServerError } from '../domain';

export function parsePositiveInteger(
  input: string | undefined,
  defaultValue: number,
  name: string,
): number {
  if (input === undefined) {
    return defaultValue;
  }
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw ServerError.validation(`${name} must be greater than 0`);
  }
  return value;
}

export function totalPages(total: number, pageSize: number): number {
  return total === 0 ? 0 : Math.ceil(total / pageSize);
}
