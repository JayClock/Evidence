import { useState } from 'react';
import type { AttributeAST } from '@evidence-poc/evidence-schema';
import {
  translateBusinessFormula,
  type CelCandidate,
} from '@evidence-poc/evidence-model-core';
import { CelCodeMirrorViewer } from './CelCodeMirrorViewer';

export interface CelFormulaBarProps {
  entityLabel: string;
  /** Selected field; null until the ledger has a row to point at. */
  attribute: AttributeAST | null;
  /** Current expression of the attribute's derivation rule, when it has one. */
  ruleExpression: string | null;
  candidates: readonly CelCandidate[];
}

/** The selected field’s business formula and highlighted CEL source. */
export const CelFormulaBar = ({
  entityLabel,
  attribute,
  ruleExpression,
  candidates,
}: CelFormulaBarProps) => {
  const [sourceMode, setSourceMode] = useState(false);
  const formula =
    ruleExpression === null
      ? null
      : translateBusinessFormula(ruleExpression, candidates);
  if (attribute === null) {
    return (
      <div className="flex h-9 items-center gap-2 border-b border-evidence-line bg-[#f6f8fa] px-3 text-[11px] text-[#6e7781]">
        <span className="font-mono font-semibold text-evidence-muted">fx</span>
        <span>没有可查看的属性。</span>
      </div>
    );
  }

  return (
    <div className="border-b border-evidence-line bg-white">
      <div className="flex items-start gap-2 px-3 py-1.5">
        <div className="flex min-w-0 max-w-[45%] items-center gap-1.5 pt-1">
          <span className="font-mono text-[12px] font-semibold text-evidence-accent">
            fx
          </span>
          <span className="wrap-anywhere rounded bg-[#eef2f7] px-1.5 py-0.5 font-mono text-[10px] font-medium text-evidence-ink">
            {entityLabel}.{attribute.label}
          </span>
          <span className="text-[11px] text-[#8c959f]">=</span>
        </div>

        <div className="min-w-0 flex-1">
          {ruleExpression !== null ? (
            <>
              <div className="mb-1 flex gap-2 text-[11px]">
                <button
                  type="button"
                  aria-pressed={!sourceMode && formula?.supported === true}
                  disabled={formula?.supported !== true}
                  onClick={() => setSourceMode(false)}
                >
                  业务公式
                </button>
                <button
                  type="button"
                  aria-pressed={sourceMode || formula?.supported !== true}
                  onClick={() => setSourceMode(true)}
                >
                  CEL 源码
                </button>
              </div>
              {formula?.supported === false ? (
                <p className="text-[11px] text-evidence-muted">
                  {formula.reason}
                </p>
              ) : null}
              {!sourceMode && formula?.supported === true ? (
                <p className="wrap-anywhere whitespace-pre-wrap rounded border border-evidence-line bg-workbench-background p-2 text-[11px]">
                  {formula.tokens.map((token) => token.label).join('')}
                </p>
              ) : (
                <CelCodeMirrorViewer
                  value={ruleExpression}
                  candidates={candidates}
                  ariaLabel={`${attribute.name} 公式栏`}
                />
              )}
            </>
          ) : (
            <p className="rounded border border-dashed border-evidence-line bg-[#fbfbfc] px-2 py-1 text-[10px] text-[#8c959f]">
              {attribute.derivedByRuleRef === undefined
                ? '未声明派生规则。'
                : `派生规则未解析 · ${attribute.derivedByRuleRef}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
