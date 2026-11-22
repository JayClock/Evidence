import { useEffect, useMemo, useState } from 'react';
import { Button } from '@evidence-poc/desktop-ui-kit';

import {
  type EntityAST,
  type InspectorPropertyDefinition,
  getInspectorGroups,
} from '@evidence-poc/evidence-schema';
import {
  buildKeyDataLedger,
  type DomainGraph,
  type ModelSelection,
} from '@evidence-poc/evidence-model-core';

import { RelationshipFlowSection } from './inspector/RelationshipFlowSection';
import { AttributeDataGrid } from './inspector/AttributeDataGrid';
import { FulfillmentPairSection } from './inspector/FulfillmentPairSection';
import { KeyDataLedgerSheet } from './inspector/KeyDataLedgerSheet';
import { InvariantRulesSection } from './inspector/InvariantRulesSection';

interface RightInspectorProps {
  /** The workspace shell can provide its own heading. */
  showHeading?: boolean;
  active?: boolean;
  gateReport?: {
    blockCount: number;
    warnCount: number;
    isStageGateReady: boolean;
  } | null;
  graph: DomainGraph;
  selection: ModelSelection;
}

const fieldValue = (entity: EntityAST, field: string): unknown =>
  (entity as unknown as Record<string, unknown>)[field];

/** Schema-driven entity inspection inside the workbench’s right pane. */
export const RightInspector = ({
  showHeading = true,
  active = true,
  gateReport = null,
  graph,
  selection,
}: RightInspectorProps) => {
  const entity =
    selection.nodeId === null ? undefined : graph.getEntity(selection.nodeId);
  return entity === undefined ? (
    <InspectorShell showHeading={showHeading}>
      <InspectorOverview graph={graph} gateReport={gateReport} />
    </InspectorShell>
  ) : (
    <SelectedInspector
      key={entity.id}
      entity={entity}
      showHeading={showHeading}
      active={active}
      graph={graph}
      selection={selection}
    />
  );
};

const InspectorOverview = ({
  graph,
  gateReport,
}: Pick<RightInspectorProps, 'graph' | 'gateReport'>) => {
  const ledger = useMemo(
    () => buildKeyDataLedger(graph.document),
    [graph.document],
  );
  return (
    <>
      <p>选择画布上的业务对象查看属性。</p>
      <section aria-label="核心要素台账" className="flex flex-col gap-2">
        <h3 className="font-semibold">核心要素台账</h3>
        <dl className="grid grid-cols-[1fr_auto] gap-1">
          <dt>核心要素</dt>
          <dd>{ledger.entries.length}</dd>
          <dt>依据待确认</dt>
          <dd>{ledger.decisionOwed.length}</dd>
          <dt>按公式计算</dt>
          <dd>{ledger.derived.length}</dd>
        </dl>
      </section>
      <section aria-label="门禁健康度" className="flex flex-col gap-2">
        <h3 className="font-semibold">门禁健康度</h3>
        {gateReport == null ? (
          <p>等待当前模型的诊断结果。</p>
        ) : (
          <p>
            {gateReport.isStageGateReady ? '已就绪' : '未就绪'} · 阻塞{' '}
            {gateReport.blockCount} · 警告 {gateReport.warnCount}
          </p>
        )}
      </section>
    </>
  );
};

const SelectedInspector = ({
  entity,
  showHeading,
  active,
  graph,
  selection,
}: RightInspectorProps & {
  entity: EntityAST;
  showHeading: boolean;
  active: boolean;
}) => {
  const [studioOpen, setStudioOpen] = useState(false);
  const attributeCount = entity.attributes?.length ?? 0;

  useEffect(() => {
    if (!active || attributeCount === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !event.altKey ||
        event.code !== 'KeyL' ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable="true"], [role="dialog"]',
          ))
      )
        return;
      event.preventDefault();
      setStudioOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, attributeCount]);

  return (
    <>
      <InspectorShell
        showHeading={showHeading}
        footer={
          attributeCount === 0 ? undefined : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-between"
              onClick={() => setStudioOpen(true)}
            >
              <span className="truncate">查看核心要素台账</span>
              <kbd className="shrink-0 text-[10px] text-workbench-muted">
                Alt+L
              </kbd>
            </Button>
          )
        }
      >
        <div className="flex min-w-0 items-baseline gap-2 text-workbench-muted">
          <span>ID:</span>
          <code title={entity.id} className="min-w-0 truncate">
            {entity.id}
          </code>
        </div>
        {entity.sourceSnippet === undefined ? null : (
          <section
            aria-label="依据条款原文"
            className="flex flex-col gap-1.5 rounded-md border border-workbench-border bg-workbench-background p-3"
          >
            <h3 className="font-semibold">依据条款原文</h3>
            <p className="text-workbench-body wrap-anywhere whitespace-pre-wrap">
              {entity.sourceSnippet.text}
            </p>
            <p className="wrap-anywhere text-workbench-muted">
              {entity.sourceSnippet.locator ?? '未记录定位信息'}
            </p>
          </section>
        )}
        <InspectorBody
          graph={graph}
          entity={entity}
          selectedAttribute={selection.attributeName}
          onOpenStudio={() => setStudioOpen(true)}
        />
      </InspectorShell>
      {active && studioOpen ? (
        <KeyDataLedgerSheet
          entity={entity}
          graph={graph}
          initialAttribute={selection.attributeName}
          onClose={() => setStudioOpen(false)}
        />
      ) : null}
    </>
  );
};

const InspectorShell = ({
  children,
  footer,
  showHeading,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  showHeading: boolean;
}) => (
  <aside className="flex h-full min-h-0 w-full flex-col bg-white">
    {showHeading ? (
      <div className="border-b border-evidence-line px-3 py-2 text-[10px] tracking-wide text-evidence-muted uppercase">
        检视器
      </div>
    ) : null}
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3 text-xs">
      {children}
    </div>
    {footer === undefined ? null : (
      <div className="flex h-12 shrink-0 items-center border-t border-workbench-border px-4">
        {footer}
      </div>
    )}
  </aside>
);

const InspectorBody = ({
  graph,
  entity,
  selectedAttribute,
  onOpenStudio,
}: {
  graph: DomainGraph;
  entity: EntityAST;
  selectedAttribute: string | null;
  onOpenStudio: () => void;
}) => {
  const groups = useMemo(
    () => getInspectorGroups(entity.category),
    [entity.category],
  );

  const renderGroup = (group: (typeof groups)[number]) => {
    const properties = group.properties.filter(
      (property) =>
        property.editor !== 'readonly-id' &&
        property.editor !== 'attribute-table',
    );
    if (properties.length === 0) return null;
    return (
      <section key={group.id} className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold text-workbench-label">
          {group.label}
        </h3>
        <dl className="flex flex-col gap-2">
          {properties.map((property) => (
            <PropertyRow
              key={property.field}
              graph={graph}
              entity={entity}
              property={property}
            />
          ))}
        </dl>
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {groups.filter((group) => group.id === 'general').map(renderGroup)}
      {groups.some((group) =>
        group.properties.some(
          (property) => property.editor === 'attribute-table',
        ),
      ) ? (
        <section aria-label="模型属性" className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold text-workbench-label">
            业务属性与核心要素（{entity.attributes?.length ?? 0} 个字段）
          </h3>
          <AttributeDataGrid
            entity={entity}
            graph={graph}
            selectedAttribute={selectedAttribute}
            onOpenStudio={onOpenStudio}
          />
        </section>
      ) : null}
      <InvariantRulesSection entityId={entity.id} graph={graph} />
      {groups.filter((group) => group.id !== 'general').map(renderGroup)}
      <RelationshipFlowSection entityId={entity.id} graph={graph} />
      {entity.category === 'evidence' &&
      entity.kind === 'fulfillment_request' ? (
        <FulfillmentPairSection entity={entity} graph={graph} />
      ) : null}
    </div>
  );
};

const ReferenceValue = ({ graph, id }: { graph: DomainGraph; id: string }) => {
  const target = graph.getEntity(id);
  return (
    <span>
      {target ? <>{target.label} · </> : <span>引用未解析 · </span>}
      <code>{id}</code>
    </span>
  );
};

const PropertyRow = ({
  graph,
  entity,
  property,
}: {
  graph: DomainGraph;
  entity: EntityAST;
  property: InspectorPropertyDefinition;
}) => {
  const value = fieldValue(entity, property.field);
  let content: React.ReactNode = '未声明';

  switch (property.editor) {
    case 'text':
      if (typeof value === 'string' && value.trim() !== '') content = value;
      break;
    case 'select':
      if (typeof value === 'string') {
        content =
          property.options?.find((option) => option.value === value)?.label ??
          value;
      }
      break;
    case 'boolean':
      if (typeof value === 'boolean') content = value ? '是' : '否';
      break;
    case 'reference-picker':
      if (typeof value === 'string' && value !== '')
        content = <ReferenceValue graph={graph} id={value} />;
      break;
    case 'reference-list': {
      const ids = Array.isArray(value)
        ? value.filter((id): id is string => typeof id === 'string')
        : [];
      if (ids.length > 0) {
        content = (
          <ul className="list-disc pl-4">
            {ids.map((id) => (
              <li key={id}>
                <ReferenceValue graph={graph} id={id} />
              </li>
            ))}
          </ul>
        );
      }
      break;
    }
    default:
      return null;
  }

  return (
    <div>
      <dt className="text-[10px] text-workbench-label">{property.label}</dt>
      <dd className="wrap-anywhere whitespace-pre-wrap text-workbench-body">
        {content}
      </dd>
      {property.helper === undefined ? null : (
        <dd className="mt-0.5 text-[9px] leading-snug text-workbench-muted">
          {property.helper}
        </dd>
      )}
    </div>
  );
};
