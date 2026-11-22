import type { AttributeAST, EntityAST } from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import { CelRuleDetails } from './CelRuleDetails';

export interface DerivedRuleSectionProps {
  entity: EntityAST;
  graph: DomainGraph;
  attribute: AttributeAST;
}

export const DerivedRuleSection = ({
  entity,
  graph,
  attribute,
}: DerivedRuleSectionProps) => {
  const rule = graph.derivationRule(entity.id, attribute.name);
  return (
    <div
      data-derived-rule-for={attribute.name}
      className="rounded border border-evidence-line bg-white p-2"
    >
      {rule === undefined ? (
        <p className="wrap-anywhere text-workbench-muted">
          {attribute.derivedByRuleRef === undefined ? (
            '未声明派生规则'
          ) : (
            <>
              派生规则未解析 · <code>{attribute.derivedByRuleRef}</code>
            </>
          )}
        </p>
      ) : (
        <CelRuleDetails
          graph={graph}
          entityRef={entity.id}
          rule={rule}
          ariaLabel={`${attribute.name} CEL 表达式`}
        />
      )}
    </div>
  );
};
