import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  RecordPairCommandObservationInput,
  RecordPairDriverAttemptInput,
  RecordPairExceptionInput,
  RecordPairRedReviewInput,
} from '@evidence/api-client';
import type {
  IterationWorktreeSnapshot,
  IterationWorktree,
} from '../../capabilities/work-item-worktree/manager';
import type { PairCommandResult } from '../../capabilities/command-execution/runner';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const MAX_METADATA_BYTES = 256 * 1024;
const MAX_DIAGNOSTIC_BYTES = 50 * 1024;
const SCHEMA_VERSION = 1;

export interface PairCheckpointIdentity {
  apiBaseUrl: string;
  workspaceId: string;
  iterationId: string;
}

export type PairPendingEvidence =
  | { kind: 'driver'; input: RecordPairDriverAttemptInput }
  | { kind: 'command'; input: RecordPairCommandObservationInput }
  | { kind: 'red_review'; input: RecordPairRedReviewInput }
  | { kind: 'exception'; input: RecordPairExceptionInput };

export interface PairLocalDiagnostic
  extends Pick<
    PairCommandResult,
    | 'termination'
    | 'exitCode'
    | 'signal'
    | 'stdout'
    | 'stderr'
    | 'stdoutSha256'
    | 'stderrSha256'
  > {
  actionId: string;
  observationId: string | null;
}

export interface PairCheckpointInput {
  pairRunId: string;
  pairVersion: number;
  checkpoint: string;
  worktree: IterationWorktree;
  snapshot: IterationWorktreeSnapshot;
  pendingEvidence: PairPendingEvidence | null;
  diagnostic: PairLocalDiagnostic | null;
}

export interface PairLocalCheckpoint {
  schemaVersion: 1;
  pairRunId: string;
  pairVersion: number;
  checkpoint: string;
  baseCommitSha: string;
  branchName: string;
  diffSha256: string;
  worktreeSha256: string;
  patch: string;
  pendingEvidence: PairPendingEvidence | null;
  diagnostic: PairLocalDiagnostic | null;
  savedAt: string;
}

interface PairCheckpointMetadata extends Omit<PairLocalCheckpoint, 'patch'> {
  patchFile: string;
}

export class PairCheckpointStore {
  private readonly root: string;

  constructor(
    root: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.root = resolve(root);
  }

  async save(
    identity: PairCheckpointIdentity,
    input: PairCheckpointInput,
  ): Promise<PairLocalCheckpoint> {
    validateIdentity(identity);
    validateInput(input);
    const directory = this.directory(identity);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const patchFile = `${input.snapshot.sha256.slice('sha256:'.length)}.patch`;
    const patchPath = join(directory, patchFile);
    await writeImmutablePatch(patchPath, input.snapshot.content);
    const savedAt = this.clock().toISOString();
    const metadata: PairCheckpointMetadata = {
      schemaVersion: SCHEMA_VERSION,
      pairRunId: input.pairRunId,
      pairVersion: input.pairVersion,
      checkpoint: input.checkpoint,
      baseCommitSha: input.worktree.baseCommitSha,
      branchName: input.worktree.branchName,
      diffSha256: input.snapshot.sha256,
      worktreeSha256: input.snapshot.worktreeSha256,
      patchFile,
      pendingEvidence: input.pendingEvidence,
      diagnostic: input.diagnostic,
      savedAt,
    };
    const serialized = JSON.stringify(metadata);
    if (Buffer.byteLength(serialized) > MAX_METADATA_BYTES) {
      throw new Error('Pair checkpoint metadata exceeds its local bound.');
    }
    const temporary = join(directory, `.checkpoint-${randomUUID()}.tmp`);
    await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, join(directory, 'checkpoint.json'));
    return { ...metadata, patch: input.snapshot.content };
  }

  async load(
    identity: PairCheckpointIdentity,
  ): Promise<PairLocalCheckpoint | null> {
    validateIdentity(identity);
    const directory = this.directory(identity);
    let serialized: string;
    try {
      serialized = await readFile(join(directory, 'checkpoint.json'), 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    if (Buffer.byteLength(serialized) > MAX_METADATA_BYTES) {
      throw new Error('Pair checkpoint metadata exceeds its local bound.');
    }
    let value: unknown;
    try {
      value = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error('Pair checkpoint metadata is not valid JSON.');
    }
    const metadata = parseMetadata(value);
    const patchPath = join(directory, metadata.patchFile);
    const patch = await readFile(patchPath, 'utf8').catch((error: unknown) => {
      if (isMissing(error)) {
        throw new Error('Pair checkpoint patch is missing.');
      }
      throw error;
    });
    if (digest(patch) !== metadata.diffSha256) {
      throw new Error('Pair checkpoint patch SHA-256 does not match metadata.');
    }
    return { ...metadata, patch };
  }

  async clear(identity: PairCheckpointIdentity): Promise<void> {
    validateIdentity(identity);
    await rm(this.directory(identity), { recursive: true, force: true });
  }

  private directory(identity: PairCheckpointIdentity): string {
    return join(
      this.root,
      createHash('sha256')
        .update(
          JSON.stringify([
            normalizeApiBaseUrl(identity.apiBaseUrl),
            identity.workspaceId,
            identity.iterationId,
          ]),
        )
        .digest('hex'),
    );
  }
}

async function writeImmutablePatch(
  path: string,
  content: string,
): Promise<void> {
  try {
    await writeFile(path, content, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (!isExists(error)) throw error;
    const existing = await readFile(path, 'utf8');
    if (existing !== content) {
      throw new Error('Pair checkpoint patch content address collided.');
    }
  }
  const mode = (await stat(path)).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error('Pair checkpoint patch permissions are too broad.');
  }
}

function parseMetadata(value: unknown): PairCheckpointMetadata {
  const input = object(value, 'Pair checkpoint metadata');
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Pair checkpoint schema version is unsupported.');
  }
  const diffSha256 = sha256(input.diffSha256, 'checkpoint diff SHA-256');
  const patchFile = text(input.patchFile, 'checkpoint patch file', 100);
  if (patchFile !== `${diffSha256.slice('sha256:'.length)}.patch`) {
    throw new Error('Pair checkpoint patch identity is invalid.');
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    pairRunId: text(input.pairRunId, 'Pair Run id', 500),
    pairVersion: positiveInteger(input.pairVersion, 'Pair version'),
    checkpoint: text(input.checkpoint, 'Pair checkpoint', 100),
    baseCommitSha: gitSha(input.baseCommitSha),
    branchName: text(input.branchName, 'Pair branch', 500),
    diffSha256,
    worktreeSha256: sha256(input.worktreeSha256, 'checkpoint worktree SHA-256'),
    patchFile,
    pendingEvidence: parsePendingEvidence(input.pendingEvidence),
    diagnostic: parseDiagnostic(input.diagnostic),
    savedAt: timestamp(input.savedAt),
  };
}

function validateInput(input: PairCheckpointInput): void {
  text(input.pairRunId, 'Pair Run id', 500);
  positiveInteger(input.pairVersion, 'Pair version');
  text(input.checkpoint, 'Pair checkpoint', 100);
  gitSha(input.worktree.baseCommitSha);
  text(input.worktree.branchName, 'Pair branch', 500);
  sha256(input.snapshot.sha256, 'checkpoint diff SHA-256');
  sha256(input.snapshot.worktreeSha256, 'checkpoint worktree SHA-256');
  if (digest(input.snapshot.content) !== input.snapshot.sha256) {
    throw new Error('Pair checkpoint snapshot diff SHA-256 is invalid.');
  }
  parsePendingEvidence(input.pendingEvidence);
  parseDiagnostic(input.diagnostic);
}

function parsePendingEvidence(value: unknown): PairPendingEvidence | null {
  if (value === null || value === undefined) return null;
  const pending = object(value, 'pending Pair evidence');
  if (
    pending.kind !== 'driver' &&
    pending.kind !== 'command' &&
    pending.kind !== 'red_review' &&
    pending.kind !== 'exception'
  ) {
    throw new Error('Pending Pair evidence kind is invalid.');
  }
  const input = object(pending.input, 'pending Pair evidence input');
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized) > 64 * 1024) {
    throw new Error('Pending Pair evidence exceeds its local bound.');
  }
  return {
    kind: pending.kind,
    input,
  } as PairPendingEvidence;
}

function parseDiagnostic(value: unknown): PairLocalDiagnostic | null {
  if (value === null || value === undefined) return null;
  const diagnostic = object(value, 'Pair local diagnostic');
  const stdout = output(diagnostic.stdout, 'Pair diagnostic stdout');
  const stderr = output(diagnostic.stderr, 'Pair diagnostic stderr');
  return {
    actionId: text(diagnostic.actionId, 'Pair diagnostic action id', 500),
    observationId:
      diagnostic.observationId === null
        ? null
        : text(diagnostic.observationId, 'Pair observation id', 500),
    termination: oneOf(diagnostic.termination, 'Pair termination', [
      'exited',
      'timed_out',
      'signaled',
      'spawn_error',
    ] as const),
    exitCode:
      diagnostic.exitCode === null
        ? null
        : integer(diagnostic.exitCode, 'Pair exit code'),
    signal:
      diagnostic.signal === null
        ? null
        : text(diagnostic.signal, 'Pair command signal', 100),
    stdout,
    stderr,
    stdoutSha256: sha256(diagnostic.stdoutSha256, 'stdout SHA-256'),
    stderrSha256: sha256(diagnostic.stderrSha256, 'stderr SHA-256'),
  };
}

function validateIdentity(identity: PairCheckpointIdentity): void {
  normalizeApiBaseUrl(identity.apiBaseUrl);
  text(identity.workspaceId, 'Workspace id', 500);
  text(identity.iterationId, 'Iteration id', 500);
}

function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Evidence API must use HTTP(S).');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function output(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) > MAX_DIAGNOSTIC_BYTES
  ) {
    throw new Error(`${label} exceeds its local bound.`);
  }
  return value;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function gitSha(value: unknown): string {
  if (typeof value !== 'string' || !GIT_SHA.test(value)) {
    throw new Error('Pair base commit SHA is invalid.');
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result < 1) throw new Error(`${label} is invalid.`);
  return result;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('Pair checkpoint timestamp is invalid.');
  }
  return value;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  label: string,
  options: T,
): T[number] {
  if (typeof value === 'string' && options.includes(value)) return value;
  throw new Error(`${label} is invalid.`);
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'EEXIST';
}
