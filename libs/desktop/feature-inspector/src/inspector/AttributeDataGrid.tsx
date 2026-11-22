import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { EntityAST, TimeRole } from '@evidence-poc/evidence-schema';
import {
  buildKeyDataLedger,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';
import { cn } from '@evidence-poc/desktop-ui-kit';
import { ApiFieldBadge } from './ApiFieldBadge';
import { DerivedRuleSection } from './DerivedRuleSection';
import { KeyDataProvenanceView } from './KeyDataProvenanceView';

interface AttributeDataGridProps {
  entity: EntityAST;
  graph: DomainGraph;
  onOpenStudio?: () => void;
  selectedAttribute?: string | null;
}

const TIME_ROLE_LABELS: Record<TimeRole, string> = {
  start: '开始时间',
  deadline: '截止时间',
  occurrence: '发生时刻',
};

/** A compact attribute table with expandable source and rule details. */
export const AttributeDataGrid = ({
  entity,
  graph,
  onOpenStudio,
  selectedAttribute = null,
}: AttributeDataGridProps) => {
  const selectedRow = useRef<HTMLTableRowElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    selectedRow.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedAttribute]);

  const entries = useMemo(
    () =>
      buildKeyDataLedger(graph.document).entries.filter(
        (entry) => entry.entityRef === entity.id,
      ),
    [graph.document, entity.id],
  );
  const decisionOwed = entries.filter((entry) => entry.decisionOwed).length;
  const entryByAttribute = useMemo(
    () => new Map(entries.map((entry) => [entry.attribute, entry])),
    [entries],
  );
  const attributes = entity.attributes ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-workbench-muted">
        <span data-ledger-summary={entity.id}>
          核心要素 {entries.length} 项
          {decisionOwed > 0 ? ` · ${decisionOwed} 项依据待确认` : ''}
        </span>
        {onOpenStudio !== undefined && attributes.length > 0 ? (
          <button
            type="button"
            onClick={onOpenStudio}
            className="rounded border border-evidence-line px-1.5 py-0.5 hover:border-evidence-accent hover:text-evidence-ink"
            title="查看核心要素台账（Alt+L）"
          >
            ⛶ 要素台账
          </button>
        ) : null}
      </div>
      {attributes.length === 0 ? (
        <p className="text-workbench-muted">未声明业务属性</p>
      ) : (
        <div className="overflow-hidden rounded border border-evidence-line bg-white">
          <table className="w-full table-fixed border-collapse text-left text-[10px]">
            <caption className="sr-only">{entity.label}的属性清单</caption>
            <thead className="bg-workbench-background text-workbench-label">
              <tr>
                <th scope="col" className="w-[42%] px-1.5 py-1 font-medium">
                  属性名
                </th>
                <th scope="col" className="px-1.5 py-1 font-medium">
                  业务名称 / 类型
                </th>
                <th scope="col" className="w-10 px-1.5 py-1 font-medium">
                  要素
                </th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((attribute) => {
                const {
                  name,
                  label,
                  required,
                  timeRole,
                  derivedByRuleRef,
                  keyData,
                  meaning,
                  valueType,
                } = attribute;
                const open = expanded.has(name);
                const selected = name === selectedAttribute;
                return (
                  <Fragment key={name}>
                    <tr
                      data-attribute-name={name}
                      ref={selected ? selectedRow : undefined}
                      aria-current={selected || undefined}
                      className={cn(
                        'border-t border-evidence-line/70 align-top',
                        selected
                          ? 'bg-evidence-active'
                          : open && 'bg-workbench-background',
                      )}
                    >
                      <th scope="row" className="px-1.5 py-1 font-normal">
                        <button
                          type="button"
                          aria-label={`${name} ${open ? '收起' : '展开'}`}
                          aria-expanded={open}
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (next.has(name)) next.delete(name);
                              else next.add(name);
                              return next;
                            })
                          }
                          className="flex min-h-6 w-full items-center gap-1 text-left text-evidence-ink hover:text-evidence-accent"
                        >
                          <span aria-hidden="true" className="shrink-0">
                            {open ? '▼' : '▶'}
                          </span>
                          <code className="wrap-anywhere">{name}</code>
                        </button>
                        <div className="flex flex-wrap items-center gap-1">
                          <ApiFieldBadge
                            attribute={attribute}
                            entityRef={entity.id}
                            graph={graph}
                          />
                          {timeRole !== undefined ? (
                            <span className="text-workbench-label">
                              {TIME_ROLE_LABELS[timeRole]}
                            </span>
                          ) : null}
                          {derivedByRuleRef !== undefined ? (
                            <span className="text-evidence-accent">派生</span>
                          ) : null}
                        </div>
                      </th>
                      <td className="px-1.5 py-1">
                        <p className="wrap-anywhere text-workbench-body">
                          {label}
                        </p>
                        <p className="wrap-anywhere text-workbench-muted">
                          <code>{valueType ?? 'string'}</code>
                          {required === true ? ' · 必填' : ''}
                        </p>
                      </td>
                      <td className="px-1.5 py-1 text-workbench-label">
                        {keyData === true ? '核心' : '—'}
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="border-t border-evidence-line bg-workbench-background px-2 py-1.5"
                        >
                          <div className="flex flex-col gap-1">
                            <p className="wrap-anywhere whitespace-pre-wrap text-workbench-body">
                              {meaning}
                            </p>
                            <KeyDataProvenanceView
                              entity={entity}
                              attribute={attribute}
                              graph={graph}
                              entry={entryByAttribute.get(name)}
                            />
                            <DerivedRuleSection
                              entity={entity}
                              graph={graph}
                              attribute={attribute}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
