import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createModelSession,
  updateRuleMutator,
} from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

import { RightInspector } from '../RightInspector';
const id = 'rule.quantity-invariant';
const expression = 'contract.quantity > 0';
const editorLabel = `${id} CEL 表达式`;

const setup = () => {
  const document = createDesktopFixture();
  const contract = document.entities.find(
    (entity) => entity.id === 'evidence.contract',
  )!;
  contract.sourceSnippet = { text: '采购数量应为正数。' };
  contract.attributes!.push({
    name: 'quantity',
    label: '采购数量',
    meaning: '合同约定采购数量。',
    valueType: 'int',
  });
  document.rules.push({
    type: 'rule',
    id,
    kind: 'invariant',
    label: '采购数量',
    description: '采购数量应为正数。',
    contextRef: 'context.procurement',
    resultType: 'bool',
    expression,
    bindings: {
      contract: { ref: 'evidence.contract' },
      otherAlias: { ref: 'evidence.contract' },
    },
  });
  const session = createModelSession({ document });
  const inspector = (nodeId = 'evidence.contract') => (
    <RightInspector
      graph={session.getGraph()}
      selection={{ nodeId, attributeName: null }}
    />
  );
  const view = render(inspector());
  const select = (nodeId?: string) => view.rerender(inspector(nodeId));
  return { session, select };
};

describe('entity invariants', () => {
  it('reads only bound invariants once, and shows only modeled provenance', () => {
    const { select } = setup();
    expect(screen.getAllByText(id)).toHaveLength(1);
    expect(screen.getByText('未记录定位信息')).toBeVisible();
    select('evidence.request');
    expect(screen.queryByRole('region', { name: '依据条款原文' })).toBeNull();
    expect(screen.getByText('未声明不变量')).toBeVisible();
  });

  it('shows the current expression without an editing or apply action', () => {
    const { session, select } = setup();
    const viewer = screen.getByRole('textbox', { name: editorLabel });
    expect(viewer).toHaveTextContent(expression);
    expect(viewer).toHaveAttribute('contenteditable', 'false');
    expect(
      screen.queryByRole('button', { name: /编辑 CEL|应用 CEL/ }),
    ).toBeNull();

    session.mutate((draft) =>
      updateRuleMutator(draft, id, { expression: 'contract.quantity > 2' }),
    );
    select();
    expect(viewer).toHaveTextContent('contract.quantity > 2');
  });
});
