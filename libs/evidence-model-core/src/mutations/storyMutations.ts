import {
  assertValidDomainModel,
  DomainStoryASTSchema,
  type DomainModelDocument,
  type DomainStoryAST,
  type StoryStepAST,
  type StoryForkAnchor,
} from '@evidence-poc/evidence-schema';

export function requireStory(
  model: DomainModelDocument,
  id: string,
): DomainStoryAST {
  const story = model.stories.find((item) => item.id === id);
  if (!story) throw new Error(`Unknown story '${id}'`);
  return story;
}

/** Validate the prospective document before changing the transaction draft. */
function publish(draft: DomainModelDocument, stories: DomainStoryAST[]) {
  assertValidDomainModel({ ...draft, stories });
  draft.stories = stories;
}

export function createStory(
  draft: DomainModelDocument,
  input: DomainStoryAST,
): void {
  publish(draft, [...draft.stories, DomainStoryASTSchema.parse(input)]);
}

export function replaceStory(
  draft: DomainModelDocument,
  input: DomainStoryAST,
): void {
  requireStory(draft, input.id);
  const next = DomainStoryASTSchema.parse(input);
  publish(
    draft,
    draft.stories.map((story) => (story.id === next.id ? next : story)),
  );
}

type StoryMeta = Pick<
  DomainStoryAST,
  'title' | 'kind' | 'description' | 'tags' | 'notes'
>;
export function updateStoryMeta(
  draft: DomainModelDocument,
  id: string,
  meta: Partial<StoryMeta>,
): void {
  replaceStory(draft, { ...requireStory(draft, id), ...meta });
}
export function upsertStoryStep(
  draft: DomainModelDocument,
  storyId: string,
  step: StoryStepAST,
): void {
  const story = requireStory(draft, storyId);
  const steps = [
    ...story.steps.filter((item) => item.id !== step.id),
    step,
  ].sort((a, b) => a.sequence - b.sequence);
  replaceStory(draft, { ...story, steps });
}
export function reorderStorySteps(
  draft: DomainModelDocument,
  storyId: string,
  ids: readonly string[],
): void {
  const story = requireStory(draft, storyId);
  const byId = new Map(story.steps.map((step) => [step.id, step]));
  if (
    ids.length !== byId.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !byId.has(id))
  )
    throw new Error('Step order must include each local step exactly once');
  replaceStory(draft, {
    ...story,
    steps: ids.map((id, i) => ({ ...byId.get(id)!, sequence: i + 1 })),
  });
}
export function removeStoryStep(
  draft: DomainModelDocument,
  storyId: string,
  stepId: string,
): void {
  const story = requireStory(draft, storyId);
  if (!story.steps.some((step) => step.id === stepId))
    throw new Error(`Unknown step '${stepId}'`);
  replaceStory(draft, {
    ...story,
    steps: story.steps.filter((step) => step.id !== stepId),
  });
}
export function forkStory(
  draft: DomainModelDocument,
  input: Omit<DomainStoryAST, 'type' | 'kind' | 'forkedFrom'> & {
    forkedFrom: StoryForkAnchor;
  },
): void {
  createStory(draft, { ...input, type: 'story', kind: 'breach_branch' });
}
export function deleteStory(draft: DomainModelDocument, storyId: string): void {
  requireStory(draft, storyId);
  publish(
    draft,
    draft.stories.filter((story) => story.id !== storyId),
  );
}
