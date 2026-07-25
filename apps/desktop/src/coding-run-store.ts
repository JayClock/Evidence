import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type { CodingWorktree } from './coding-worktree';

const STORE_VERSION = 1;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface LocalCodingRunRecord {
  apiBaseUrl: string;
  workspaceId: string;
  runId: string;
  worktree: CodingWorktree | null;
  diffSha256: string | null;
  changedFileCount: number | null;
  commitSha: string | null;
  updatedAt: string;
}

export type LocalCodingRunRecordInput = Omit<LocalCodingRunRecord, 'updatedAt'>;

interface CodingRunDocument {
  version: typeof STORE_VERSION;
  runs: Record<string, LocalCodingRunRecord>;
}

export class CodingRunStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storePath: string) {}

  save(input: LocalCodingRunRecordInput): Promise<LocalCodingRunRecord> {
    const operation = this.writeQueue.then(() => this.persist(input));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async find(
    apiBaseUrl: string,
    runId: string,
  ): Promise<LocalCodingRunRecord | null> {
    await this.writeQueue;
    const document = await this.readDocument();
    return document.runs[recordKey(apiBaseUrl, runId)] ?? null;
  }

  async list(apiBaseUrl: string): Promise<LocalCodingRunRecord[]> {
    await this.writeQueue;
    const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const document = await this.readDocument();
    return Object.values(document.runs).filter(
      (record) => record.apiBaseUrl === normalizedApiBaseUrl,
    );
  }

  remove(apiBaseUrl: string, runId: string): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const document = await this.readDocument();
      const key = recordKey(apiBaseUrl, runId);
      if (!(key in document.runs)) return;
      delete document.runs[key];
      await this.writeDocument(document);
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async persist(
    input: LocalCodingRunRecordInput,
  ): Promise<LocalCodingRunRecord> {
    const record = normalizeRecord({
      ...input,
      updatedAt: new Date().toISOString(),
    });
    const document = await this.readDocument();
    document.runs[recordKey(record.apiBaseUrl, record.runId)] = record;
    await this.writeDocument(document);
    return record;
  }

  private async readDocument(): Promise<CodingRunDocument> {
    let content: string;
    try {
      content = await readFile(this.storePath, 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return { version: STORE_VERSION, runs: {} };
      }
      throw error;
    }

    let value: unknown;
    try {
      value = JSON.parse(content) as unknown;
    } catch {
      throw new Error('Local Coding Run store contains invalid JSON.');
    }
    if (!isDocument(value)) {
      throw new Error('Local Coding Run store has an unsupported format.');
    }
    return value;
  }

  private async writeDocument(document: CodingRunDocument): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    const temporaryPath = `${this.storePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.storePath);
  }
}

function normalizeRecord(value: LocalCodingRunRecord): LocalCodingRunRecord {
  const apiBaseUrl = normalizeApiBaseUrl(value.apiBaseUrl);
  const workspaceId = normalizeId(value.workspaceId, 'Workspace');
  const runId = normalizeId(value.runId, 'Coding Run');
  const worktree =
    value.worktree === null ? null : normalizeWorktree(value.worktree, runId);
  const diffSha256 = nullableSha256(value.diffSha256);
  const changedFileCount = nullableChangedFileCount(value.changedFileCount);
  const commitSha = nullableCommit(value.commitSha);
  if ((diffSha256 === null) !== (changedFileCount === null)) {
    throw new Error('Local Coding Run diff facts must be recorded together.');
  }
  if ((diffSha256 !== null || commitSha !== null) && worktree === null) {
    throw new Error('Local Coding Run review facts require a worktree.');
  }
  if (commitSha !== null && diffSha256 === null) {
    throw new Error('Local Coding Run commit requires reviewed diff facts.');
  }
  if (!Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error('Local Coding Run update time is invalid.');
  }
  return {
    apiBaseUrl,
    workspaceId,
    runId,
    worktree,
    diffSha256,
    changedFileCount,
    commitSha,
    updatedAt: value.updatedAt,
  };
}

function normalizeWorktree(
  value: CodingWorktree,
  runId: string,
): CodingWorktree {
  if (
    !value ||
    typeof value !== 'object' ||
    value.runId !== runId ||
    !isAbsolute(value.repositoryRoot) ||
    !isAbsolute(value.worktreeRoot) ||
    value.branchName !== `evidence/run-${runId}`
  ) {
    throw new Error('Local Coding Run worktree identity is invalid.');
  }
  return {
    runId,
    repositoryRoot: value.repositoryRoot,
    worktreeRoot: value.worktreeRoot,
    branchName: value.branchName,
    baseCommitSha: commit(value.baseCommitSha),
  };
}

function normalizeApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Local Coding Run API URL must be absolute.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Local Coding Run API URL must use HTTP(S).');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!ID_PATTERN.test(normalized)) {
    throw new Error(`Local ${label} identity is invalid.`);
  }
  return normalized;
}

function nullableSha256(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error('Local Coding Run diff SHA-256 is invalid.');
  }
  return normalized;
}

function nullableChangedFileCount(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error('Local Coding Run changed file count is invalid.');
  }
  return value;
}

function nullableCommit(value: string | null): string | null {
  return value === null ? null : commit(value);
}

function commit(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(normalized)) {
    throw new Error('Local Coding Run commit SHA is invalid.');
  }
  return normalized;
}

function recordKey(apiBaseUrl: string, runId: string): string {
  return `${normalizeApiBaseUrl(apiBaseUrl)}\u0000${normalizeId(runId, 'Coding Run')}`;
}

function isDocument(value: unknown): value is CodingRunDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as Partial<CodingRunDocument>;
  if (
    document.version !== STORE_VERSION ||
    !document.runs ||
    typeof document.runs !== 'object' ||
    Array.isArray(document.runs)
  ) {
    return false;
  }
  return Object.entries(document.runs).every(([key, candidate]) => {
    try {
      const record = normalizeRecord(candidate as LocalCodingRunRecord);
      return key === recordKey(record.apiBaseUrl, record.runId);
    } catch {
      return false;
    }
  });
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}
