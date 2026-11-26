import {
  isTimestampText,
  isWhatIfFulfillmentEvidence,
  whatIfDecisionRules,
  type DomainGraph,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import { isFulfillmentRequest } from '@evidence-poc/evidence-schema';
import type {
  StoryScene,
  WhatIfResult,
} from '@evidence-poc/evidence-agent/browser';

/** Only the current scene's causal requests can own a modeled outcome. */
export function promotableSceneRequests(
  graph: DomainGraph,
  scene: StoryScene,
  result: WhatIfResult,
) {
  const requests = (scene.activity.fulfillment?.requests ?? [])
    .map(({ requestId }) => graph.getEntity(requestId))
    .filter(isFulfillmentRequest);
  if (!requests.length || result.isSpeculative) return requests;
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
  | { readonly status: 'missing_rules'; readonly entityId: string }
  | { readonly status: 'eligible'; readonly suggestedQuestion?: string };

function suggestQuestion(graph: DomainGraph, step: FlowStepTrace) {
  for (const attribute of graph.attributesOf(step.entityId)) {
    const { name, label, timeRole, derivedByRuleRef } = attribute;
    if (
      derivedByRuleRef !== undefined ||
      graph
        .rules()
        .some(
          ({ kind, target }) =>
            kind === 'derivation' &&
            target?.entityRef === step.entityId &&
            target.attribute === name,
        )
    )
      continue;
    const value = step.values[name];
    if (
      /amount|price/i.test(name) &&
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 2
    ) {
      return `如果把「${label}」从 ${value} 改为 ${Math.floor(value / 2)}，判定结果会怎样？`;
    }
    if (
      (timeRole === 'occurrence' || timeRole === 'deadline') &&
      isTimestampText(value)
    ) {
      const later = new Date(Date.parse(value) + 60 * 60_000);
      if (Number.isFinite(later.getTime())) {
        return `如果「${label}」比该示例晚一小时，改为 ${later.toISOString()}，判定结果会怎样？`;
      }
    }
  }
  return undefined;
}

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
  if (whatIfDecisionRules(graph, step.entityId).length === 0) {
    return { status: 'missing_rules', entityId: step.entityId };
  }
  return {
    status: 'eligible',
    suggestedQuestion: suggestQuestion(graph, step),
  };
}
