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
    fireEvent.click(sheet.getByRole('button', { name: '预览变更' }));
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
