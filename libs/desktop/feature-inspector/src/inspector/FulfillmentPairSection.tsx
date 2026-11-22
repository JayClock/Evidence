import type { EvidenceEntityAST } from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import { CelRuleDetails } from './CelRuleDetails';

/** Shows declared fulfillment structure without inferring follow-up actions. */
export const FulfillmentPairSection = ({
  entity,
  graph,
}: {
  entity: EvidenceEntityAST;
  graph: DomainGraph;
}) => {
  if (entity.kind !== 'fulfillment_request' || entity.contextRef === undefined)
    return null;
  const pair = graph.fulfillmentPair(entity.id);
  const completionRules = pair?.completionRules ?? [];
  const confirmations = pair?.confirmations ?? [];
  const breachRules = pair?.breachRules ?? [];

  return (
    <section
      aria-label="履约结构"
      data-region="fulfillment-pair"
      className="flex flex-col gap-2"
    >
      <h3 className="text-[11px] font-semibold text-workbench-label">
        履约结构
      </h3>
      <div className="flex flex-col gap-2 rounded border border-evidence-line bg-white p-2">
        <h4 className="font-medium text-workbench-label">完成条件</h4>
        {completionRules.length === 0 ? (
          <p className="text-workbench-muted">未声明完成规则</p>
        ) : (
          completionRules.map((rule) => (
            <CelRuleDetails
              key={rule.id}
              graph={graph}
              entityRef={entity.id}
              rule={rule}
            />
          ))
        )}
        <h4 className="font-medium text-workbench-label">对应完成凭证</h4>
        {confirmations.length === 0 ? (
          <p className="text-workbench-muted">
            未声明结果端确认；确认凭证不是条件成立后自动生成的节点。
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {confirmations.map(({ id, label }) => (
              <li key={id} className="wrap-anywhere text-workbench-body">
                {label} · <code>{id}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded border border-evidence-line bg-white p-2">
        <h4 className="font-medium text-workbench-label">违约条件</h4>
        {breachRules.length === 0 ? (
          <p className="text-workbench-muted">未声明违约规则</p>
        ) : (
          breachRules.map((rule) => (
            <CelRuleDetails
              key={rule.id}
              graph={graph}
              entityRef={entity.id}
              rule={rule}
            />
          ))
        )}
        <p className="text-workbench-muted">
          模型不推断违约后的自动流转；已声明的引用可在履约引用路径中查看。
        </p>
      </div>
    </section>
  );
};
