import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';

import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { KeyDataLedgerSheet } from './KeyDataLedgerSheet';

/** The contract with one derived amount and one field whose provider is owed. */
const createFixture = (): DomainModelDocument => {
  const document = createDesktopFixture();

  return {
    ...document,
    entities: document.entities.map((entity) =>
      entity.id === 'evidence.contract' && entity.category === 'evidence'
        ? {
            ...entity,
            attributes: [
              ...(entity.attributes ?? []),
              {
                name: 'total_amount',
                label: '合同总额（Total Amount）',
                meaning: '按协议数量与单价派生。',
                valueType: 'money' as const,
                keyData: true,
                derivedByRuleRef: 'rule.contract-total',
              },
            ],
          }
        : entity,
    ),
    rules: [
      ...document.rules,
      {
        type: 'rule',
        id: 'rule.contract-total',
        kind: 'derivation',
        label: '合同总额派生',
        description: '按数量与单价派生合同总额。',
        contextRef: 'context.procurement',
        bindings: { contract: { ref: 'evidence.contract' } },
        expression: 'contract.quantity * 100',
        resultType: 'money',
        target: {
          entityRef: 'evidence.contract',
          attribute: 'total_amount',
        },
      },
    ],
  };
};

const setup = (
  entityId = 'evidence.contract',
  initialAttribute: string | null = null,
) => {
  const graph = createDomainGraph(createFixture());
  const onClose = vi.fn();
  render(
    <KeyDataLedgerSheet
      entity={graph.getEntity(entityId)!}
      graph={graph}
      initialAttribute={initialAttribute}
      onClose={onClose}
    />,
  );

  return { onClose };
};

describe('KeyDataLedgerSheet', () => {
  it('lists every field and reports when there are no outstanding decisions', () => {
    setup();

    expect(
      screen.getByRole('dialog', { name: /^核心要素台账 · 采购协议/ }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-ledger-row="signed_at"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-ledger-row="total_amount"]'),
    ).not.toBeNull();
    expect(screen.getByText('无待确认项')).toBeInTheDocument();
  });

  it('states how many decisions a request still owes', () => {
    setup('evidence.request');

    // `started_at` is a request formation input; `expired_at` still owes its
    // provider, and the header must say so before anyone reads a single row.
    expect(screen.getByText('1 项依据待确认')).toBeInTheDocument();
  });

  it('distinguishes an unmarked ledger from a reviewed one', () => {
    setup('context.catalog');

    expect(screen.getByText('未标记核心要素')).toBeVisible();
    expect(screen.queryByText('无待确认项')).not.toBeInTheDocument();
  });

  it('changes the formula preview without offering source or business edits', () => {
    setup();
    const derived = screen.getByRole('button', { name: 'total_amount' });
    fireEvent.click(derived);
    expect(derived).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'CEL 源码' }));
    const viewer = screen.getByRole('textbox', { name: 'total_amount 公式栏' });
    expect(viewer).toHaveTextContent('contract.quantity * 100');
    expect(viewer).toHaveAttribute('contenteditable', 'false');
    expect(viewer).toHaveAttribute('aria-readonly', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'signed_at' }));
    expect(screen.getByText('未声明派生规则。')).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens on the attribute the modeler was inspecting', () => {
    setup('evidence.contract', 'total_amount');

    expect(
      document.querySelector('[data-ledger-row="total_amount"]'),
    ).toHaveAttribute('data-selected', 'true');
    expect(
      document.querySelector('[data-ledger-row="signed_at"]'),
    ).toHaveAttribute('data-selected', 'false');
  });

  it('renders the type, required flag, and key-data status as static cells', () => {
    setup();
    const row = within(
      screen.getByRole('button', { name: 'signed_at' }).closest('tr')!,
    );
    expect(row.getByRole('cell', { name: 'timestamp' })).toBeVisible();
    expect(row.getByRole('cell', { name: '是' })).toBeVisible();
    expect(row.getByRole('cell', { name: '核心要素' })).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('slides in from the right instead of replacing the workspace', () => {
    setup();

    const sheet = document.querySelector('[data-slot="sheet-content"]');

    expect(sheet).toHaveAttribute('data-side', 'right');
    expect(sheet?.className).toContain('w-[55vw]');
  });

  it('closes on Escape', () => {
    const { onClose } = setup();

    fireEvent.keyDown(screen.getByRole('button', { name: /返回属性面板/ }), {
      key: 'Escape',
    });

    expect(onClose).toHaveBeenCalled();
  });
});
