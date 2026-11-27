import type {
  BreachOutcomeBranch,
  DomainGraph,
  FlowScenarioTrace,
  FlowStepTrace,
} from '@evidence-poc/evidence-model-core';

export const stepRef = (step: FlowStepTrace) =>
  `${step.entityId}#${step.exampleLabel}`;

export function branchDestinations(
  flows: readonly FlowScenarioTrace[],
  entityIds: readonly string[],
  parentFlow?: string,
  parentSequence = 0,
) {
  return flows.flatMap((flow) => {
    const step = flow.steps.find(
      (candidate) =>
        entityIds.includes(candidate.entityId) &&
        (flow.flowId !== parentFlow || candidate.sequence > parentSequence),
    );
    return step ? [{ flow, step }] : [];
  });
}

export interface StoryFork {
  outcome: BreachOutcomeBranch;
  destinations: ReturnType<typeof branchDestinations>;
}

export function storyForks(
  graph: DomainGraph,
  flows: readonly FlowScenarioTrace[],
  current: FlowScenarioTrace,
) {
  const forks = new Map<number, StoryFork[]>();
  const byExample = new Map(current.steps.map((step) => [stepRef(step), step]));
  const allExamples = new Set(flows.flatMap(({ steps }) => steps.map(stepRef)));
  const requests = new Map<string, FlowStepTrace[]>();
  for (const step of current.steps) {
    if (step.entityKind !== 'fulfillment_request') continue;
    const instances = requests.get(step.entityId) ?? [];
    instances.push(step);
    requests.set(step.entityId, instances);
  }
  for (const [requestId, instances] of requests) {
    for (const outcome of graph.breachOutcomesOf(requestId)) {
      const { forkExampleRef } = outcome.edge;
      const anchor = forkExampleRef ? byExample.get(forkExampleRef) : undefined;
      if (forkExampleRef && !anchor && allExamples.has(forkExampleRef))
        continue;
      // Without a surviving example, the agreed outcome still belongs to its request.
      const parents = anchor ? [anchor] : instances;
      const entityIds =
        outcome.kind === 'compensation_pair'
          ? [
              outcome.compensation.request.id,
              ...outcome.compensation.confirmations.map(({ id }) => id),
            ]
          : [outcome.handoff.id];
      for (const parent of parents) {
        const branches = forks.get(parent.sequence) ?? [];
        branches.push({
          outcome,
          destinations: branchDestinations(
            flows,
            entityIds,
            current.flowId,
            parent.sequence,
          ),
        });
        forks.set(parent.sequence, branches);
      }
    }
  }
  return forks;
}
