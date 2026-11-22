import { useMemo } from 'react';
import {
  collectCelCandidates,
  type CelCandidate,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';

/** Read declared rule bindings for diagnostics and business-formula labels. */
export const useCelRuleCandidates = ({
  graph,
  entityRef,
  ruleId,
}: {
  graph: DomainGraph;
  entityRef: string;
  ruleId: string | undefined;
}): readonly CelCandidate[] =>
  useMemo(
    () =>
      ruleId === undefined
        ? []
        : collectCelCandidates({ graph, entityRef, ruleId }),
    [graph, entityRef, ruleId],
  );
