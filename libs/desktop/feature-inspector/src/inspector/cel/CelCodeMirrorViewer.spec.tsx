import { EditorView } from '@codemirror/view';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CelCodeMirrorViewer } from './CelCodeMirrorViewer';

const ariaLabel = '凭证 CEL 表达式';

describe('CelCodeMirrorViewer', () => {
  it('is focusable for inspection but has no editable content or user change commands', () => {
    render(
      <CelCodeMirrorViewer
        ariaLabel={ariaLabel}
        value="1 + 2"
        candidates={[]}
      />,
    );
    const content = screen.getByRole('textbox', { name: ariaLabel });
    expect(content).toHaveAttribute('contenteditable', 'false');
    expect(content).toHaveAttribute('aria-readonly', 'true');
    expect(content).toHaveAttribute('tabindex', '0');
    expect(EditorView.findFromDOM(content)?.state.readOnly).toBe(true);
    fireEvent.paste(content, { clipboardData: { getData: () => '9' } });
    fireEvent.keyDown(content, { key: 'Enter', metaKey: true });
    fireEvent.blur(content);
    expect(content).toHaveTextContent('1 + 2');
  });

  it('refreshes the same viewer when an upstream expression changes', () => {
    const { rerender } = render(
      <CelCodeMirrorViewer
        ariaLabel={ariaLabel}
        value="1 + 2"
        candidates={[]}
      />,
    );
    const content = screen.getByRole('textbox', { name: ariaLabel });
    const view = EditorView.findFromDOM(content);
    expect(view).not.toBeNull();
    rerender(
      <CelCodeMirrorViewer
        ariaLabel={ariaLabel}
        value="3 + 4"
        candidates={[]}
      />,
    );
    expect(EditorView.findFromDOM(content)).toBe(view);
    expect(content).toHaveTextContent('3 + 4');
  });
});
