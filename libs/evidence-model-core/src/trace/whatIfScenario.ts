import type { RuleAST } from '@evidence-poc/evidence-schema';
import {
  evaluateRuleOnExample,
  isTimestampText,
  validateTypedValue,
} from '@evidence-poc/evidence-cel';
import type { DomainGraph } from '../model/graph.js';
import type { FlowStepTrace } from './types.js';
import { isWhatIfDeadline } from './whatIfRules.js';

export interface WhatIfHypothesis {
  /** An explicit RFC 3339 clock; never inferred from the machine's date. */
  readonly asOf?: string;
  /** Partial overrides of the current step's declared input attributes only. */
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface WhatIfCompletionGap {
  readonly requestId: string;
  readonly ruleId: string;
  readonly deadline: string;
}

type DerivationRule = RuleAST & { target: NonNullable<RuleAST['target']> };

const stepRef = (step: FlowStepTrace) => `${step.storyId}#${step.stepId}`;

/** Resolve the same causal inputs for challenge generation and sandbox decisions. */
export function createWhatIfScenario(
  graph: DomainGraph,
  steps: readonly FlowStepTrace[],
  current: FlowStepTrace,
) {
  const stepsByRef = new Map(steps.map((step) => [stepRef(step), step]));
  const ancestors = (step: FlowStepTrace): FlowStepTrace[] => {
    const found = new Map<string, FlowStepTrace>();
    const visit = (consumer: FlowStepTrace): void => {
      for (const ref of consumer.basedOn) {
        const source = stepsByRef.get(ref);
        if (!source) throw new Error(`Missing dependency '${ref}'.`);
        if (source.sequence >= consumer.sequence) {
          throw new Error(
            `Dependency '${ref}' must precede '${stepRef(consumer)}'.`,
          );
        }
        const sourceRef = stepRef(source);
        if (!found.has(sourceRef)) {
          found.set(sourceRef, source);
          visit(source);
        }
      }
    };
    visit(step);
    return [...found.values()].sort((a, b) => a.sequence - b.sequence);
  };
  const upstream = ancestors(current);
  const pair = graph.fulfillmentPair(current.entityId);
  const missingConfirmations = (pair?.confirmations ?? [])
    .filter(({ id }) => !upstream.some(({ entityId }) => entityId === id))
    .map(({ label }) => label);
  const downstream = new Set(
    pair ? [...pair.confirmations, ...pair.proofs].map(({ id }) => id) : [],
  );
  const requestFields = pair?.request.attributes;
  const deadlineField =
    requestFields?.find(({ timeRole }) => timeRole === 'deadline') ??
    requestFields?.find(isWhatIfDeadline);
  const derived = new Set(
    graph
      .rules()
      .flatMap(({ kind, target }) =>
        kind === 'derivation' && target?.entityRef === current.entityId
          ? [target.attribute]
          : [],
      ),
  );
  const inputAttributes = graph
    .attributesOf(current.entityId)
    .filter(
      ({ name, derivedByRuleRef }) =>
        derivedByRuleRef === undefined && !derived.has(name),
    );
  const apply = (hypothesis: WhatIfHypothesis = {}) => {
    for (const [name, value] of Object.entries(hypothesis.values ?? {})) {
      const attribute = inputAttributes.find((item) => item.name === name);
      if (attribute === undefined)
        throw new Error(
          `Hypothesis cannot override unknown or derived field '${name}'.`,
        );
      const problem = validateTypedValue(
        value,
        attribute.valueType ?? 'dynamic',
      );
      if (problem !== null) throw new Error(`Hypothesis ${name} ${problem}`);
    }
    const asOf = hypothesis.asOf ?? current.asOf;
    if (upstream.some((source) => Date.parse(source.asOf) > Date.parse(asOf))) {
      throw new Error('Hypothesis clock precedes its dependency facts.');
    }

    const materialized = new Map<string, Record<string, unknown>>();
    // Narration can read verified values without evaluating unrelated or speculative facts.
    const factsOf = (step: FlowStepTrace): Record<string, unknown> =>
      materialized.get(stepRef(step)) ?? {
        ...step.values,
        ...(stepRef(step) === stepRef(current) ? hypothesis.values : {}),
      };
    const bindingsFor = (
      rule: RuleAST,
      step: FlowStepTrace,
      local: Record<string, unknown>,
    ): Record<string, unknown> => {
      const bindings: Record<string, unknown> = {};
      for (const [alias, binding] of Object.entries(rule.bindings)) {
        // evaluateRuleOnExample injects only the explicit now/asOf clock; other
        // type-only bindings are deliberately unavailable, never guessed by AI.
        if ('type' in binding) continue;
        const candidates =
          binding.ref === step.entityId
            ? [local]
            : ancestors(step)
                .filter((source) => source.entityId === binding.ref)
                .map(materialize);
        if (binding.cardinality === 'many') bindings[alias] = candidates;
        else if (candidates.length === 1) bindings[alias] = candidates[0];
        else if (
          candidates.length === 0 &&
          step === current &&
          (rule.kind === 'completion' || rule.kind === 'breach') &&
          downstream.has(binding.ref)
        )
          bindings[alias] = null;
        else
          throw new Error(
            `${rule.id}: binding '${alias}' requires one '${binding.ref}' example, found ${candidates.length}.`,
          );
      }
      return bindings;
    };
    const materialize = (step: FlowStepTrace): Record<string, unknown> => {
      const ref = stepRef(step);
      const cached = materialized.get(ref);
      if (cached !== undefined) return cached;
      const values = structuredClone(factsOf(step));
      const modeledEntity = graph.getEntity(step.entityId);
      if (modeledEntity === undefined)
        throw new Error(`Unknown entity '${step.entityId}'.`);
      const derivations = graph
        .rules()
        .filter(
          (rule): rule is DerivationRule =>
            rule.kind === 'derivation' &&
            rule.target?.entityRef === step.entityId,
        );
      for (const attribute of modeledEntity.attributes ?? []) {
        if (
          attribute.derivedByRuleRef !== undefined &&
          !derivations.some(
            (rule) =>
              rule.id === attribute.derivedByRuleRef &&
              rule.target?.attribute === attribute.name,
          )
        ) {
          throw new Error(
            `Missing derivation '${attribute.derivedByRuleRef}' for '${step.entityId}.${attribute.name}'.`,
          );
        }
      }
      // Never use asserted derived values as oracle inputs, including values
      // supplied directly by a hand-constructed trace. Recompute from raw facts.
      for (const rule of derivations) delete values[rule.target.attribute];
      materialized.set(ref, values);
      let pending = derivations;
      while (pending.length > 0) {
        const remaining: DerivationRule[] = [];
        const errors: string[] = [];
        for (const rule of pending) {
          try {
            values[rule.target.attribute] = evaluateRuleOnExample(
              graph.document,
              rule,
              {
                asOf: ref === stepRef(current) ? asOf : step.asOf,
                bindings: bindingsFor(rule, step, values),
              },
            );
          } catch (error) {
            remaining.push(rule);
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
        if (remaining.length === pending.length) {
          materialized.delete(ref);
          throw new Error(
            `Cannot compute '${ref}' derivations: ${errors.join('; ')}`,
          );
        }
        pending = remaining;
      }
      return values;
    };

    const bindingsOf = (rule: RuleAST) =>
      bindingsFor(rule, current, materialize(current));
    const decide = (rule: RuleAST) => {
      const result = evaluateRuleOnExample(graph.document, rule, {
        asOf,
        bindings: bindingsOf(rule),
        absentEvidenceRefs: downstream,
      });
      if (typeof result !== 'boolean')
        throw new Error(`${rule.id}: a decision rule must return boolean.`);
      return { ruleId: rule.id, result };
    };
    const requestDeadline = () => {
      if (!deadlineField) return;
      const value = materialize(current)[deadlineField.name];
      if (!isTimestampText(value)) return;
      return {
        field: deadlineField,
        value,
        overdue: Date.parse(asOf) > Date.parse(value),
      };
    };
    const completionGap = (
      outcomes: readonly {
        kind: RuleAST['kind'];
        ruleId: string;
        result: boolean;
      }[],
    ): WhatIfCompletionGap | undefined => {
      if (
        !pair ||
        outcomes.some(({ kind, result }) => kind === 'breach' && result)
      )
        return;
      const [completion, other] = outcomes.filter(
        ({ kind }) => kind === 'completion',
      );
      if (!completion || completion.result || other) return;
      const deadline = requestDeadline();
      if (!deadline?.overdue) return;
      return {
        requestId: pair.request.id,
        ruleId: completion.ruleId,
        deadline: deadline.value,
      };
    };
    return {
      asOf,
      valuesOf: materialize,
      factsOf,
      bindingsOf,
      decide,
      requestDeadline,
      completionGap,
    };
  };
  return {
    upstream,
    inputAttributes,
    missingConfirmations,
    apply,
  };
}
