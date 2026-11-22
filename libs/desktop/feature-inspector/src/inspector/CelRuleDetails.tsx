import type { RuleAST } from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import { CelCodeMirrorViewer } from './cel/CelCodeMirrorViewer';
import { useCelRuleCandidates } from './useCelRuleCandidates';

export const CelRuleDetails = ({
  graph,
  entityRef,
  rule,
  ariaLabel = `${rule.id} CEL 表达式`,
}: {
  graph: DomainGraph;
  entityRef: string;
  rule: RuleAST;
  ariaLabel?: string;
}) => {
  const candidates = useCelRuleCandidates({
    graph,
    entityRef,
    ruleId: rule.id,
  });
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="wrap-anywhere text-workbench-body">
        {rule.label} · <code>{rule.id}</code>
      </div>
      <p className="whitespace-pre-wrap text-workbench-muted">
        {rule.description}
      </p>
      <CelCodeMirrorViewer
        value={rule.expression}
        candidates={candidates}
        ariaLabel={ariaLabel}
      />
      {candidates.length > 0 ? (
        <p className="wrap-anywhere text-[10px] text-workbench-muted">
          输入：
          {candidates
            .map(
              ({ alias, label, cardinality }) =>
                `${alias} → ${label}${cardinality === 'many' ? '（集合）' : ''}`,
            )
            .join('，')}
        </p>
      ) : null}
    </div>
  );
};
