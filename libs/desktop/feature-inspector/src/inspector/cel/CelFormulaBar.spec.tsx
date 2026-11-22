import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CelFormulaBar } from './CelFormulaBar';

const props = {
  entityLabel: '付款确认',
  attribute: {
    name: 'total',
    label: '总金额',
    meaning: '总金额',
    valueType: 'decimal' as const,
  },
  ruleExpression: 'contract.price * 2',
  candidates: [
    {
      alias: 'contract',
      ref: 'contract',
      label: '采购合同',
      attributes: [
        { name: 'price', label: '单价', valueType: 'decimal' as const },
        { name: 'qty', label: '数量', valueType: 'int' as const },
      ],
    },
  ],
};
describe('business formula bar', () => {
  it('shows translated business labels as text and supports switching to read-only source', () => {
    render(<CelFormulaBar {...props} />);
    expect(screen.getByText(/采购合同.*单价.*×.*2/)).toBeVisible();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CEL 源码' }));
    expect(
      screen.getByRole('textbox', { name: 'total 公式栏' }),
    ).toHaveTextContent(props.ruleExpression);
  });
  it('keeps the source editor available for advanced expressions', () => {
    render(<CelFormulaBar {...props} ruleExpression="[1].map(x, x * 2)" />);
    expect(screen.getByText(/当前以 CEL 源码展示/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '业务公式' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'CEL 源码' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
