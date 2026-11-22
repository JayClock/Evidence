import { useMemo } from 'react';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import { CelRuleDetails } from './CelRuleDetails';

export const InvariantRulesSection = ({
  entityId,
  graph,
}: {
  entityId: string;
  graph: DomainGraph;
}) => {
  const rules = useMemo(
    () =>
      graph
        .rules()
        .filter(
          (rule) =>
            rule.kind === 'invariant' &&
            Object.values(rule.bindings).some(
              (binding) => 'ref' in binding && binding.ref === entityId,
            ),
        ),
    [graph, entityId],
  );

  return (
    <section aria-label="业务不变量规则" className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold text-workbench-label">
        业务不变量规则（CEL）
      </h3>
      {rules.length === 0 ? (
        <p className="text-workbench-muted">未声明不变量</p>
      ) : null}
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="rounded-md border border-workbench-border bg-workbench-background p-2"
        >
          <CelRuleDetails graph={graph} entityRef={entityId} rule={rule} />
        </div>
      ))}
    </section>
  );
};
