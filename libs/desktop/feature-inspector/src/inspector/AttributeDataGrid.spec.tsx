import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { AttributeDataGrid } from './AttributeDataGrid';

/**
 * The shared fixture plus the two fields this file is about: a contract
 * parameter and a request amount whose provider nobody has decided yet.
 */
const createFixture = (): DomainModelDocument => {
  const document = createDesktopFixture();

  return {
    ...document,
    entities: document.entities.map((entity) => {
      if (entity.id === 'evidence.contract') {
        return {
          ...entity,
          attributes: [
            ...(entity.attributes ?? []),
            {
              name: 'quantity',
              label: '合同数量（Contract Quantity）',
              meaning: '合同约定的采购数量。',
              valueType: 'int' as const,
              keyData: true,
            },
          ],
        };
      }

      if (entity.id === 'evidence.request') {
        return {
          ...entity,
          attributes: [
            ...(entity.attributes ?? []),
            {
              name: 'penalty_amount',
              label: '违约金（Penalty）',
              meaning: '待补充提供方与算法。',
              valueType: 'money' as const,
              keyData: true,
            },
          ],
        };
      }

      return entity;
    }),
  };
};

const setup = (entityId: string) => {
  const graph = createDomainGraph(createFixture());
  render(
    <AttributeDataGrid entity={graph.getEntity(entityId)!} graph={graph} />,
  );
};

const expand = (attribute: string) => {
  fireEvent.click(screen.getByRole('button', { name: `${attribute} 展开` }));
};

describe('AttributeDataGrid', () => {
  it('shows attribute types and constraints without add, remove, or edit controls', () => {
    setup('evidence.contract');
    const row = within(screen.getByText('签署时间').closest('tr')!);
    expect(row.getByText('timestamp')).toBeVisible();
    expect(row.getByText(/必填/)).toBeVisible();
    expect(row.getByText('核心')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /添加属性|删除属性/ }),
    ).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('summarizes outstanding decisions without expanding a row', () => {
    setup('evidence.request');
    expect(screen.getByText('核心要素 3 项 · 2 项依据待确认')).toBeVisible();
  });

  it('shows a declared provider beneath the corresponding attribute', () => {
    setup('evidence.contract');
    expect(screen.queryByText('合同参数（Contract Term）')).toBeNull();
    expand('signed_at');
    expect(screen.getByText('合同参数（Contract Term）')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'signed_at 收起' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows an unresolved provider without offering to bind or clear it', () => {
    setup('evidence.request');
    expand('penalty_amount');
    expect(screen.getByText(/penalty_amount.*仍待决策/)).toBeVisible();
    expect(screen.getByText('未声明派生规则')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /绑定派生规则|取消核心要素标记/ }),
    ).toBeNull();
  });
});
