import { RELATIONSHIP_FLOW_LABELS } from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';

/** Shows declared citations, not inferred request/confirmation pairings. */
export const RelationshipFlowSection = ({
  entityId,
  graph,
}: {
  entityId: string;
  graph: DomainGraph;
}) => {
  const edges = graph
    .relationships()
    .filter(
      (edge) => edge.sourceRef === entityId && edge.kind === 'references',
    );
  if (edges.length === 0) return null;
  return (
    <section aria-label="履约引用路径" className="flex flex-col gap-2">
      <h3 className="font-semibold">履约引用路径</h3>
      <p className="text-evidence-muted">
        补偿请求或升级记录 → 原履约请求。标记不代表已完成履约或法务批准。
      </p>
      <ul className="flex flex-col gap-2">
        {edges.map((edge) => (
          <li key={edge.id} className="rounded border border-evidence-line p-2">
            <p className="wrap-anywhere">
              {edge.label} →{' '}
              {graph.getEntity(edge.targetRef)?.label ?? edge.targetRef}
            </p>
            <p className="text-workbench-muted">
              路径类型：{RELATIONSHIP_FLOW_LABELS[edge.flowKind ?? 'primary']}
            </p>
            {edge.notes !== undefined ? (
              <p className="wrap-anywhere whitespace-pre-wrap">{edge.notes}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
};
