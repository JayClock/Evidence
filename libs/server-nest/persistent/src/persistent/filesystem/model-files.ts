import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { DomainError } from '@evidence/server-nest-domain';
import { parse } from 'yaml';

export type YamlRecord = Record<string, unknown>;

export async function listYamlFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return [];
    }
    throw DomainError.internal(
      `read Evidence model directory ${directory}: ${errorMessage(error)}`,
    );
  }

  return entries
    .filter((entry) => entry.isFile() && isYamlFile(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export async function readYamlRecord(
  path: string,
  resource: string,
): Promise<YamlRecord> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw DomainError.internal(
      `read ${resource} file ${path}: ${errorMessage(error)}`,
    );
  }

  try {
    const document: unknown = parse(text);
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
      throw new Error('the YAML document must be an object');
    }
    return document as YamlRecord;
  } catch (error) {
    throw DomainError.validation(
      `invalid ${resource} yaml ${path}: ${errorMessage(error)}`,
    );
  }
}

export function requiredString(
  record: YamlRecord,
  key: string,
  path: string,
  resource: string,
): string {
  const value = optionalString(record[key]);
  if (!value) {
    throw DomainError.validation(
      `${resource} file ${path} is missing required field ${key}`,
    );
  }
  return value;
}

export function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function fileTimestamp(path: string): Promise<string> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return '';
  }
}

function isYamlFile(path: string): boolean {
  return ['.yaml', '.yml'].includes(extname(path).toLowerCase());
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
