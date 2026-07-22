import { mkdir, realpath, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { DomainError } from '@evidence/server-domain';

const REPOSITORY_ROOT = 'repositoryRoot';
const EVIDENCE_ROOT = 'evidenceRoot';
const PATH_ALIASES = [REPOSITORY_ROOT, 'path', 'rootPath'] as const;
const PRIVATE_METADATA_KEYS = new Set<string>([
  ...PATH_ALIASES,
  EVIDENCE_ROOT,
]);
const SAFE_WORKSPACE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export async function initializeWorkspaceModelRoot(
  workspaceId: string,
  storageRoot =
    process.env.EVIDENCE_WORKSPACE_STORAGE_ROOT ??
    join(process.cwd(), 'tmp', 'workspace-models'),
): Promise<string> {
  if (!SAFE_WORKSPACE_ID.test(workspaceId)) {
    throw DomainError.validation(`unsafe workspace identity: ${workspaceId}`);
  }
  return initializeRepositoryModelRoot(join(resolve(storageRoot), workspaceId));
}

export async function initializeRepositoryModelRoot(
  requestedRoot: string,
): Promise<string> {
  try {
    await mkdir(requestedRoot, { recursive: true });
  } catch (error) {
    throw DomainError.internal(
      `create workspace model root ${requestedRoot}: ${errorMessage(error)}`,
    );
  }
  const metadata = await normalizeWorkspaceMetadata({ path: requestedRoot });
  return evidenceRootFromMetadata(metadata);
}

export function publicWorkspaceMetadata(
  input: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !PRIVATE_METADATA_KEYS.has(key)),
  );
}

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
