import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Thread,
  ExternalThreadProvider,
  type ThreadMessageLike,
} from './index';

const mount = (messages: ThreadMessageLike[]) =>
  render(
    <ExternalThreadProvider
      adapter={{
        messages,
        convertMessage: (message: ThreadMessageLike) => message,
        onNew: vi.fn(),
      }}
    >
      <Thread />
    </ExternalThreadProvider>,
  );

describe('Thread', () => {
  it('renders Markdown and official reasoning/tool disclosures without activating model HTML or URLs', async () => {
    const view = mount([
      { id: 'user', role: 'user', content: '来源是？' },
      {
        id: 'assistant',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '对照台账' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'run_sensors',
            args: {},
            result: '通过',
          },
          {
            type: 'text',
            text: '**结果**：[网页](https://example.com) ![图像](https://example.com/p.png)\n\n<mark>HTML</mark>',
          },
        ],
      },
    ]);
    expect(
      await screen.findByText('结果', { selector: 'strong' }),
    ).toBeVisible();
    expect(screen.getByText('网页')).not.toHaveAttribute('href');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(view.container.querySelector('mark')).toBeNull();
    const reasoning = screen.getByRole('button', { name: /Reasoning/ });
    expect(reasoning.closest('[data-slot="reasoning-root"]')).toHaveAttribute(
      'data-variant',
      'ghost',
    );
    expect(reasoning).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(reasoning);
    expect(await screen.findByText('对照台账')).toBeVisible();
    const toolGroup = view.container.querySelector<HTMLElement>(
      '[data-slot="tool-group-trigger"]',
    );
    if (toolGroup) fireEvent.click(toolGroup);
    expect(await screen.findByText('run_sensors')).toBeVisible();
  });
});
