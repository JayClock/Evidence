import {
  KEY_DATA_SOURCE_LABELS,
  type AttributeAST,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
import type {
  DomainGraph,
  KeyDataEntry,
} from '@evidence-poc/evidence-model-core';

interface KeyDataProvenanceViewProps {
  entity: EntityAST;
  attribute: AttributeAST;
  graph: DomainGraph;
  entry: KeyDataEntry | undefined;
}

const providerLabel = (
  graph: DomainGraph,
  provider: KeyDataEntry['providers'][number],
): string => {
  if (provider.ref === '') {
    return `${provider.alias} → 运行时 ${provider.valueType ?? 'dynamic'}`;
  }

  const entity = graph.getEntity(provider.ref);
  const suffix = provider.cardinality === 'many' ? '（集合）' : '';

  const name = entity?.label ?? provider.ref;
  return provider.attribute === undefined
    ? `${provider.alias} → ${name}${suffix}`
    : `${name}.${provider.attribute}${suffix}`;
};

/**
 * Shows how one key data item is provided.
 *
 * The verdict comes from the same classification the pinned checker uses, so a
 * green badge means the ledger recognises the declared provider.
 */
export const KeyDataProvenanceView = ({
  entity,
  attribute,
  graph,
  entry,
}: KeyDataProvenanceViewProps) => {
  if (attribute.keyData !== true) {
    return null;
  }

  const source = entry?.source ?? 'needs-decision';
  const resolved = entry?.decisionOwed === false;

  return (
    <div
      data-provenance-for={attribute.name}
      className="mt-1 rounded border border-evidence-line bg-[#fbfbfc] px-2 py-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] text-[#59606c]">提供方</span>
        <span
          className={[
            'rounded px-1 text-[8px]',
            resolved
              ? 'bg-[#eaf3ee] text-evidence-participant'
              : 'bg-[#fdeef2] text-evidence-evidence',
          ].join(' ')}
        >
          {KEY_DATA_SOURCE_LABELS[source]}
        </span>
      </div>

      {entry !== undefined && entry.providers.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {entry.providers.map((provider) => (
            <li
              key={`${attribute.name}-${provider.alias}`}
              className="wrap-anywhere font-mono text-[8px] text-[#6b7280]"
            >
              {providerLabel(graph, provider)}
            </li>
          ))}
        </ul>
      ) : null}

      {entry === undefined || entry.decisionOwed ? (
        <p className="mt-1 wrap-anywhere text-[10px] leading-snug text-evidence-evidence">
          {entity.label}.{attribute.name}{' '}
          仍待决策：金额、期限、数量与时间差需要有合同参数、前序凭证属性、派生规则或结果事实作为提供方。
        </p>
      ) : null}
    </div>
  );
};
