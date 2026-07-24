import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { canonicalGitRepository } from './git-repository';

const STORE_VERSION = 1;
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface WorkspaceBinding {
  apiBaseUrl: string;
  workspaceId: string;
  repositoryRoot: string;
  boundAt: string;
}

interface BindingDocument {
  version: typeof STORE_VERSION;
  bindings: Record<string, WorkspaceBinding>;
}

export class WorkspaceBindingStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storePath: string) {}

  bind(input: {
    apiBaseUrl: string;
    workspaceId: string;
    repositoryRoot: string;
  }): Promise<WorkspaceBinding> {
    const operation = this.writeQueue.then(() => this.persistBinding(input));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async find(
    apiBaseUrl: string,
    workspaceId: string,
  ): Promise<WorkspaceBinding | null> {
    await this.writeQueue;
    const document = await this.readDocument();
    return document.bindings[bindingKey(apiBaseUrl, workspaceId)] ?? null;
  }

  private async persistBinding(input: {
    apiBaseUrl: string;
    workspaceId: string;
    repositoryRoot: string;
  }): Promise<WorkspaceBinding> {
    const apiBaseUrl = normalizeApiBaseUrl(input.apiBaseUrl);
    const workspaceId = normalizeWorkspaceId(input.workspaceId);
    const repositoryRoot = await canonicalGitRepository(input.repositoryRoot);
    const binding: WorkspaceBinding = {
      apiBaseUrl,
      workspaceId,
      repositoryRoot,
      boundAt: new Date().toISOString(),
    };
    const document = await this.readDocument();
    document.bindings[bindingKey(apiBaseUrl, workspaceId)] = binding;
    await this.writeDocument(document);
    return binding;
  }

  private async readDocument(): Promise<BindingDocument> {
    let content: string;
    try {
      content = await readFile(this.storePath, 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return { version: STORE_VERSION, bindings: {} };
      }
      throw error;
    }

    let value: unknown;
    try {
      value = JSON.parse(content) as unknown;
    } catch {
      throw new Error('Workspace binding store contains invalid JSON.');
    }
    if (!isBindingDocument(value)) {
      throw new Error('Workspace binding store has an unsupported format.');
    }
    return value;
  }

  private async writeDocument(document: BindingDocument): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    const temporaryPath = `${this.storePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.storePath);
  }
}

function normalizeApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Workspace binding API URL must be absolute.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Workspace binding API URL must use HTTP(S).');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeWorkspaceId(value: string): string {
  const normalized = value.trim();
  if (!WORKSPACE_ID_PATTERN.test(normalized)) {
    throw new Error('Workspace binding identity is invalid.');
  }
  return normalized;
}

function bindingKey(apiBaseUrl: string, workspaceId: string): string {
  return `${normalizeApiBaseUrl(apiBaseUrl)}\u0000${normalizeWorkspaceId(workspaceId)}`;
}

function isBindingDocument(value: unknown): value is BindingDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<BindingDocument>;
  if (
    candidate.version !== STORE_VERSION ||
    !candidate.bindings ||
    typeof candidate.bindings !== 'object' ||
    Array.isArray(candidate.bindings)
  ) {
    return false;
  }
  return Object.entries(candidate.bindings).every(([key, binding]) => {
    if (!isWorkspaceBinding(binding)) return false;
    try {
      return (
        binding.apiBaseUrl === normalizeApiBaseUrl(binding.apiBaseUrl) &&
        binding.workspaceId === normalizeWorkspaceId(binding.workspaceId) &&
        key === bindingKey(binding.apiBaseUrl, binding.workspaceId)
      );
    } catch {
      return false;
    }
  });
}

function isWorkspaceBinding(value: unknown): value is WorkspaceBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Partial<WorkspaceBinding>;
  return (
    typeof binding.apiBaseUrl === 'string' &&
    typeof binding.workspaceId === 'string' &&
    typeof binding.repositoryRoot === 'string' &&
    isAbsolute(binding.repositoryRoot) &&
    typeof binding.boundAt === 'string' &&
    Number.isFinite(Date.parse(binding.boundAt))
  );
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}
