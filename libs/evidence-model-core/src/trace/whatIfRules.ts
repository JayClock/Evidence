import {
  evidenceStageOf,
  isEvidenceEntity,
  type AttributeAST,
  type EntityAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '../model/graph.js';

type DecisionRule = RuleAST & { kind: 'completion' | 'breach' };

const isDecisionRule = (rule: RuleAST): rule is DecisionRule =>
  rule.kind === 'completion' || rule.kind === 'breach';

export const isWhatIfDeadline = ({ timeRole, name, valueType }: AttributeAST) =>
  timeRole === 'deadline' ||
  (valueType === 'timestamp' && (name === 'deadline' || name === 'expired_at'));

export const isWhatIfFulfillmentEvidence = (
  entity: EntityAST | undefined,
): boolean =>
  isEvidenceEntity(entity) && evidenceStageOf(entity) === 'fulfillment';

/** Candidate rules, not a guarantee that the selected example supplies every input. */
export function whatIfDecisionRules(
  graph: DomainGraph,
  entityId: string,
): readonly DecisionRule[] {
  if (!isWhatIfFulfillmentEvidence(graph.getEntity(entityId))) return [];
  const related = new Set([entityId]);
  for (const pair of graph.fulfillmentPairs()) {
    const members = [pair.request, ...pair.confirmations, ...pair.proofs];
    if (!members.some(({ id }) => id === entityId)) continue;
    for (const { id } of members) related.add(id);
  }
  return graph
    .rules()
    .filter(
      (rule): rule is DecisionRule =>
        isDecisionRule(rule) &&
        Object.values(rule.bindings).some(
          (binding) => 'ref' in binding && related.has(binding.ref),
        ),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** A shared receipt exposes both pairs. Only its unqualified decisions and
 * the current request's own decisions can determine that request's outcome. */
export function whatIfRulesForStep(
  graph: DomainGraph,
  entityId: string,
  candidates: readonly RuleAST[] = whatIfDecisionRules(graph, entityId),
): readonly DecisionRule[] {
  const rules = candidates.filter(isDecisionRule);
  const pair = graph.fulfillmentPair(entityId);
  if (!pair) return rules;
  const downstream = new Set(
    [...pair.confirmations, ...pair.proofs].map(({ id }) => id),
  );
  return rules.filter((rule) => {
    const refs = Object.values(rule.bindings).flatMap((binding) =>
      'ref' in binding ? [binding.ref] : [],
    );
    if (refs.includes(entityId)) return true;
    return !refs.some((ref) => {
      const owner = graph.fulfillmentPair(ref);
      return (
        owner &&
        [...owner.confirmations, ...owner.proofs].some(
          ({ id }) => downstream.has(id) && refs.includes(id),
        )
      );
    });
  });
}
