import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorScreen } from './EditorScreen';
import { readyCanvas, readyProject } from '../../../tests/editorScreenFixture';

describe('EditorScreen stage navigation', () => {
  // The ledger is virtualised; jsdom reports a zero-height viewport and would
  // render none of its rows.
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 1200,
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  });

  it('switches the ledger from the sidebar without keeping the canvas mounted', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();

    fireEvent.change(screen.getByLabelText('密度'), {
      target: { value: 'simplified' },
    });
    const rail = within(screen.getByRole('navigation', { name: '活动导轨' }));
    const ledger = rail.getByRole('button', { name: '总台账' });
    expect(screen.getAllByRole('button', { name: '总台账' })).toEqual([ledger]);
    expect(ledger).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(ledger);
    expect(ledger).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '全部实体 (8)' })).toBeChecked();
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeEnabled();
    expect(
      screen.queryByRole('complementary', { name: '实体目录' }),
    ).toBeNull();
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).toBeNull();

    fireEvent.click(ledger);
    expect(ledger).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
    expect(screen.getByLabelText('密度')).toHaveValue('simplified');
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('resets the zoom with Cmd+0 and fits the model with Shift+1', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    // React Flow keeps the pan/zoom transform on its viewport element.
    const world = () =>
      container.querySelector('.react-flow__viewport') as HTMLElement;

    fireEvent.keyDown(window, { key: '0', metaKey: true });
    await waitFor(() => expect(world().style.transform).toContain('scale(1)'));

    const reset = world().style.transform;
    fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });
    await waitFor(() => expect(world().style.transform).not.toBe(reset));
  });

  it('removes the outline and split controls and their old shortcuts', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();

    expect(screen.queryByRole('button', { name: '业务结构' })).toBeNull();
    expect(screen.queryByRole('button', { name: /分屏/ })).toBeNull();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 'v' });
    for (const code of ['Digit3', 'Digit4', 'Digit5']) {
      fireEvent.keyDown(window, { code, altKey: true });
    }

    expect(screen.queryByLabelText('搜索业务对象')).toBeNull();
    expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull();
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
    expect(screen.queryByLabelText('副视口')).toBeNull();
    expect(
      container.querySelectorAll('[data-region="canvas-viewport"]'),
    ).toHaveLength(1);
  });

  it('opens diagnostics from the ledger and returns to the graph for graph-side rail tools', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    const ledger = screen.getByRole('button', { name: '总台账' });
    fireEvent.click(ledger);
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(await screen.findByLabelText('门禁问题面板')).toBeVisible();
    expect(ledger).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(
      screen.getByRole('complementary', { name: '实体目录' }),
    ).toBeVisible();
    expect(ledger).toHaveAttribute('aria-pressed', 'false');
  });

  it('exports just the filtered ledger rows through the top bar', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    const topBar = screen.getByRole('banner', { name: '工作台顶栏' });
    expect(topBar).toHaveTextContent('领域总台账 (Domain Model Ledger)');
    expect(
      within(topBar).queryByRole('button', { name: '保存模型' }),
    ).toBeNull();
    const exportButton = within(topBar).getByRole('button', {
      name: '导出 CSV',
    });
    const search = screen.getByRole('searchbox', {
      name: '过滤实体或 CEL 规则',
    });
    fireEvent.change(search, { target: { value: 'non-existing-entity' } });
    expect(exportButton).toBeDisabled();
    fireEvent.change(search, { target: { value: 'evidence.request' } });

    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:ledger-test';
    });
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL,
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    try {
      fireEvent.click(exportButton);
      expect(click).toHaveBeenCalledOnce();
      const [blob] = blobs;
      if (blob === undefined) throw new Error('Missing CSV Blob');
      const csv = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      expect(csv).toContain('"evidence.request"');
      expect(csv).not.toContain('"evidence.contract"');
      expect(csv.trim().split('\r\n')).toHaveLength(2);
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('walks from a ledger row back to the same object on the canvas', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    await screen.findByLabelText('领域模型总台账');

    fireEvent.click(
      screen.getByLabelText('在画布中定位 采购协议（Procurement Contract）'),
    );

    await waitFor(() =>
      expect(
        container.querySelector('[data-region="canvas-viewport"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText('业务旅程画布')).toBeInTheDocument();
    // The breadcrumb names the object the table was reading.
    expect(
      screen.getAllByText('采购协议（Procurement Contract）').length,
    ).toBeGreaterThan(0);
  });
});
