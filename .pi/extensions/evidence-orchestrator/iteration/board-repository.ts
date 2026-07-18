import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeBoardState } from './board-codec';
import type { BoardState } from './board-state';
import { gitCommonDir, primaryWorktreeRoot } from './git-common-dir';

const BOARD_DIRECTORY = 'evidence-orchestrator';
const BOARD_FILE = 'board.json';
const BOARD_LOCK_FILE = 'board.lock';
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_RETRY_MS = 10;

export interface BoardLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  now?: () => number;
}

export interface BoardMutationResult<T> {
  state: BoardState;
  value: T;
}

function sleep(milliseconds: number): void {
  if (milliseconds <= 0) return;
  const signal = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
  );
  Atomics.wait(signal, 0, 0, milliseconds);
}

export function boardRoot(cwd: string): string {
  return join(gitCommonDir(cwd), BOARD_DIRECTORY);
}

export function boardPath(cwd: string): string {
  return join(boardRoot(cwd), BOARD_FILE);
}

export function boardLockPath(cwd: string): string {
  return join(boardRoot(cwd), BOARD_LOCK_FILE);
}

function historicalIterationFloor(cwd: string): number {
  const root = join(primaryWorktreeRoot(cwd), 'artifacts/iterations');
  if (!existsSync(root)) return 0;
  return readdirSync(root)
    .map((entry) => entry.match(/^ITER-(\d{4,})$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .filter(Number.isSafeInteger)
    .reduce((highest, value) => Math.max(highest, value), 0);
}

function emptyBoard(cwd: string): BoardState {
  return {
    revision: 0,
    next_iteration_number: historicalIterationFloor(cwd) + 1,
    items: [],
  };
}

export function readBoard(cwd: string): BoardState {
  const path = boardPath(cwd);
  if (!existsSync(path)) return normalizeBoardState(emptyBoard(cwd));
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`Evidence Board is invalid JSON: ${path}.`);
  }
  return normalizeBoardState(value);
}

function writeBoardFile(cwd: string, state: BoardState): BoardState {
  const normalized = normalizeBoardState(state);
  const path = boardPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(normalized, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, path);
  return normalized;
}

function acquireBoardLock(cwd: string, options: BoardLockOptions): () => void {
  const path = boardLockPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_LOCK_RETRY_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
    throw new Error('Board lock timeout must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(retryMs) || retryMs <= 0) {
    throw new Error('Board lock retry interval must be a positive integer.');
  }
  const started = now();
  while (true) {
    try {
      const descriptor = openSync(path, 'wx', 0o600);
      try {
        writeFileSync(
          descriptor,
          `${JSON.stringify({ pid: process.pid, acquired_at: new Date(now()).toISOString() })}\n`,
        );
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      return () => {
        try {
          unlinkSync(path);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      if (now() - started >= timeoutMs) {
        throw new Error(`Timed out acquiring Evidence Board lock: ${path}.`);
      }
      sleep(retryMs);
    }
  }
}

export function mutateBoard<T>(
  cwd: string,
  mutation: (draft: BoardState) => T,
  options: BoardLockOptions = {},
): BoardMutationResult<T> {
  const release = acquireBoardLock(cwd, options);
  try {
    const current = readBoard(cwd);
    const draft = structuredClone(current);
    const value = mutation(draft);
    draft.revision = current.revision + 1;
    return { state: writeBoardFile(cwd, draft), value };
  } finally {
    release();
  }
}

export function allocateIterationId(board: BoardState): string {
  const number = board.next_iteration_number;
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error('Board cannot allocate an invalid Iteration number.');
  }
  board.next_iteration_number += 1;
  return `ITER-${String(number).padStart(4, '0')}`;
}
