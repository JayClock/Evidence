import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { zeroActivityUsage } from '../capabilities/activity-observability/activity-usage';
import {
  finishActivityTrace,
  startActivityTrace,
} from '../capabilities/activity-observability/trace';
import {
  pullPendingLane,
  reconcileBoardItem,
  requestDeliveryAdmission,
} from '../capabilities/flow-control/admission';
import { readBoard } from '../iteration/board-repository';
import { DEFAULT_STATE } from '../iteration/default-state';
import { readState, writeState } from '../iteration/state-repository';
import {
  answerClarification,
  askClarification,
} from '../loops/understand/tqa/conversation';
import { activitySessionId } from '../adapters/pi/activity/execution';
import { requireWorkItemTarget } from '../adapters/pi/work-item-target';
import {
  archiveTerminalStory,
  commitStoryWorktree,
  prepareMultiStoryFixture,
  prepareTaskingReview,
  provisionThirdStory,
  seedStoryArtifact,
  tqaState,
} from './multi-story-fixtures';
import { cleanupWorkspaces, write } from './support';

afterEach(cleanupWorkspaces);

function recordTrace(
  worktreeRoot: string,
  iterationId: string,
  activity: 'pair' | 'understand',
): void {
  const span = startActivityTrace(worktreeRoot, {
    iterationId,
    activity,
    checkpoint: activity === 'pair' ? 'plan_confirmed' : 'tqa',
    storyId: 'US-001',
    agent: activity === 'pair' ? 'pair-controller' : 'requirements-analyst',
    requestedModel: 'deterministic/test',
    thinking: 'off',
    sessionMode: activity === 'pair' ? 'ephemeral' : 'persistent',
    task: `Record ${iterationId} ${activity}.`,
    toolNames: [],
    startedAt: '2026-01-01T00:00:00.000Z',
  });
  finishActivityTrace(span, {
    status: 'completed',
    actualModel: 'deterministic/test',
    completedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1_000,
    exitCode: 0,
    stopReason: 'stop',
    usage: zeroActivityUsage(),
    toolCallCounts: {},
  });
}

function gitStatus(cwd: string): string {
  return execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd, encoding: 'utf8' },
  );
}

describe('interleaved multi-Story delivery', () => {
  it('isolates three Stories while WIP queues and explicitly pulls Pair work', () => {
    const fixture = prepareMultiStoryFixture();
    const { primaryRoot, first, second } = fixture;
    const firstId = first.item.iteration_id;
    const secondId = second.item.iteration_id;

    reconcileBoardItem(primaryRoot, firstId, readState(first.worktree.path));
    expect(
      requestDeliveryAdmission(
        primaryRoot,
        firstId,
        readState(first.worktree.path),
      ),
    ).toMatchObject({ kind: 'admitted', admitted_lane: 'delivery' });

    const third = provisionThirdStory(fixture);
    const thirdId = third.item.iteration_id;
    reconcileBoardItem(primaryRoot, thirdId, readState(third.worktree.path));
    expect(
      requestDeliveryAdmission(
        primaryRoot,
        thirdId,
        readState(third.worktree.path),
      ),
    ).toMatchObject({
      kind: 'queued',
      admitted_lane: 'ready',
      pending_lane: 'delivery',
    });

    seedStoryArtifact(
      second,
      '01-requirements/stories/US-001.md',
      '# Second Story\n',
    );
    askClarification(
      second.worktree.path,
      {
        story_id: 'US-001',
        question: 'Who confirms the second Story?',
        target: 'history',
      },
      '2026-01-01T00:01:00.000Z',
    );
    reconcileBoardItem(primaryRoot, secondId, readState(second.worktree.path));
    const answered = answerClarification(
      second.worktree.path,
      'The second Story owner confirms it.',
      '2026-01-01T00:02:00.000Z',
    );
    const secondTasking = prepareTaskingReview(second, answered);
    reconcileBoardItem(primaryRoot, secondId, secondTasking);

    const firstManifest = seedStoryArtifact(
      first,
      '05-code/US-001/manifest.json',
      JSON.stringify({ iteration_id: firstId, changed: ['first.ts'] }),
    );
    const thirdManifest = seedStoryArtifact(
      third,
      '05-code/US-001/manifest.json',
      JSON.stringify({ iteration_id: thirdId, changed: ['third.ts'] }),
    );
    write(
      first.worktree.path,
      'apps/web/src/first.ts',
      'export const first=1;\n',
    );
    write(
      third.worktree.path,
      'apps/web/src/third.ts',
      'export const third=3;\n',
    );
    recordTrace(first.worktree.path, firstId, 'pair');
    recordTrace(second.worktree.path, secondId, 'understand');
    recordTrace(third.worktree.path, thirdId, 'pair');

    const firstPairState = readState(first.worktree.path);
    if (!firstPairState.pair_session) {
      throw new Error('First Story Pair session is missing.');
    }
    const firstQuality = writeState(first.worktree.path, {
      ...firstPairState,
      pair_session: {
        ...firstPairState.pair_session,
        checkpoint: 'quality_gates_passed',
      },
    });
    reconcileBoardItem(primaryRoot, firstId, firstQuality);
    expect(readBoard(primaryRoot).items[0]).toMatchObject({
      admitted_lane: 'review',
    });

    expect(
      pullPendingLane(primaryRoot, thirdId, readState(third.worktree.path)),
    ).toMatchObject({ admitted_lane: 'delivery' });
    expect(readBoard(primaryRoot).items[2]).not.toHaveProperty('pending_lane');

    const secondBackToTqa = writeState(second.worktree.path, {
      ...secondTasking,
      loop: 'understand',
      understand_stage: 'tqa',
      tasking_stage: undefined,
    });
    reconcileBoardItem(primaryRoot, secondId, secondBackToTqa);
    expect(readBoard(primaryRoot).items[1].admitted_lane).toBe('discovery');
    const secondReviewable = writeState(second.worktree.path, {
      ...secondBackToTqa,
      loop: 'tasking',
      tasking_stage: 'desk_check',
    });
    reconcileBoardItem(primaryRoot, secondId, secondReviewable);
    expect(readBoard(primaryRoot).items[1]).toMatchObject({
      admitted_lane: 'planning',
    });

    expect(
      new Set(
        readBoard(primaryRoot).items.map(({ iteration_id }) => iteration_id),
      ).size,
    ).toBe(3);
    expect(
      new Set(
        readBoard(primaryRoot).items.map(({ candidate_id }) => candidate_id),
      ).size,
    ).toBe(3);
    expect(readState(first.worktree.path).iteration_id).toBe(firstId);
    expect(readState(second.worktree.path)).toMatchObject({
      iteration_id: secondId,
      loop: 'tasking',
      tasking_stage: 'desk_check',
      clarification_history: [{ question_id: 'Q-001' }],
    });
    expect(readState(third.worktree.path)).toMatchObject({
      iteration_id: thirdId,
      loop: 'pair',
      pair_session: { checkpoint: 'plan_confirmed' },
    });

    expect(existsSync(`${first.worktree.path}/${firstManifest}`)).toBe(true);
    expect(existsSync(`${first.worktree.path}/${thirdManifest}`)).toBe(false);
    expect(existsSync(`${third.worktree.path}/${thirdManifest}`)).toBe(true);
    expect(existsSync(`${third.worktree.path}/${firstManifest}`)).toBe(false);
    expect(
      readFileSync(`${first.worktree.path}/${firstManifest}`, 'utf8'),
    ).toContain(firstId);
    expect(
      readFileSync(`${third.worktree.path}/${thirdManifest}`, 'utf8'),
    ).toContain(thirdId);
    expect(
      readFileSync(
        `${first.worktree.path}/artifacts/iterations/${firstId}/activity-trace.jsonl`,
        'utf8',
      ),
    ).toContain(firstId);
    expect(
      readFileSync(
        `${second.worktree.path}/artifacts/iterations/${secondId}/activity-trace.jsonl`,
        'utf8',
      ),
    ).not.toContain(firstId);
    expect(gitStatus(first.worktree.path)).toContain('apps/web/src/first.ts');
    expect(gitStatus(first.worktree.path)).not.toContain('third.ts');
    expect(gitStatus(third.worktree.path)).toContain('apps/web/src/third.ts');
    expect(gitStatus(third.worktree.path)).not.toContain('first.ts');

    const secondSession = activitySessionId({
      state: tqaState(secondId),
      activity: 'understand',
      agentName: 'requirements-analyst',
      task: 'Clarify the second Story.',
    });
    const thirdSession = activitySessionId({
      state: tqaState(thirdId),
      activity: 'understand',
      agentName: 'requirements-analyst',
      task: 'Clarify the third Story.',
    });
    expect(secondSession).toBe('evidence-iter-0002-us-001-tqa');
    expect(thirdSession).toBe('evidence-iter-0003-us-001-tqa');

    const firstSnapshot = JSON.stringify(readState(first.worktree.path));
    const thirdSnapshot = JSON.stringify(readState(third.worktree.path));
    writeState(second.worktree.path, {
      ...secondReviewable,
      tasking_gap: {
        kind: 'process_gap',
        reason: 'The second Story alone needs a process decision.',
        recorded_at: '2026-01-01T00:30:00.000Z',
      },
    });
    expect(JSON.stringify(readState(first.worktree.path))).toBe(firstSnapshot);
    expect(JSON.stringify(readState(third.worktree.path))).toBe(thirdSnapshot);

    commitStoryWorktree(third, 'test: preserve third Story evidence');
    writeState(third.worktree.path, {
      ...DEFAULT_STATE,
      iteration_id: thirdId,
      loop: 'complete',
    });
    reconcileBoardItem(
      primaryRoot,
      thirdId,
      readState(third.worktree.path),
      '2026-01-01T01:00:00.000Z',
    );
    archiveTerminalStory(primaryRoot, third);
    expect(() => requireWorkItemTarget(primaryRoot, thirdId)).toThrow(
      'archived',
    );
    expect(
      execFileSync(
        'git',
        ['show-ref', '--verify', `refs/heads/${third.worktree.branchName}`],
        { cwd: primaryRoot, encoding: 'utf8' },
      ),
    ).toContain(third.worktree.branchName);
  }, 15_000);
});
