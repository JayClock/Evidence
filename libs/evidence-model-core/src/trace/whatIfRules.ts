import {
  evidenceStageOf,
  isEvidenceEntity,
  type EntityAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '../model/graph.js';

type DecisionRule = RuleAST & { kind: 'completion' | 'breach' };

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
    if (pair.confirmations.some(({ id }) => id === entityId)) {
      related.add(pair.request.id);
    }
  }
  return graph
    .rules()
    .filter(
      (rule): rule is DecisionRule =>
        (rule.kind === 'completion' || rule.kind === 'breach') &&
        Object.values(rule.bindings).some(
          (binding) => 'ref' in binding && related.has(binding.ref),
        ),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
