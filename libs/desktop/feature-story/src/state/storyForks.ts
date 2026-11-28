import type {
  FlowScenarioTrace,
  FlowStepTrace,
} from '@evidence-poc/evidence-model-core';

export const stepRef = (step: FlowStepTrace) =>
  `${step.storyId}#${step.stepId}`;
export interface StoryFork {
  flow: FlowScenarioTrace;
  step: FlowStepTrace;
}

/** Attach each direct child to its parent's authored step, even for repeated work objects. */
export function storyForks(
  flows: readonly FlowScenarioTrace[],
  current: FlowScenarioTrace,
) {
  const forks = new Map<number, StoryFork[]>();
  const anchors = new Map(
    current.steps
      .filter((s) => !s.inherited)
      .map((s) => [s.stepId, s.sequence]),
  );
  for (const flow of flows) {
    if (flow.forkedFrom?.storyId !== current.flowId) continue;
    const sequence = anchors.get(flow.forkedFrom.stepId);
    const step = flow.steps.find((s) => !s.inherited);
    if (sequence !== undefined && step)
      forks.set(sequence, [...(forks.get(sequence) ?? []), { flow, step }]);
  }
  return forks;
}
