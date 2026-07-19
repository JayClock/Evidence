import { mkdir, realpath, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DomainError } from '@evidence/server-nest-domain';

const REPOSITORY_ROOT = 'repositoryRoot';
const EVIDENCE_ROOT = 'evidenceRoot';
const PATH_ALIASES = [REPOSITORY_ROOT, 'path', 'rootPath'] as const;

export async function normalizeWorkspaceMetadata(
  input: Record<string, string>,
  defaultRoot = process.cwd(),
): Promise<Record<string, string>> {
  const metadata = { ...input };
  const configuredRoot = PATH_ALIASES.map((key) => metadata[key]).find(
    (value) => value?.trim(),
  );
  const requestedRoot = configuredRoot ?? defaultRoot;

  let repositoryRoot: string;
  try {
    repositoryRoot = await realpath(requestedRoot);
  } catch (error) {
    throw DomainError.validation(
      `workspace path ${requestedRoot} is not accessible: ${errorMessage(error)}`,
    );
  }

  let repositoryStat;
  try {
    repositoryStat = await stat(repositoryRoot);
  } catch (error) {
    throw DomainError.validation(
      `workspace path ${repositoryRoot} is not accessible: ${errorMessage(error)}`,
    );
  }

  if (!repositoryStat.isDirectory()) {
    throw DomainError.validation(
      `workspace path ${repositoryRoot} is not a directory`,
    );
  }

  const evidenceRoot = join(repositoryRoot, '.evidence');
  try {
    await Promise.all(
      ['', 'entities', 'associations'].map((directory) =>
        mkdir(join(evidenceRoot, directory), { recursive: true }),
      ),
    );
  } catch (error) {
    throw DomainError.internal(
      `create evidence directory ${evidenceRoot}: ${errorMessage(error)}`,
    );
  }

  metadata[REPOSITORY_ROOT] = repositoryRoot;
  metadata[EVIDENCE_ROOT] = evidenceRoot;
  return metadata;
}

export function evidenceRootFromMetadata(
  metadata: Record<string, string>,
): string {
  const evidenceRoot = metadata[EVIDENCE_ROOT]?.trim();
  if (evidenceRoot) {
    return evidenceRoot;
  }

  const repositoryRoot = metadata[REPOSITORY_ROOT]?.trim();
  return repositoryRoot ? join(repositoryRoot, '.evidence') : '.evidence';
}

export function workspaceTitleFromMetadata(
  metadata: Record<string, string>,
): string | null {
  const repositoryRoot = metadata[REPOSITORY_ROOT]?.trim();
  if (!repositoryRoot) {
    return null;
  }

  const title = basename(repositoryRoot).trim();
  return title.length > 0 ? title : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
