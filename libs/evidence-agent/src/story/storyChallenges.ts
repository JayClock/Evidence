import {
  createWhatIfScenario,
  whatIfDecisionRules,
  type DomainGraph,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import { WHAT_IF_CHALLENGE_SUGGESTION_PROMPT } from './prompts.js';
import { WhatIfChallengesSchema, responseObject } from './responseSchemas.js';
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
  const rules = whatIfDecisionRules(graph, current.entityId);
  if (!rules.length) return;
  try {
    const scenario = createWhatIfScenario(graph, steps, current);
    const baseline = scenario.apply();
    return {
      scenario,
      rules,
      facts: {
        asOf: current.asOf,
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
  });
  signal.throwIfAborted();
  const { challenges } = WhatIfChallengesSchema.parse(responseObject(response));
  const verified: WhatIfChallenge[] = [];
  for (const card of challenges) {
    if (
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
      const target = candidates.find((rule) => {
        try {
          return trial.decide(rule).result === (rule.kind === 'breach');
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
