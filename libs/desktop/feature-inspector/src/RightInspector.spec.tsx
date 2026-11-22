import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core';

import { RightInspector } from './RightInspector';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const setup = (nodeId: string | null) => {
  const session = createModelSession({ document: createDesktopFixture() });
  const renderInspector = () =>
    render(
      <RightInspector
        graph={session.getGraph()}
        selection={{ nodeId, attributeName: null }}
      />,
    );

  return { session, renderInspector };
};

describe('RightInspector', () => {
  it('summarizes key data and gate health until an entity is selected', () => {
    const { session } = setup(null);
    const { rerender } = render(
      <RightInspector
        graph={session.getGraph()}
        selection={{ nodeId: null, attributeName: null }}
        gateReport={{ blockCount: 2, warnCount: 3, isStageGateReady: false }}
      />,
    );
    const ledger = screen.getByRole('region', { name: '核心要素台账' });
    expect(ledger).toHaveTextContent('依据待确认');
    expect(ledger).toHaveTextContent('按公式计算');
    expect(
      screen.getByRole('region', { name: '门禁健康度' }),
    ).toHaveTextContent('未就绪 · 阻塞 2 · 警告 3');
    rerender(
      <RightInspector
        graph={session.getGraph()}
        selection={{ nodeId: 'evidence.request', attributeName: null }}
      />,
    );
    expect(screen.queryByRole('region', { name: '门禁健康度' })).toBeNull();
    expect(screen.getByRole('region', { name: '模型属性' })).toBeVisible();
  });

  it('renders the registry groups and the stable id read-only', () => {
    setup('evidence.request').renderInspector();

    expect(screen.getByText('基础信息')).toBeInTheDocument();
    expect(screen.getByText('责任锚定')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: '模型属性' }),
    ).toBeInTheDocument();
    expect(screen.getByText('evidence.request')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '要素' })).toBeVisible();
  });

  it('shows the entity name as text, not a writable field', () => {
    setup('evidence.contract').renderInspector();
    expect(
      screen.getByText('采购协议（Procurement Contract）', { selector: 'dd' }),
    ).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '业务名称' })).toBeNull();
  });

  it('shows declared derivation details when expanding an attribute', () => {
    const fixture = createDesktopFixture();
    fixture.entities = fixture.entities.map((entity) =>
      entity.id === 'evidence.contract' && entity.category === 'evidence'
        ? {
            ...entity,
            attributes: [
              ...(entity.attributes ?? []),
              {
                name: 'total_amount',
                label: '合同总额（Total Amount）',
                meaning: '按协议数量与单价派生。',
                valueType: 'money',
                keyData: true,
                derivedByRuleRef: 'rule.contract-total',
              },
            ],
          }
        : entity,
    );
    fixture.rules = [
      ...fixture.rules,
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
    ];

    const session = createModelSession({ document: fixture });

    render(
      <RightInspector
        graph={session.getGraph()}
        selection={{ nodeId: 'evidence.contract', attributeName: null }}
      />,
    );

    fireEvent.click(screen.getByLabelText('total_amount 展开'));
    const viewer = screen.getByRole('textbox', {
      name: 'total_amount CEL 表达式',
    });
    expect(viewer).toHaveTextContent('contract.quantity * 100');
    expect(viewer).toHaveAttribute('contenteditable', 'false');
    expect(session.canUndo()).toBe(false);
  });

  it('shows only the declared context for a role', () => {
    setup('role.buyer').renderInspector();
    expect(screen.getByText('所属上下文').parentElement).toHaveTextContent(
      'context.procurement',
    );
    expect(screen.queryByText('context.catalog')).toBeNull();
    expect(screen.queryByRole('combobox', { name: '所属上下文' })).toBeNull();
  });

  it('omits responsibility fields for roles', () => {
    setup('role.buyer').renderInspector();

    expect(screen.queryByText('责任锚定')).not.toBeInTheDocument();
    expect(screen.getByText('基础信息')).toBeInTheDocument();
  });

  it('opens the wide ledger sheet from the attribute grid', () => {
    setup('evidence.contract').renderInspector();

    fireEvent.click(screen.getByRole('button', { name: /^⛶ 要素台账$/ }));

    expect(
      screen.getByRole('dialog', { name: /^核心要素台账 · 采购协议/ }),
    ).toBeInTheDocument();
  });

  it('opens the ledger sheet from the inspector footer', () => {
    setup('evidence.contract').renderInspector();

    fireEvent.click(screen.getByRole('button', { name: /查看核心要素台账/ }));

    expect(
      screen.getByRole('dialog', { name: /^核心要素台账 · 采购协议/ }),
    ).toBeInTheDocument();
  });

  it('opens the ledger sheet with Alt+L', () => {
    setup('evidence.contract').renderInspector();

    render(<input aria-label="其他面板输入" />);
    fireEvent.keyDown(screen.getByLabelText('其他面板输入'), {
      key: 'l',
      altKey: true,
      code: 'KeyL',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'l', altKey: true, code: 'KeyL' });

    expect(
      screen.getByRole('dialog', { name: /^核心要素台账 · 采购协议/ }),
    ).toBeInTheDocument();
  });

  it('rejects an unknown selection without crashing', () => {
    setup('evidence.missing').renderInspector();

    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();
  });
});
