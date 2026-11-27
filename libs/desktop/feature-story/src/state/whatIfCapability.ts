import {
  buildDeterministicFallbackChallenges,
  isWhatIfFulfillmentEvidence,
  whatIfDecisionRules,
  type DomainGraph,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  isFulfillmentRequest,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
import type {
  StoryScene,
  WhatIfChallenge,
  WhatIfResult,
} from '@evidence-poc/evidence-agent/browser';

/** The projection lists direct prerequisites in causal order. */
export function blockedStoryScenes(
  scenes: readonly StoryScene[],
  breachedStep?: number,
) {
  const blocked = new Map<number, StoryScene>();
  if (breachedStep === undefined) return blocked;
  for (const scene of scenes) {
    if (
      scene.stepIndex > breachedStep &&
      scene.prerequisites.some(
        ({ previousStepIndex }) =>
          previousStepIndex === breachedStep || blocked.has(previousStepIndex),
      )
    ) {
      blocked.set(scene.stepIndex, scene);
    }
  }
  return blocked;
}

/** A proof can support a request directly or through a confirmation. */
export function requestsForProof(
  graph: DomainGraph,
  scenes: readonly StoryScene[],
  proof: StoryScene,
) {
  const requests: { id: string; label: string; stepIndex: number }[] = [];
  const ancestors = new Set(
    proof.prerequisites.map(({ previousStepIndex }) => previousStepIndex),
  );
  for (let i = scenes.length - 1; i >= 0; i--) {
    const { stepIndex, activity, prerequisites } = scenes[i];
    if (!ancestors.has(stepIndex) || activity.rejectedExample) continue;
    for (const parent of prerequisites) ancestors.add(parent.previousStepIndex);
    const pair = graph.fulfillmentPair(activity.workObject.entityId);
    if (
      pair?.proofs.some(({ id }) => id === proof.activity.workObject.entityId)
    )
      requests.push({
        id: pair.request.id,
        label: pair.request.label,
        stepIndex,
      });
  }
  return requests;
}

/** Only the current scene's causal requests can own a modeled outcome. */
export function promotableSceneRequests(
  graph: DomainGraph,
  requests: readonly Pick<EntityAST, 'id' | 'label'>[],
  result: WhatIfResult,
) {
  if (!requests.length || result.isSpeculative) return [];
  const eligible = new Set<string>();
  for (const outcome of result.ruleOutcomes) {
    const rule = graph.getRule(outcome.ruleId);
    if (!outcome.result || rule?.kind !== 'breach') continue;
    const bound = Object.values(rule.bindings).flatMap((binding) =>
      'ref' in binding && isFulfillmentRequest(graph.getEntity(binding.ref))
        ? [binding.ref]
        : [],
    );
    // A confirmation-only decision applies to the requests this confirmation covers.
    if (!bound.length) return requests;
    for (const id of bound) eligible.add(id);
  }
  return requests.filter(({ id }) => eligible.has(id));
}

type WhatIfTarget = Pick<FlowStepTrace, 'sequence' | 'entityLabel'> & {
  readonly hasRules: boolean;
};

export type WhatIfCapability =
  | { readonly status: 'non_fulfillment_stage'; readonly next?: WhatIfTarget }
  | { readonly status: 'missing_rules' }
  | {
      readonly status: 'eligible';
      readonly challenges: readonly WhatIfChallenge[];
    };

export function evaluateWhatIfCapability(
  graph: DomainGraph,
  steps: readonly FlowStepTrace[],
  step: FlowStepTrace,
): WhatIfCapability {
  if (!isWhatIfFulfillmentEvidence(graph.getEntity(step.entityId))) {
    let firstFulfillment: WhatIfTarget | undefined;
    for (const candidate of steps) {
      if (
        candidate.sequence <= step.sequence ||
        !isWhatIfFulfillmentEvidence(graph.getEntity(candidate.entityId))
      )
        continue;
      const next = {
        sequence: candidate.sequence,
        entityLabel: candidate.entityLabel,
        hasRules: whatIfDecisionRules(graph, candidate.entityId).length > 0,
      };
      if (next.hasRules) return { status: 'non_fulfillment_stage', next };
      firstFulfillment ??= next;
    }
    return { status: 'non_fulfillment_stage', next: firstFulfillment };
  }
  const rules = whatIfDecisionRules(graph, step.entityId);
  if (rules.length === 0) {
    return { status: 'missing_rules' };
  }
  return {
    status: 'eligible',
    challenges: buildDeterministicFallbackChallenges(graph, steps, step, rules),
  };
}
