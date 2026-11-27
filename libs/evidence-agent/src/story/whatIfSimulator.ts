import {
  createDomainGraph,
  createWhatIfScenario,
  isWhatIfFulfillmentEvidence,
  whatIfDecisionRules,
} from '@evidence-poc/evidence-model-core';
import { compactCanonicalJson } from '@evidence-poc/evidence-schema';

import {
  WHAT_IF_EXPLANATION_PROMPT,
  WHAT_IF_EXTRACTION_PROMPT,
  WHAT_IF_SPECULATIVE_PROMPT,
} from './prompts.js';
import {
  HypothesisSchema,
  ImpactExplanationSchema,
  responseObject,
} from './responseSchemas.js';
import { createStoryAgent } from './storyAgent.js';
import type {
  RuleBasedWhatIfResult,
  StoryAgent,
  WhatIfInput,
  WhatIfResult,
} from './types.js';

export interface WhatIfSimulatorOptions {
  readonly agent?: StoryAgent;
}

/**
 * A transient model-rule sandbox, not an execution or backend-acceptance claim.
 * Native CEL alone decides; opt-in AI exploration has no rule outcomes.
 */
export function simulateWhatIf(
  input: WhatIfInput & { readonly allowSpeculative?: false },
  options?: WhatIfSimulatorOptions,
): Promise<RuleBasedWhatIfResult>;
export function simulateWhatIf(
  input: WhatIfInput,
  options?: WhatIfSimulatorOptions,
): Promise<WhatIfResult>;
export async function simulateWhatIf(
  input: WhatIfInput,
  options: WhatIfSimulatorOptions = {},
): Promise<WhatIfResult> {
  // Snapshot before the first await: editor changes must not mix model revisions.
  const {
    model,
    flow,
    currentStepSequence,
    hypothesisQuestion,
    ruleId,
    allowSpeculative,
    hypothesis: suppliedHypothesis,
  } = structuredClone(input);
  const selected = flow.steps.filter(
    (step) => step.sequence === currentStepSequence,
  );
  const current = selected[0];
  if (selected.length !== 1 || current === undefined) {
    throw new Error(
      `What-If requires one current step at sequence ${currentStepSequence}.`,
    );
  }
  const graph = createDomainGraph(model);
  const entity = graph.getEntity(current.entityId);
  if (entity === undefined)
    throw new Error(`Unknown current entity '${current.entityId}'.`);
  if (!isWhatIfFulfillmentEvidence(entity))
    throw new Error('What-If is only available for fulfillment steps.');

  const candidates = whatIfDecisionRules(graph, entity.id);
  const rules =
    ruleId === undefined
      ? candidates
      : candidates.filter((rule) => rule.id === ruleId);
  if (rules.length === 0 && (allowSpeculative !== true || ruleId !== undefined))
    throw new Error(
      'No relevant completion/breach rule is modeled for this step.',
    );

  const scenario = createWhatIfScenario(graph, flow.steps, current);
  const upstreamFacts = () =>
    scenario.upstream.map(({ entityId, entityLabel, asOf, values }) => ({
      entityId,
      entityLabel,
      asOf,
      values,
    }));

  const agent = options.agent ?? createStoryAgent();
  const hypothesis =
    rules.length === 0 && suppliedHypothesis === undefined
      ? undefined
      : HypothesisSchema.parse(
          responseObject(
            suppliedHypothesis ??
              (await agent.generate({
                systemPrompt: WHAT_IF_EXTRACTION_PROMPT,
                userPrompt: compactCanonicalJson({
                  hypothesisQuestion,
                  step: current,
                  inputAttributes: scenario.inputAttributes,
                  upstream: upstreamFacts(),
                }),
              })),
          ),
        );
  const trial = scenario.apply(hypothesis);

  if (hypothesis === undefined || rules.length === 0) {
    const explanation = ImpactExplanationSchema.parse(
      responseObject(
        await agent.generate({
          systemPrompt: WHAT_IF_SPECULATIVE_PROMPT,
          userPrompt: compactCanonicalJson({
            hypothesisQuestion,
            ...(hypothesis === undefined ? {} : { hypothesis }),
            current: {
              entityId: current.entityId,
              entityLabel: current.entityLabel,
              asOf: current.asOf,
              values: current.values,
            },
            upstream: upstreamFacts(),
          }),
        }),
      ),
    );
    return {
      isSpeculative: true,
      ...(hypothesis === undefined ? {} : { hypothesis }),
      ruleOutcomes: [],
      businessImpactExplanation: explanation.businessImpactExplanation,
    };
  }

  const ruleOutcomes = rules.map(trial.decide);
  const explanation = ImpactExplanationSchema.parse(
    responseObject(
      await agent.generate({
        systemPrompt: WHAT_IF_EXPLANATION_PROMPT,
        userPrompt: compactCanonicalJson({
          hypothesisQuestion,
          hypothesis,
          asOf: trial.asOf,
          currentValues: trial.valuesOf(current),
          ruleOutcomes: rules.map((rule, index) => ({
            ...ruleOutcomes[index],
            kind: rule.kind,
            label: rule.label,
            description: rule.description,
            notes: rule.notes,
          })),
        }),
      }),
    ),
  );
  return {
    isSpeculative: false,
    hypothesis,
    ruleOutcome: ruleOutcomes[0]!,
    ruleOutcomes,
    businessImpactExplanation: explanation.businessImpactExplanation,
  };
}
