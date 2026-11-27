import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PiConversation } from '../../state/usePiConversation';
import { EvidenceAgentThread } from './EvidenceAgentThread';

const mount = (messages: PiConversation['messages']) => {
  const submit = vi.fn(async () => ({ success: true as const }));
  const view = render(
    <EvidenceAgentThread
      nodeId="evidence.payment"
      canExploreVariation
      conversation={{
        messages,
        running: false,
        stopError: null,
        submit,
        stop: vi.fn(),
        reset: vi.fn(),
      }}
      patchReview={{
        review: null,
        record: vi.fn(),
        accept: vi.fn(),
        revert: vi.fn(),
      }}
      onFocusEntity={vi.fn()}
    />,
  );
  return { view, submit };
};

describe('EvidenceAgentThread', () => {
  it('does not send while composing Chinese text', async () => {
    const { submit } = mount([]);
    const composer = screen.getByRole('textbox', { name: '访谈内容' });
    fireEvent.change(composer, { target: { value: '业务问题' } });
    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(submit).toHaveBeenCalledExactlyOnceWith('业务问题', {
      nodeId: 'evidence.payment',
      inquiry: 'trace',
    });
  });

  it('opens a focused conversation about a variation without requesting a write', () => {
    const { submit } = mount([]);
    fireEvent.click(screen.getByRole('button', { name: '识别变化点' }));
    expect(submit).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('不创建角色或修改模型'),
      { nodeId: 'evidence.payment', inquiry: 'trace' },
    );
  });
});
