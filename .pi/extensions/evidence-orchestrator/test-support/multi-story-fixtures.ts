import { execFileSync } from 'node:child_process';
import { provisionWorkItem } from '../capabilities/work-item-worktree/provisioner';
import { removeStoryWorktree } from '../capabilities/work-item-worktree/manager';
import { mutateBoard } from '../iteration/board-repository';
import { DEFAULT_STATE } from '../iteration/default-state';
import type { WorkflowState } from '../iteration/state';
import { readState, writeState } from '../iteration/state-repository';
import { decideTasking } from '../loops/tasking/desk-check';
import type { ProvisionedWorkItem } from '../capabilities/work-item-worktree/provisioner';
import { prepareDeskCheckFixture } from './desk-check-fixture';
import { initializeGitRepository, workspace, write } from './support';

export interface MultiStoryFixture {
  primaryRoot: string;
  first: ProvisionedWorkItem;
  second: ProvisionedWorkItem;
}

export function tqaState(
  iterationId: string,
  storyId = 'US-001',
): WorkflowState {
  return {
    ...DEFAULT_STATE,
    iteration_id: iterationId,
    loop: 'understand',
    understand_stage: 'tqa',
    active_clarification_story: {
      story_id: storyId,
      selected_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

function provision(
  primaryRoot: string,
  candidateId: string,
  state: (iterationId: string) => WorkflowState = (iterationId) => ({
    ...DEFAULT_STATE,
    iteration_id: iterationId,
  }),
): ProvisionedWorkItem {
  return provisionWorkItem(
    primaryRoot,
    candidateId,
    ({ iterationId, worktreeRoot }) => {
      writeState(worktreeRoot, state(iterationId));
    },
  );
}

function prepareApprovedPair(story: ProvisionedWorkItem): void {
  prepareDeskCheckFixture(story.worktree.path, {
    initializeGit: false,
    iterationId: story.item.iteration_id,
  });
  decideTasking(
    story.worktree.path,
    'approve',
    'The isolated Story plan is ready for Pairing.',
    '2026-01-01T00:05:00.000Z',
  );
}

export function prepareMultiStoryFixture(): MultiStoryFixture {
  const primaryRoot = workspace();
  initializeGitRepository(primaryRoot);
  const first = provision(primaryRoot, 'CAND-0001');
  prepareApprovedPair(first);
  const second = provision(primaryRoot, 'CAND-0002', tqaState);
  return {
    primaryRoot,
    first,
    second,
  };
}

export function prepareTaskingReview(
  story: ProvisionedWorkItem,
  priorState: WorkflowState,
): WorkflowState {
  prepareDeskCheckFixture(story.worktree.path, {
    initializeGit: false,
    iterationId: story.item.iteration_id,
  });
  const planned = readState(story.worktree.path);
  return writeState(story.worktree.path, {
    ...planned,
    clarification_history: priorState.clarification_history,
  });
}

export function provisionThirdStory(
  fixture: MultiStoryFixture,
): ProvisionedWorkItem {
  const third = provision(fixture.primaryRoot, 'CAND-0003');
  prepareApprovedPair(third);
  return third;
}

export function seedStoryArtifact(
  story: ProvisionedWorkItem,
  relativePath: string,
  content: string,
): string {
  const path = `artifacts/iterations/${story.item.iteration_id}/${relativePath}`;
  write(story.worktree.path, path, content);
  return path;
}

export function commitStoryWorktree(
  story: ProvisionedWorkItem,
  message: string,
): void {
  execFileSync('git', ['add', '-A'], { cwd: story.worktree.path });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Evidence Orchestrator Test',
      '-c',
      'user.email=workflow@example.test',
      'commit',
      '--quiet',
      '-m',
      message,
    ],
    { cwd: story.worktree.path },
  );
}

export function archiveTerminalStory(
  primaryRoot: string,
  story: ProvisionedWorkItem,
  now = '2026-01-01T01:00:00.000Z',
): void {
  removeStoryWorktree(primaryRoot, story.worktree.path);
  mutateBoard(primaryRoot, (draft) => {
    const item = draft.items.find(
      ({ iteration_id }) => iteration_id === story.item.iteration_id,
    );
    if (!item || item.lifecycle !== 'terminal') {
      throw new Error(`Expected terminal item ${story.item.iteration_id}.`);
    }
    item.lifecycle = 'archived';
    item.archived_at = now;
    item.updated_at = now;
  });
}
