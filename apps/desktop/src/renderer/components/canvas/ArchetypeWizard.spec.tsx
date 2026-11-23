import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { ArchetypeWizard } from './ArchetypeWizard';

describe('ArchetypeWizard', () => {
  it('invalidates the preview after an external model change and preserves parameters for a new review', async () => {
    const onApply = vi.fn();
    const initial = createEmptyDomainModel();
    const { rerender } = render(
      <ArchetypeWizard document={initial} disabled={false} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '业务模式模板' }));
    const sheet = within(
      await screen.findByRole('dialog', { name: '业务模式模板' }),
    );
    fireEvent.click(sheet.getByRole('button', { name: '配置变化点' }));
    for (const [label, value] of Object.entries({
      实例前缀: 'trade',
      核心标的物: '运输服务',
      需求方: '发货人',
      运营方: '平台',
      支撑能力提供方: '托管方',
    }))
      fireEvent.change(sheet.getByLabelText(new RegExp(label)), {
        target: { value },
      });
    fireEvent.click(
      sheet.getByRole('checkbox', { name: '已确认主履约违约后的新补偿权责' }),
    );
    fireEvent.change(sheet.getByLabelText('已确认的补偿触发条件'), {
      target: { value: '未交付' },
    });
    fireEvent.change(sheet.getByLabelText('补偿请求名称'), {
      target: { value: '主张退款' },
    });
    fireEvent.change(sheet.getByLabelText('补偿确认名称'), {
      target: { value: '退款确认' },
    });
    fireEvent.change(sheet.getByLabelText('争议终点（可选）'), {
      target: { value: 'arbitration' },
    });
    fireEvent.change(sheet.getByLabelText('争议来自哪一项履约'), {
      target: { value: 'compensation' },
    });
    fireEvent.change(sheet.getByLabelText('已确认的争议触发条件'), {
      target: { value: '约定退款未完成' },
    });
    fireEvent.click(sheet.getByRole('button', { name: '预览变更' }));
    expect(sheet.getByText(/补偿履约 · 移交仲裁/)).toBeInTheDocument();
    const updated = createEmptyDomainModel({
      name: 'Changed outside the wizard',
    });
    rerender(
      <ArchetypeWizard document={updated} disabled={false} onApply={onApply} />,
    );
    expect(sheet.getByRole('status')).toHaveTextContent('模型已变化');
    expect(sheet.getByRole('button', { name: '应用到画布' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(sheet.getByRole('button', { name: '上一步' }));
    expect(sheet.getByLabelText('核心标的物')).toHaveValue('运输服务');
    fireEvent.click(sheet.getByRole('button', { name: '预览变更' }));
    fireEvent.click(sheet.getByRole('button', { name: '应用到画布' }));
    expect(onApply).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ base: updated }),
    );
  });
});
