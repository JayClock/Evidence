import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../test-support/support';
import {
  appendBoardEvent,
  boardEventsPath,
  readBoardEvents,
} from './board-events';

afterEach(cleanupWorkspaces);

describe('Board events', () => {
  it('appends strict policy-bound coordination evidence', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);

    appendBoardEvent(
      cwd,
      {
        type: 'admission',
        iteration_id: 'ITER-0001',
        recorded_at: '2026-01-01T00:00:00.000Z',
        from_lane: 'ready',
        to_lane: 'delivery',
        outcome: 'admitted',
        policy_sha256: `sha256:${'a'.repeat(64)}`,
      },
      'EVT-00000000-0000-4000-8000-000000000001',
    );

    expect(readBoardEvents(cwd)).toEqual([
      expect.objectContaining({
        type: 'admission',
        iteration_id: 'ITER-0001',
        from_lane: 'ready',
        to_lane: 'delivery',
      }),
    ]);
  });

  it('fails closed on a truncated event log', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    mkdirSync(dirname(boardEventsPath(cwd)), { recursive: true });
    appendFileSync(boardEventsPath(cwd), '{');

    expect(() => readBoardEvents(cwd)).toThrow('event log is truncated');
  });
});
