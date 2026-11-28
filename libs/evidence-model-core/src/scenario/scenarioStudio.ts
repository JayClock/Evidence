import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { resolveStorySteps } from '../trace/storyResolver.js';
import {
  evaluateRuleOnExample,
  validateTypedValue,
  jsonValuesEqual,
} from '@evidence-poc/evidence-cel';

export interface ScenarioEvaluation {
  ref: string;
  values: Record<string, unknown>;
  rules: { ruleRef: string; label: string; value?: unknown; error?: string }[];
  gaps: string[];
}

/** Local oracle only, not a workflow executor or proof of HTTP acceptance. */
export const evaluateScenario = (
  model: DomainModelDocument,
  flowId: string,
): readonly ScenarioEvaluation[] => {
  if (!model.stories.some((story) => story.id === flowId)) return [];
  const steps = resolveStorySteps(model, flowId);
  const facts = new Map<
    string,
    { entityRef: string; values: Record<string, unknown> }
  >();
  const ancestors = new Map<string, Set<string>>();
  const results: ScenarioEvaluation[] = [];
  for (const step of steps) {
    const ref = step.ref;
    const entity = model.entities.find((e) => e.id === step.workObjectRef);
    if (entity?.category !== 'evidence')
      throw new Error(`Unknown work object at '${ref}'`);
    const negative = (step.expectedStatus ?? 201) >= 400;
    const deps = new Set<string>();
    for (const key of [
      ...step.basedOn,
      ...Object.values(step.pathParameters ?? {}).map(
        (source) => source.stepRef,
      ),
    ]) {
      deps.add(key);
      for (const ancestor of ancestors.get(key) ?? []) deps.add(ancestor);
    }
    ancestors.set(ref, deps);
    const values = structuredClone(step.values);
    const result: ScenarioEvaluation = { ref, values, rules: [], gaps: [] };
    const derived = model.rules.filter(
      (r) => r.kind === 'derivation' && r.target?.entityRef === entity.id,
    );
    // Never feed an expected answer back into its derivation.
    for (const rule of derived)
      if (rule.target) delete values[rule.target.attribute];
    for (const attribute of entity.attributes ?? []) {
      if (attribute.derivedByRuleRef) continue;
      if (!Object.hasOwn(values, attribute.name)) {
        if (attribute.required && !negative)
          result.gaps.push(`尚未输入【${entity.label}.${attribute.label}】。`);
      } else {
        const problem = validateTypedValue(
          values[attribute.name],
          attribute.valueType ?? 'dynamic',
        );
        if (problem) result.gaps.push(`【${attribute.label}】：${problem}`);
      }
    }
    const inputIncomplete = result.gaps.length > 0;
    const evaluate = (rule: DomainModelDocument['rules'][number]) => {
      const bindings: Record<string, unknown> = {};
      for (const [alias, binding] of Object.entries(rule.bindings)) {
        if ('type' in binding) continue;
        const sources =
          binding.ref === entity.id
            ? [values]
            : [...deps].flatMap((d) => {
                const fact = facts.get(d);
                return fact?.entityRef === binding.ref ? [fact.values] : [];
              });
        if (binding.cardinality === 'many') bindings[alias] = sources;
        else {
          if (sources.length !== 1)
            throw new Error(
              `【${model.entities.find((e) => e.id === binding.ref)?.label ?? binding.ref}】需要一个明确的前置用例，当前为 ${sources.length} 个。`,
            );
          bindings[alias] = sources[0];
        }
      }
      return evaluateRuleOnExample(model, rule, { bindings, asOf: step.asOf });
    };
    if (!negative) {
      let pending = [...derived];
      while (pending.length) {
        const remaining: typeof pending = [];
        for (const rule of pending) {
          if (!rule.target) continue;
          try {
            const value = evaluate(rule);
            values[rule.target.attribute] = value;
            result.rules.push({ ruleRef: rule.id, label: rule.label, value });
            const expected = step.values[rule.target.attribute];
            if (expected !== undefined && !jsonValuesEqual(expected, value))
              result.gaps.push(`【${rule.label}】计算值与填写的预期值不一致。`);
          } catch {
            remaining.push(rule);
          }
        }
        if (remaining.length === pending.length) {
          for (const rule of remaining)
            try {
              evaluate(rule);
            } catch (error) {
              result.rules.push({
                ruleRef: rule.id,
                label: rule.label,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          break;
        }
        pending = remaining;
      }
      for (const rule of model.rules.filter(
        (r) =>
          r.contextRef === entity.contextRef &&
          r.kind !== 'derivation' &&
          Object.values(r.bindings).some(
            (b) => 'ref' in b && b.ref === entity.id,
          ),
      )) {
        try {
          result.rules.push({
            ruleRef: rule.id,
            label: rule.label,
            value: evaluate(rule),
          });
        } catch (error) {
          result.rules.push({
            ruleRef: rule.id,
            label: rule.label,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const derivationFailed = result.rules.some(
        (r) => r.error && derived.some((d) => d.id === r.ruleRef),
      );
      if (!inputIncomplete && !derivationFailed)
        facts.set(ref, { entityRef: entity.id, values });
    } else
      result.gaps.push(
        '负向请求不会形成后续凭证；HTTP 拒绝结果需运行后端验收。',
      );
    results.push(result);
  }
  return results;
};
