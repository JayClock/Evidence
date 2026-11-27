import {
  createDomainGraph,
  createWhatIfScenario,
  isWhatIfFulfillmentEvidence,
  whatIfDecisionRules,
} from '@evidence-poc/evidence-model-core';
import { compactCanonicalJson } from '@evidence-poc/evidence-schema';

import { projectStoryFacts } from './flowStoryProjector.js';
import {
  WHAT_IF_EXPLANATION_PROMPT,
  WHAT_IF_EXTRACTION_PROMPT,
  WHAT_IF_SPECULATIVE_PROMPT,
} from './prompts.js';
import {
  HypothesisSchema,
  ImpactExplanationSchema,
  WhatIfNarrativeText,
  responseObject,
} from './responseSchemas.js';
import { abortable, createStoryAgent } from './storyAgent.js';
import { describeWhatIfOutcome } from './storyContinuity.js';
import { businessDate } from './storyDocument.js';
import {
  buildLocalStoryExplanation,
  whatIfBusinessFacts,
  whatIfCommitment,
  whatIfStoryContext,
} from './whatIfStory.js';
import type {
  RuleBasedWhatIfResult,
  StoryAgent,
  WhatIfInput,
  WhatIfResult,
} from './types.js';

export interface WhatIfSimulatorOptions {
  readonly agent?: StoryAgent;
  readonly explanation?: 'local' | 'optional' | 'required';
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
    asOf,
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
  const localOnly = options.explanation === 'local';
  if (localOnly && !suppliedHypothesis)
    throw new Error('Local What-If requires a structured hypothesis.');
  if (
    rules.length === 0 &&
    (allowSpeculative !== true || ruleId !== undefined || localOnly)
  )
    throw new Error(
      'No relevant completion/breach rule is modeled for this step.',
    );

  const scenario = createWhatIfScenario(graph, flow.steps, current);
  const agent = options.agent ?? createStoryAgent();
  const extracted =
    rules.length === 0 && suppliedHypothesis === undefined
      ? undefined
      : HypothesisSchema.parse(
          responseObject(
            suppliedHypothesis ??
              (await agent.generate({
                systemPrompt: WHAT_IF_EXTRACTION_PROMPT,
                userPrompt: compactCanonicalJson({
                  hypothesisQuestion,
                  step: asOf === undefined ? current : { ...current, asOf },
                  inputAttributes: scenario.inputAttributes,
                  upstream: scenario.upstream.map(
                    ({ entityId, entityLabel, asOf, values }) => ({
                      entityId,
                      entityLabel,
                      asOf,
                      values,
                    }),
                  ),
                }),
              })),
          ),
        );
  const hypothesis =
    asOf !== undefined && !extracted?.asOf
      ? HypothesisSchema.parse({ ...extracted, asOf })
      : extracted;
  const trial = scenario.apply(hypothesis);
  const ruleOutcomes = rules.map((rule) => ({
    ...trial.decide(rule),
    label: rule.label,
    kind: rule.kind,
    description: rule.description,
  }));
  const scenes = new Map(
    projectStoryFacts(flow, model).scenes.map((scene) => [
      scene.stepIndex,
      scene,
    ]),
  );
  const scene = scenes.get(current.sequence)!;
  const obligations = scene.activity.fulfillment?.requests.map(
    ({ stepIndex, action, rightHolder, obligor }) => ({
      workObjectTitle: scenes.get(stepIndex)?.activity.workObject.entityLabel,
      action,
      rightHolder: rightHolder?.roleLabel,
      obligor: obligor?.roleLabel,
    }),
  );
  const storyContext = whatIfStoryContext(scene, trial.asOf);
  const changes = whatIfBusinessFacts(
    graph,
    current.entityId,
    hypothesis?.values ?? {},
  );
  const localExplanation = () =>
    buildLocalStoryExplanation(
      storyContext,
      changes,
      ruleOutcomes,
      whatIfCommitment(
        graph,
        rules,
        [current, ...scenario.upstream],
        trial.factsOf,
      ),
      obligations?.length === 1 ? obligations[0] : undefined,
    );
  const explain = async (systemPrompt: string, signal?: AbortSignal) => {
    const response = await agent.generate({
      systemPrompt,
      signal,
      userPrompt: compactCanonicalJson({
        hypothesisQuestion,
        changes,
        storyContext,
        obligations,
        currentFacts: whatIfBusinessFacts(
          graph,
          current.entityId,
          trial.factsOf(current),
        ),
        upstream: scenario.upstream.map((step) => ({
          workObjectTitle: step.entityLabel,
          actorLabel: scenes.get(step.sequence)?.activity.actor.roleLabel,
          displayDate: businessDate(step.asOf),
          facts: whatIfBusinessFacts(graph, step.entityId, trial.factsOf(step)),
        })),
        ruleOutcomes: ruleOutcomes.map((outcome) => ({
          label: outcome.label,
          description: outcome.description,
          kind: outcome.kind === 'breach' ? '违约约定' : '完成条件',
          result: describeWhatIfOutcome(outcome),
        })),
      }),
    });
    const { businessImpactExplanation } = ImpactExplanationSchema.parse(
      responseObject(response),
    );
    const prose = WhatIfNarrativeText.safeParse(businessImpactExplanation);
    if (prose.success) return prose.data;
    if (rules.length) return localExplanation();
    throw prose.error;
  };

  if (hypothesis === undefined || rules.length === 0) {
    return {
      isSpeculative: true,
      ...(hypothesis === undefined ? {} : { hypothesis }),
      ruleOutcomes: [],
      businessImpactExplanation: await explain(WHAT_IF_SPECULATIVE_PROMPT),
    };
  }

  let businessImpactExplanation: string;
  if (localOnly) businessImpactExplanation = localExplanation();
  else if (options.explanation === 'optional') {
    const signal = AbortSignal.timeout(15_000);
    businessImpactExplanation = await abortable(signal, () =>
      explain(WHAT_IF_EXPLANATION_PROMPT, signal),
    ).catch(localExplanation);
  } else businessImpactExplanation = await explain(WHAT_IF_EXPLANATION_PROMPT);
  return {
    isSpeculative: false,
    hypothesis,
    ruleOutcome: ruleOutcomes[0]!,
    ruleOutcomes,
    businessImpactExplanation,
  };
}
