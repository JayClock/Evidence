import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  cn,
} from '@evidence-poc/desktop-ui-kit';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import {
  buildKeyDataLedger,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';
import { CelFormulaBar } from './cel/CelFormulaBar';
import { useCelRuleCandidates } from './useCelRuleCandidates';

export interface KeyDataLedgerSheetProps {
  entity: EntityAST;
  graph: DomainGraph;
  /** Attribute already selected on the canvas or in diagnostics. */
  initialAttribute?: string | null;
  onClose: () => void;
}

/** Wide, read-only view of one entity's fields and derivation rules. */
export const KeyDataLedgerSheet = ({
  entity,
  graph,
  initialAttribute = null,
  onClose,
}: KeyDataLedgerSheetProps) => {
  const attributes = entity.attributes ?? [];
  const [active, setActive] = useState(initialAttribute);
  const opener = useRef<HTMLElement | null>(null);
  const activeAttribute =
    attributes.find((attribute) => attribute.name === active) ??
    attributes[0] ??
    null;
  const activeRule =
    activeAttribute === null
      ? undefined
      : graph.derivationRule(entity.id, activeAttribute.name);
  const candidates = useCelRuleCandidates({
    graph,
    entityRef: entity.id,
    ruleId: activeRule?.id,
  });
  const entries = useMemo(
    () =>
      buildKeyDataLedger(graph.document).entries.filter(
        (entry) => entry.entityRef === entity.id,
      ),
    [entity.id, graph.document],
  );
  const decisionOwed = entries.filter((entry) => entry.decisionOwed).length;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        showClose={false}
        data-region="ledger-sheet"
        className="w-[55vw] min-w-[min(480px,100vw)] max-w-full p-0"
        onOpenAutoFocus={() => {
          const focused = document.activeElement;
          opener.current = focused instanceof HTMLElement ? focused : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (
            opener.current?.isConnected &&
            !opener.current.closest('[hidden], [inert]')
          ) {
            opener.current.focus({ preventScroll: true });
          }
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-evidence-line bg-workbench-background px-4 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <SheetTitle className="wrap-anywhere font-semibold">
              核心要素台账 · {entity.label}
            </SheetTitle>
            <code className="wrap-anywhere text-[10px] text-workbench-muted">
              {entity.id}
            </code>
            <span className="text-[11px] text-workbench-muted">
              {attributes.length} 个字段
            </span>
            <span
              className={cn(
                'text-[11px]',
                decisionOwed > 0
                  ? 'text-evidence-evidence'
                  : 'text-workbench-muted',
              )}
            >
              {decisionOwed > 0
                ? `${decisionOwed} 项依据待确认`
                : entries.length === 0
                  ? '未标记核心要素'
                  : '无待确认项'}
            </span>
          </div>
          <SheetDescription className="sr-only">
            只读查看属性、核心要素标记和派生公式。选择属性名称可在上方查看对应公式。
          </SheetDescription>
          <SheetClose asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
            >
              返回属性面板（Esc）
            </Button>
          </SheetClose>
        </header>

        <CelFormulaBar
          entityLabel={entity.label}
          attribute={activeAttribute}
          ruleExpression={activeRule?.expression ?? null}
          candidates={candidates}
        />

        <div
          role="region"
          aria-label="属性清单"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto"
        >
          <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left text-[11px]">
            <caption className="sr-only">{entity.label}的全部属性</caption>
            <thead className="sticky top-0 z-10 bg-workbench-background text-workbench-label">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  属性标识符
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  业务名称
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium whitespace-nowrap"
                >
                  数据类型
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium whitespace-nowrap"
                >
                  必填
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium whitespace-nowrap"
                >
                  核心要素
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  计算公式
                </th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((attribute) => {
                const isActive = attribute.name === activeAttribute?.name;
                const rule = graph.derivationRule(entity.id, attribute.name);
                return (
                  <tr
                    key={attribute.name}
                    data-ledger-row={attribute.name}
                    data-selected={isActive}
                    className={cn(
                      'align-middle *:border-t *:border-evidence-line/60',
                      isActive ? 'bg-evidence-active' : 'bg-white',
                    )}
                  >
                    <th
                      scope="row"
                      className="sticky start-0 max-w-40 bg-inherit px-3 py-2 font-normal"
                    >
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setActive(attribute.name)}
                        className="min-h-6 wrap-anywhere text-left font-mono font-medium text-evidence-accent hover:underline"
                      >
                        {attribute.name}
                      </button>
                    </th>
                    <td className="max-w-52 wrap-anywhere px-3 py-2 text-workbench-body">
                      {attribute.label}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {attribute.valueType ?? 'string'}
                    </td>
                    <td className="px-3 py-2">
                      {attribute.required === true ? '是' : '否'}
                    </td>
                    <td className="px-3 py-2">
                      {attribute.keyData === true ? '核心要素' : '普通属性'}
                    </td>
                    <td className="max-w-64 wrap-anywhere whitespace-pre-wrap px-3 py-2 font-mono text-workbench-muted">
                      {rule === undefined
                        ? (attribute.derivedByRuleRef ?? '—')
                        : rule.expression || '（空公式）'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
};
