import {
  createWhatIfScenario,
  isWhatIfDeadline,
  whatIfRulesForStep,
  type DomainGraph,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import { WHAT_IF_CHALLENGE_SUGGESTION_PROMPT } from './prompts.js';
import {
  WhatIfChallengesSchema,
  responseObject,
  whatIfJargon,
} from './responseSchemas.js';
import type { StoryAgent, WhatIfChallenge } from './types.js';

export interface StoryChallengeSource {
  graph: DomainGraph;
  steps: readonly FlowStepTrace[];
  current: FlowStepTrace;
}

export function storyChallengeContext({
  graph,
  steps,
  current,
}: StoryChallengeSource) {
  const rules = whatIfRulesForStep(graph, current.entityId);
  if (!rules.length) return;
  try {
    const scenario = createWhatIfScenario(graph, steps, current);
    const baseline = scenario.apply();
    const entities = new Set([
      current.entityId,
      ...scenario.upstream.map((step) => step.entityId),
    ]);
    const deadlines = [current, ...scenario.upstream].flatMap((step) =>
      graph
        .attributesOf(step.entityId)
        .filter(isWhatIfDeadline)
        .flatMap((field) => {
          const value = baseline.valuesOf(step)[field.name];
          return typeof value === 'string'
            ? [{ entityId: step.entityId, time: Date.parse(value) }]
            : [];
        }),
    );
    return {
      scenario,
      baseline,
      deadlines,
      rules,
      isRequest: current.entityKind === 'fulfillment_request',
      facts: {
        asOf: current.asOf,
        expectedConfirmations: graph
          .fulfillmentPair(current.entityId)
          ?.confirmations.map(({ label }) => label),
        inputAttributes: scenario.inputAttributes,
        currentValues: baseline.valuesOf(current),
        commitments: scenario.upstream.map((step) => ({
          document: step.entityLabel,
          entityId: step.entityId,
          asOf: step.asOf,
          description: step.description,
          attributes: graph.attributesOf(step.entityId),
          values: baseline.valuesOf(step),
        })),
        derivations: graph
          .rules()
          .filter(
            (rule) =>
              rule.kind === 'derivation' &&
              rule.target &&
              entities.has(rule.target.entityRef),
          )
          .map(({ id, expression, target, bindings }) => ({
            id,
            expression,
            target,
            bindings,
          })),
        decisionRules: rules.map(
          ({ id, label, kind, description, bindings, expression }) => ({
            id,
            label,
            kind,
            description,
            bindings,
            expression,
          }),
        ),
      },
    };
  } catch {
    // Incomplete causal inputs must not interrupt narration.
    return undefined;
  }
}

export async function suggestStoryChallenges(
  agent: StoryAgent,
  userPrompt: string,
  context: NonNullable<ReturnType<typeof storyChallengeContext>>,
  signal: AbortSignal,
): Promise<readonly WhatIfChallenge[]> {
  const response = await agent.generate({
    systemPrompt: WHAT_IF_CHALLENGE_SUGGESTION_PROMPT,
    userPrompt,
    signal,
    purpose: 'challenges',
  });
  signal.throwIfAborted();
  const { challenges } = WhatIfChallengesSchema.parse(responseObject(response));
  const verified: WhatIfChallenge[] = [];
  for (const card of challenges) {
    if (
      whatIfJargon.test(card.label) ||
      whatIfJargon.test(card.question) ||
      verified.some(
        ({ id, question }) => id === card.id || question === card.question,
      )
    )
      continue;
    const candidates =
      card.targetedRuleId === undefined
        ? context.rules
        : context.rules.filter((rule) => rule.id === card.targetedRuleId);
    if (!candidates.length) continue;
    if (!card.hypothesisDraft) {
      verified.push(card);
      continue;
    }
    try {
      const trial = context.scenario.apply(card.hypothesisDraft);
      if (
        context.isRequest &&
        card.category === 'overdue' &&
        !trial.requestDeadline()?.overdue
      )
        continue;
      // An open request may already be incomplete. Advancing only the clock/occurrence
      // can still test overdue fulfillment, but lowering a target cannot establish a shortfall.
      const laterOccurrence =
        card.category === 'overdue' &&
        Date.parse(trial.asOf) > Date.parse(context.baseline.asOf) &&
        Object.keys(card.hypothesisDraft.values ?? {}).every((name) =>
          context.scenario.inputAttributes.some(
            (field) => field.name === name && field.timeRole === 'occurrence',
          ),
        );
      const target = candidates.find((rule) => {
        try {
          const adverse = rule.kind === 'breach';
          if (trial.decide(rule).result !== adverse) return false;
          if (context.baseline.decide(rule).result !== adverse) return true;
          if (!laterOccurrence) return false;
          return (
            context.isRequest ||
            context.deadlines.some(
              ({ entityId, time }) =>
                Date.parse(context.baseline.asOf) <= time &&
                time < Date.parse(trial.asOf) &&
                Object.values(rule.bindings).some(
                  (binding) => 'ref' in binding && binding.ref === entityId,
                ),
            )
          );
        } catch {
          return false;
        }
      });
      if (target) verified.push({ ...card, targetedRuleId: target.id });
    } catch {
      /* Undeclared, derived or mistyped inputs aren't playable challenges. */
    }
  }
  return verified;
}
