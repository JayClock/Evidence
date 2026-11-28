import type { DomainStoryAST, StoryStepAST } from './story.js';

export interface OwnedStoryStep {
  storyId: string;
  step: StoryStepAST;
}

/** A bare step ID belongs to the story which authored the reference. */
export const canonicalStepRef = (storyId: string, stepRef: string): string =>
  stepRef.includes('#') ? stepRef : `${storyId}#${stepRef}`;

/** Walk the lineage iteratively. Each anchor includes its parent's local step. */
export function storyLineageSteps(
  stories: ReadonlyMap<string, DomainStoryAST>,
  storyId: string,
): OwnedStoryStep[] {
  const seen = new Set<string>();
  const segments: OwnedStoryStep[][] = [];
  let id = storyId;
  let through: string | undefined;
  for (;;) {
    if (seen.has(id)) throw new Error(`cyclic story lineage at '${id}'`);
    seen.add(id);
    const story = stories.get(id);
    if (!story) throw new Error(`unknown story '${id}'`);
    const steps = [...story.steps].sort((a, b) => a.sequence - b.sequence);
    const end =
      through === undefined
        ? steps.length
        : steps.findIndex((step) => step.id === through) + 1;
    if (through !== undefined && !end)
      throw new Error(`unknown fork anchor '${id}#${through}'`);
    segments.push(steps.slice(0, end).map((step) => ({ storyId: id, step })));
    if (!story.forkedFrom) break;
    id = story.forkedFrom.storyId;
    through = story.forkedFrom.stepId;
  }
  return segments.reverse().flat();
}
