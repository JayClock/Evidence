import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { findFiles } from '../evidence/artifact-index';
import { artifactPath } from '../workflow/iteration-paths';
import { readState } from '../workflow/state-store';
import type { WorkflowState } from '../workflow/types';

const ACCEPTANCE_EXAMPLE_PATTERN = /^(US-\d{3,})-SC-\d{3,}\.md$/i;

/**
 * Return the complete Specify batch. Modern records are human-confirmed;
 * legacy finalized `clarified` records remain eligible for compatibility.
 */
export function confirmedSpecificationStoryIds(state: WorkflowState): string[] {
  return (state.clarification_story_outcomes ?? [])
    .filter(({ outcome }) => outcome === 'clarified')
    .map(({ story_id }) => story_id.toUpperCase())
    .sort();
}

/** Require at least one non-empty acceptance example for every Story in scope. */
export function validateConfirmedStoriesSpecified(
  cwd: string,
  state = readState(cwd),
): void {
  const confirmedStoryIds = confirmedSpecificationStoryIds(state);
  if (confirmedStoryIds.length === 0) {
    throw new Error(
      'Cannot complete specify: no confirmed clarified stories are available for specification.',
    );
  }

  const examplesRoot = artifactPath(
    cwd,
    state,
    'artifacts/01-requirements/examples',
  );
  const coveredStoryIds = new Set(
    findFiles(examplesRoot, (path) => {
      return (
        ACCEPTANCE_EXAMPLE_PATTERN.test(basename(path)) &&
        statSync(path).size > 0
      );
    })
      .map((path) => ACCEPTANCE_EXAMPLE_PATTERN.exec(basename(path))?.[1])
      .filter((storyId): storyId is string => Boolean(storyId))
      .map((storyId) => storyId.toUpperCase()),
  );
  const missingStoryIds = confirmedStoryIds.filter(
    (storyId) => !coveredStoryIds.has(storyId),
  );
  if (missingStoryIds.length > 0) {
    throw new Error(
      `Cannot complete specify: missing acceptance examples for confirmed stories: ${missingStoryIds.join(', ')}.`,
    );
  }
}
