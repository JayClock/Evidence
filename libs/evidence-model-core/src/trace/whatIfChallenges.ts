import type { ASTNode } from '@marcbachmann/cel-js';
import type { AttributeAST, RuleAST } from '@evidence-poc/evidence-schema';
import {
  resolveCelReference,
  walkCelAst,
  type CelScope,
} from '../cel/celAst.js';
import { celValueToJson, compileCelExpression } from '../cel/celEvaluator.js';
import type { DomainGraph } from '../model/graph.js';
import { validateTypedValue } from '../validation/typedValues.js';
import type { FlowStepTrace } from './types.js';
import {
  createWhatIfScenario,
  type WhatIfHypothesis,
} from './whatIfScenario.js';

export type WhatIfChallengeCategory =
  | 'overdue'
  | 'deficit'
  | 'condition_gap'
  | 'actor_mismatch';

export interface WhatIfChallenge {
  readonly id: string;
  readonly category: WhatIfChallengeCategory;
  readonly label: string;
  readonly question: string;
  readonly targetedRuleId?: string;
  readonly isFallback?: boolean;
  readonly hypothesisDraft?: WhatIfHypothesis;
}

type Candidate = Pick<WhatIfChallenge, 'label' | 'question' | 'category'> & {
  hypothesisDraft: WhatIfHypothesis;
};
type BoundField = {
  entityId: string;
  field: AttributeAST;
  value: unknown;
  money?: Record<string, unknown>;
};

export const isWhatIfDeadline = ({ timeRole, name, valueType }: AttributeAST) =>
  timeRole === 'deadline' ||
  (valueType === 'timestamp' && (name === 'deadline' || name === 'expired_at'));

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Incomplete models and ambiguous examples can still be played and edited.
function whenEvaluable<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** Resolve a single bound field, including macro aliases and money subunits. */
function boundField(
  graph: DomainGraph,
  rule: RuleAST,
  bindings: Record<string, unknown>,
  node: ASTNode,
  scope: CelScope,
): BoundField | undefined {
  const ref = resolveCelReference(node, scope);
  if (!ref?.members.length) return;
  const binding = rule.bindings[ref.root];
  if (!binding || !('ref' in binding)) return;
  const field = graph.attribute(binding.ref, ref.members[0]!.name);
  if (!field) return;
  const candidate = bindings[ref.root];
  const values =
    ref.iterated && Array.isArray(candidate) && candidate.length === 1
      ? candidate[0]
      : candidate;
  if (!record(values)) return;
  const value = values[field.name];
  if (ref.members.length === 1) return { entityId: binding.ref, field, value };
  if (
    ref.members.length === 2 &&
    field.valueType === 'money' &&
    ref.members[1]!.name === 'minorUnits' &&
    record(value)
  )
    return {
      entityId: binding.ref,
      field,
      value: value.minorUnits,
      money: value,
    };
  return undefined;
}

function belowTarget(
  target: unknown,
  actual: BoundField,
): number | string | undefined {
  const type = actual.field.valueType;
  if (typeof target !== 'number' && typeof target !== 'string') return;
  if (type === 'int' || type === 'uint') {
    if (
      validateTypedValue(target, type) ||
      validateTypedValue(actual.value, type)
    )
      return;
    const below = BigInt(target) - 1n;
    if (below >= BigInt(String(actual.value))) return;
    return Number.isSafeInteger(Number(below))
      ? Number(below)
      : below.toString();
  }
  if (
    type !== 'double' &&
    type !== 'decimal' &&
    !actual.money &&
    typeof actual.value !== 'number'
  )
    return;
  const n = Number(target);
  if (!Number.isFinite(n)) return;
  // One unit at the precision shown by the threshold (one subunit for money).
  const [mantissa, exponent = '0'] = String(n).split('e');
  const precision = Math.max(
    0,
    (mantissa!.split('.')[1]?.length ?? 0) - Number(exponent),
  );
  const below = Number(
    (n - 10 ** -precision).toFixed(Math.min(precision, 100)),
  );
  return below < n && below < Number(actual.value) ? below : undefined;
}

function deficitChallenge(
  step: FlowStepTrace,
  inputs: readonly AttributeAST[],
  source: BoundField | undefined,
  target: unknown,
): Candidate | undefined {
  if (
    !source ||
    source.entityId !== step.entityId ||
    !inputs.includes(source.field)
  )
    return;
  const below = belowTarget(target, source);
  if (below === undefined) return;
  return {
    category: 'deficit',
    label: '交付未达标',
    question: `如果《${step.entityLabel}》的「${source.field.label}」只有 ${below}${source.money ? '（最小货币单位）' : ''}，低于约定的 ${target}，会怎样？`,
    hypothesisDraft: {
      values: {
        [source.field.name]: source.money
          ? { ...source.money, minorUnits: below }
          : below,
      },
    },
  };
}

function overdueChallenge(
  step: FlowStepTrace,
  field: AttributeAST,
  deadline: unknown,
  occurrence?: AttributeAST,
): Candidate | undefined {
  if (typeof deadline !== 'string' || validateTypedValue(deadline, 'timestamp'))
    return;
  const day = 86_400_000;
  const observed = occurrence && step.values[occurrence.name];
  const latest = Math.max(
    Date.parse(step.asOf),
    typeof observed === 'string' ? Date.parse(observed) : -Infinity,
  );
  const nextDay = Date.parse(deadline) + day;
  const alreadyLate = latest >= nextDay;
  const instant = new Date(alreadyLate ? latest + day : nextDay);
  if (!Number.isFinite(instant.getTime())) return;
  const late = instant.toISOString();
  if (validateTypedValue(late, 'timestamp')) return;
  const change = occurrence ? `将「${occurrence.label}」推迟到` : '到';
  const when = alreadyLate
    ? `已超过「${field.label}」的 ${late}`
    : `「${field.label}」后一天（${late}）`;
  return {
    category: 'overdue',
    label: '超过约定期限',
    question: `如果${change}${when}${occurrence ? '' : '仍未履约'}，《${step.entityLabel}》的判定结果会怎样？`,
    hypothesisDraft: {
      asOf: late,
      ...(occurrence ? { values: { [occurrence.name]: late } } : {}),
    },
  };
}

/** At most one deadline and one shortfall, each checked against the target's complete CEL expression. */
export function buildDeterministicFallbackChallenges(
  graph: DomainGraph,
  steps: readonly FlowStepTrace[],
  step: FlowStepTrace,
  rules: readonly RuleAST[],
): readonly WhatIfChallenge[] {
  const scenario = whenEvaluable(() =>
    createWhatIfScenario(graph, steps, step),
  );
  const baseline = whenEvaluable(() => scenario?.apply());
  if (!scenario || !baseline) return [];
  const found = new Map<WhatIfChallengeCategory, WhatIfChallenge>();
  const occurrence =
    step.entityKind === 'fulfillment_confirmation'
      ? scenario.inputAttributes.find(
          ({ timeRole }) => timeRole === 'occurrence',
        )
      : undefined;
  for (const rule of [...rules].sort(
    (a, b) => Number(b.kind === 'breach') - Number(a.kind === 'breach'),
  )) {
    const breach = rule.kind === 'breach';
    const offer = (candidate: Candidate | undefined) => {
      if (!candidate || found.has(candidate.category)) return;
      if (
        whenEvaluable(
          () => scenario.apply(candidate.hypothesisDraft).decide(rule).result,
        ) === breach
      )
        found.set(candidate.category, {
          ...candidate,
          id: `fallback:${rule.id}:${candidate.category}`,
          targetedRuleId: rule.id,
          isFallback: true,
        });
    };
    const bindings = whenEvaluable(() => baseline.bindingsOf(rule));
    const ast = whenEvaluable(
      () => compileCelExpression(rule.expression).expr.ast,
    );
    if (!bindings || !ast) continue;
    walkCelAst(ast, (node, scope) => {
      const read = (operand: ASTNode) =>
        boundField(graph, rule, bindings, operand, scope);
      if (!found.has('overdue')) {
        const bound = read(node);
        if (bound && isWhatIfDeadline(bound.field))
          offer(overdueChallenge(step, bound.field, bound.value, occurrence));
      }
      const shortfall = (actual: ASTNode, threshold: ASTNode) => {
        if (found.has('deficit')) return;
        const source = read(actual);
        const limit = read(threshold);
        if (
          source?.money &&
          limit?.money &&
          source.money.currency !== limit.money.currency
        )
          return;
        const target =
          threshold.op === 'value'
            ? celValueToJson(threshold.args)
            : limit?.value;
        offer(deficitChallenge(step, scenario.inputAttributes, source, target));
      };
      if (
        node.op === '<' ||
        node.op === '<=' ||
        node.op === '>' ||
        node.op === '>='
      ) {
        const [left, right] = node.args;
        if (!found.has('overdue') && !occurrence) {
          const a = read(left);
          const b = read(right);
          const cutoff = a && isWhatIfDeadline(a.field) ? a : b;
          const submitted = cutoff === a ? b : a;
          if (
            cutoff &&
            isWhatIfDeadline(cutoff.field) &&
            submitted?.entityId === step.entityId &&
            submitted.field.valueType === 'timestamp' &&
            !submitted.field.timeRole &&
            scenario.inputAttributes.includes(submitted.field)
          )
            offer(
              overdueChallenge(
                step,
                cutoff.field,
                cutoff.value,
                submitted.field,
              ),
            );
        }
        if (breach === (node.op === '<' || node.op === '<='))
          shortfall(left, right);
        else shortfall(right, left);
      } else if (
        step.entityKind === 'fulfillment_confirmation' &&
        ((node.op === '!=' && breach) || (node.op === '==' && !breach))
      ) {
        shortfall(node.args[0], node.args[1]);
        shortfall(node.args[1], node.args[0]);
      }
    });
    if (!found.has('overdue')) {
      const deadline = graph.attributesOf(step.entityId).find(isWhatIfDeadline);
      if (
        deadline &&
        whenEvaluable(() => baseline.decide(rule).result) === !breach
      )
        offer(
          overdueChallenge(
            step,
            deadline,
            baseline.valuesOf(step)[deadline.name],
            occurrence,
          ),
        );
    }
    if (found.size === 2) break;
  }
  return [...found.values()];
}
