import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allocateIterationId,
  boardLockPath,
  boardPath,
  mutateBoard,
  readBoard,
} from './board-repository';
import type { BoardItem } from './board-state';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../test-support/support';

afterEach(cleanupWorkspaces);

function item(
  cwd: string,
  iterationId = 'ITER-0002',
  candidateId = 'CAND-0001',
): BoardItem {
  const suffix = iterationId.slice('ITER-'.length);
  return {
    iteration_id: iterationId,
    candidate_id: candidateId,
    lifecycle: 'provisioning',
    branch_name: `evidence/iter-${suffix}`,
    worktree_path: join(cwd, '.worktrees', 'evidence', iterationId),
    base_sha: 'a'.repeat(40),
    admitted_lane: 'discovery',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('repository Story Board', () => {
  it('starts after historical artifact ids without importing historical work', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    mkdirSync(join(cwd, 'artifacts/iterations/ITER-0007'), {
      recursive: true,
    });

    expect(readBoard(cwd)).toEqual({
      revision: 0,
      next_iteration_number: 8,
      items: [],
    });
    expect(existsSync(boardPath(cwd))).toBe(false);
  });

  it('allocates monotonic ids and persists one atomic Candidate claim', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);

    const first = mutateBoard(cwd, (draft) => {
      const iterationId = allocateIterationId(draft);
      draft.items.push(item(cwd, iterationId));
      return iterationId;
    });

    expect(first.value).toBe('ITER-0001');
    expect(first.state).toMatchObject({
      revision: 1,
      next_iteration_number: 2,
    });
    expect(readBoard(cwd)).toEqual(first.state);

    const second = mutateBoard(cwd, (draft) => allocateIterationId(draft));
    expect(second.value).toBe('ITER-0002');
    expect(second.state.revision).toBe(2);
    expect(second.state.next_iteration_number).toBe(3);
  });

  it('rejects duplicate Candidate claims without changing the persisted Board', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    mutateBoard(cwd, (draft) => {
      draft.next_iteration_number = 3;
      draft.items.push(item(cwd));
    });
    const before = readBoard(cwd);

    expect(() =>
      mutateBoard(cwd, (draft) => {
        draft.next_iteration_number = 4;
        draft.items.push(item(cwd, 'ITER-0003', 'CAND-0001'));
      }),
    ).toThrow('Candidate claims must be unique');
    expect(readBoard(cwd)).toEqual(before);
    expect(existsSync(boardLockPath(cwd))).toBe(false);
  });

  it('rejects unknown fields and a next number behind allocated ids', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    mkdirSync(join(boardPath(cwd), '..'), { recursive: true });
    writeFileSync(
      boardPath(cwd),
      `${JSON.stringify({ revision: 0, next_iteration_number: 1, items: [], phase: 'legacy' })}\n`,
    );
    expect(() => readBoard(cwd)).toThrow('unsupported fields: phase');

    writeFileSync(
      boardPath(cwd),
      `${JSON.stringify({ revision: 0, next_iteration_number: 2, items: [item(cwd)] })}\n`,
    );
    expect(() => readBoard(cwd)).toThrow('next iteration number is not ahead');
  });

  it('fails closed when another process owns the Board lock', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    mkdirSync(join(boardLockPath(cwd), '..'), { recursive: true });
    writeFileSync(boardLockPath(cwd), '{"pid":999}\n');

    expect(() =>
      mutateBoard(cwd, () => undefined, { timeoutMs: 5, retryMs: 1 }),
    ).toThrow('Timed out acquiring Evidence Board lock');
  });
});
