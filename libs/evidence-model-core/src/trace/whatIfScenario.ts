import type { RuleAST } from '@evidence-poc/evidence-schema';
import {
  evaluateRuleOnExample,
  validateTypedValue,
} from '@evidence-poc/evidence-cel';
import type { DomainGraph } from '../model/graph.js';
import type { FlowStepTrace } from './types.js';

export interface WhatIfHypothesis {
  /** An explicit RFC 3339 clock; never inferred from the machine's date. */
  readonly asOf?: string;
  /** Partial overrides of the current step's declared input attributes only. */
  readonly values?: Readonly<Record<string, unknown>>;
}

type DerivationRule = RuleAST & { target: NonNullable<RuleAST['target']> };

const exampleRef = (step: FlowStepTrace): string =>
  `${step.entityId}#${step.exampleLabel}`;

/** Resolve the same causal inputs for challenge generation and sandbox decisions. */
export function createWhatIfScenario(
  graph: DomainGraph,
  steps: readonly FlowStepTrace[],
  current: FlowStepTrace,
) {
  const stepsByRef = new Map<string, FlowStepTrace>();
  const aliases = new Map<string, Set<FlowStepTrace>>();
  for (const step of steps) {
    const ref = exampleRef(step);
    if (stepsByRef.has(ref)) throw new Error(`Ambiguous example '${ref}'.`);
    stepsByRef.set(ref, step);
    for (const value of [step.values.id, step.values.ref]) {
      if (typeof value !== 'string' || value.length === 0) continue;
      const matches = aliases.get(value) ?? new Set<FlowStepTrace>();
      matches.add(step);
      aliases.set(value, matches);
    }
  }
  const resolveDependency = (ref: string): FlowStepTrace => {
    const exact = stepsByRef.get(ref);
    if (exact !== undefined) return exact;
    const candidates = [...(aliases.get(ref) ?? [])];
    if (candidates.length > 1)
      throw new Error(`Ambiguous dependency '${ref}'.`);
    const source = candidates[0];
    if (source === undefined) throw new Error(`Missing dependency '${ref}'.`);
    return source;
  };
  const ancestors = (step: FlowStepTrace): FlowStepTrace[] => {
    const found = new Map<string, FlowStepTrace>();
    const visit = (consumer: FlowStepTrace): void => {
      for (const ref of consumer.basedOn) {
        const source = resolveDependency(ref);
        if (source.sequence >= consumer.sequence) {
          throw new Error(
            `Dependency '${ref}' must precede '${exampleRef(consumer)}'.`,
          );
        }
        const sourceRef = exampleRef(source);
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
      materialized.get(exampleRef(step)) ?? {
        ...step.values,
        ...(exampleRef(step) === exampleRef(current) ? hypothesis.values : {}),
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
        else {
          if (candidates.length !== 1)
            throw new Error(
              `${rule.id}: binding '${alias}' requires one '${binding.ref}' example, found ${candidates.length}.`,
            );
          bindings[alias] = candidates[0];
        }
      }
      return bindings;
    };
    const materialize = (step: FlowStepTrace): Record<string, unknown> => {
      const ref = exampleRef(step);
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
                asOf: ref === exampleRef(current) ? asOf : step.asOf,
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
      });
      if (typeof result !== 'boolean')
        throw new Error(`${rule.id}: a decision rule must return boolean.`);
      return { ruleId: rule.id, result };
    };
    return { asOf, valuesOf: materialize, factsOf, bindingsOf, decide };
  };
  return { upstream, inputAttributes, apply };
}
