import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { provisionWorkItem } from '../work-item-worktree/provisioner';
import { boardRoot, mutateBoard } from '../../iteration/board-repository';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { readState, writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';
import {
  ACTIVITY_BOARD_ROOT_ENV,
  ACTIVITY_ITERATION_ENV,
  ACTIVITY_LEASE_ID_ENV,
} from '../worktree-protection/activity-tool-policy';
import {
  acquireActivityLease,
  activityLeasePath,
  assertActivityMutationLease,
  recoverExpiredActivityLease,
  releaseActivityLease,
} from './lease';

const START = new Date('2026-01-01T00:00:00.000Z');
const AFTER_EXPIRY = new Date('2026-01-01T00:16:00.000Z');

function provision(cwd: string, candidateId: string) {
  return provisionWorkItem(
    cwd,
    candidateId,
    ({ iterationId, worktreeRoot }) => {
      writeState(worktreeRoot, { ...DEFAULT_STATE, iteration_id: iterationId });
    },
  );
}

function leaseOptions(suffix: number, now = START) {
  return {
    now: () => now,
    ownerPid: 42,
    leaseId: () =>
      `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
  };
}

afterEach(cleanupWorkspaces);

describe('Story activity leases', () => {
  it('serializes one Story and validates the child env plus State CAS', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const story = provision(cwd, 'CAND-0001');
    const state = readState(story.worktree.path);
    const lease = acquireActivityLease(
      cwd,
      story.worktree.path,
      state,
      'activity',
      leaseOptions(1),
    );

    expect(() =>
      acquireActivityLease(
        cwd,
        story.worktree.path,
        state,
        'activity',
        leaseOptions(2),
      ),
    ).toThrow('already held');
    expect(
      assertActivityMutationLease(
        cwd,
        story.worktree.path,
        state,
        {
          [ACTIVITY_ITERATION_ENV]: 'ITER-0001',
          [ACTIVITY_LEASE_ID_ENV]: lease.lease.lease_id,
          [ACTIVITY_BOARD_ROOT_ENV]: boardRoot(cwd),
        },
        START,
      ).lease_id,
    ).toBe(lease.lease.lease_id);

    writeState(story.worktree.path, {
      ...state,
      loop: 'understand',
      understand_stage: 'tqa',
    });
    expect(() =>
      assertActivityMutationLease(
        cwd,
        story.worktree.path,
        readState(story.worktree.path),
        {
          [ACTIVITY_ITERATION_ENV]: 'ITER-0001',
          [ACTIVITY_LEASE_ID_ENV]: lease.lease.lease_id,
          [ACTIVITY_BOARD_ROOT_ENV]: boardRoot(cwd),
        },
        START,
      ),
    ).toThrow('State CAS failed');

    releaseActivityLease(lease);
    expect(existsSync(activityLeasePath(cwd, 'ITER-0001'))).toBe(false);
  });

  it('allows independent non-Pair activities on different Stories', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const first = provision(cwd, 'CAND-0001');
    const second = provision(cwd, 'CAND-0002');

    const firstLease = acquireActivityLease(
      cwd,
      first.worktree.path,
      readState(first.worktree.path),
      'activity',
      leaseOptions(1),
    );
    const secondLease = acquireActivityLease(
      cwd,
      second.worktree.path,
      readState(second.worktree.path),
      'activity',
      leaseOptions(2),
    );

    expect(firstLease.lease.iteration_id).toBe('ITER-0001');
    expect(secondLease.lease.iteration_id).toBe('ITER-0002');
    releaseActivityLease(firstLease);
    releaseActivityLease(secondLease);
  });

  it('enforces the global Pair runner capacity across Stories', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const first = provision(cwd, 'CAND-0001');
    const second = provision(cwd, 'CAND-0002');
    mutateBoard(cwd, (draft) => {
      for (const item of draft.items) item.admitted_lane = 'delivery';
    });

    const firstLease = acquireActivityLease(
      cwd,
      first.worktree.path,
      readState(first.worktree.path),
      'pair',
      leaseOptions(1),
    );
    expect(() =>
      acquireActivityLease(
        cwd,
        second.worktree.path,
        readState(second.worktree.path),
        'pair',
        leaseOptions(2),
      ),
    ).toThrow('Pair runner lease capacity is exhausted');
    expect(existsSync(activityLeasePath(cwd, 'ITER-0002'))).toBe(false);

    releaseActivityLease(firstLease);
  });

  it('never steals an expired lease and records explicit human recovery', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const story = provision(cwd, 'CAND-0001');
    const state = readState(story.worktree.path);
    acquireActivityLease(
      cwd,
      story.worktree.path,
      state,
      'activity',
      leaseOptions(1),
    );

    expect(() =>
      acquireActivityLease(
        cwd,
        story.worktree.path,
        state,
        'activity',
        leaseOptions(2, AFTER_EXPIRY),
      ),
    ).toThrow('expired and requires explicit recovery');
    recoverExpiredActivityLease(
      cwd,
      'ITER-0001',
      'The activity process crashed and its PID no longer exists.',
      AFTER_EXPIRY,
    );
    expect(existsSync(activityLeasePath(cwd, 'ITER-0001'))).toBe(false);
    expect(readFileSync(`${boardRoot(cwd)}/events.jsonl`, 'utf8')).toContain(
      'The activity process crashed',
    );

    const replacement = acquireActivityLease(
      cwd,
      story.worktree.path,
      state,
      'activity',
      leaseOptions(3, AFTER_EXPIRY),
    );
    releaseActivityLease(replacement);
  });

  it('fails closed on stale State and a different worktree', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const first = provision(cwd, 'CAND-0001');
    const second = provision(cwd, 'CAND-0002');
    const stale = readState(first.worktree.path);
    writeState(first.worktree.path, {
      ...stale,
      loop: 'understand',
      understand_stage: 'tqa',
    });

    expect(() =>
      acquireActivityLease(
        cwd,
        first.worktree.path,
        stale,
        'activity',
        leaseOptions(1),
      ),
    ).toThrow('State changed before lease acquisition');
    expect(() =>
      acquireActivityLease(
        cwd,
        second.worktree.path,
        readState(first.worktree.path),
        'activity',
        leaseOptions(2),
      ),
    ).toThrow('Board worktree mismatch');
  });
});
