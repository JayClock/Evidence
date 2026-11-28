import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { storySnapshot } from '@evidence-poc/desktop-testing/story';
import {
  resolveStoryTraces,
  instantiateArchetypeMutator,
} from '@evidence-poc/evidence-model-core';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { EditorScreen } from './EditorScreen';
import {
  healthyReport,
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { readyCanvas, readyProject } from '../../../tests/editorScreenFixture';

describe('EditorScreen', () => {
  it('opens the context map, shows capabilities and drills into the domain scope', async () => {
    const document = createEmptyDomainModel();
    instantiateArchetypeMutator(document, {
      archetypeId: 'periodic-subscription',
      idPrefix: 'membership',
      variationValues: {
        subjectLabel: '会员内容',
        customerLabel: '订阅者',
        operatorLabel: '专栏方',
        providerLabel: '支付方',
      },
    });
    const api = readyProject(document);
    const { container } = render(
      <EditorScreen rootPath="/models/membership" />,
    );
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '上下文地图' }));
    let map = await screen.findByRole('region', { name: '上下文地图' });
    fireEvent.click(within(map).getByText(/依赖与插槽/));
    expect(
      within(map).getByText('订阅框架协议依赖订阅支付协议：订阅到账凭证'),
    ).toBeInTheDocument();
    fireEvent.click(within(map).getByRole('button', { name: '本期扣款确认' }));
    await readyCanvas();
    expect(
      container.querySelector(
        '[data-node-id="membership.external.confirmation"][aria-pressed="true"]',
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '上下文地图' }));
    map = await screen.findByRole('region', { name: '上下文地图' });
    fireEvent.click(within(map).getByText(/依赖与插槽/));
    fireEvent.click(
      within(within(map).getByRole('list', { name: '按上下文下钻' })).getByRole(
        'button',
        { name: '会员内容领域' },
      ),
    );
    await readyCanvas();
    expect(
      container.querySelector('[data-canvas-mode="expanded"]'),
    ).not.toBeNull();
    expect(screen.queryByRole('region', { name: '上下文地图' })).toBeNull();
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('uses deliberate zoom to enter the overview without changing the initial fit mode', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    expect(screen.queryByRole('region', { name: '上下文地图' })).toBeNull();
    await waitFor(() => {
      const reset = screen.getByRole('button', { name: /当前缩放/ });
      expect(Number(reset.textContent?.replace('%', ''))).toBeLessThan(35);
    });
    fireEvent.click(screen.getByRole('button', { name: '缩小' }));
    await screen.findByRole('region', { name: '上下文地图' });
    fireEvent.click(screen.getByRole('button', { name: '返回履约画布' }));
    await readyCanvas();
    expect(screen.queryByRole('region', { name: '上下文地图' })).toBeNull();
  });

  it('previews a template without writing and applies it as one undoable edit', async () => {
    const api = readyProject(createEmptyDomainModel());
    const { container } = render(
      <EditorScreen rootPath="/models/membership" />,
    );
    const trigger = await screen.findByRole('button', { name: '业务模式模板' });
    fireEvent.click(trigger);
    const sheet = within(
      await screen.findByRole('dialog', { name: '业务模式模板' }),
    );
    fireEvent.click(sheet.getByRole('radio', { name: '周期订阅与会员服务' }));
    expect(sheet.getByRole('list', { name: '模板权责骨架' })).toHaveTextContent(
      '订阅框架协议',
    );
    fireEvent.click(sheet.getByRole('button', { name: '配置变化点' }));
    for (const [label, value] of Object.entries({
      实例前缀: 'membership',
      核心标的物: '会员专栏',
      需求方: '读者',
      运营方: '专栏方',
      支撑能力提供方: '支付方',
    }))
      fireEvent.change(sheet.getByLabelText(new RegExp(label)), {
        target: { value },
      });
    fireEvent.click(sheet.getByRole('button', { name: '预览变更' }));
    expect(await sheet.findByText(/新增 \d+ 个模型对象/)).toBeInTheDocument();
    expect(
      container.querySelector('[data-node-id="membership.delivery.request"]'),
    ).toBeNull();
    fireEvent.click(sheet.getByRole('button', { name: '应用到画布' }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="membership.delivery.request"]'),
      ).not.toBeNull(),
    );
    expect(screen.queryByRole('dialog', { name: '业务模式模板' })).toBeNull();
    expect(api.calls.persistence.length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="membership.delivery.request"]'),
      ).toBeNull(),
    );
  });

  it('keeps journey geometry, selection and camera when toggling the ledger', async ({
    onTestFinished,
  }) => {
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    expect(
      container.querySelector('[data-milestone-stage="rfp"]'),
    ).not.toBeNull();
    const world = () =>
      container.querySelector('.react-flow__viewport') as HTMLElement;
    fireEvent.keyDown(window, { key: '0', metaKey: true });
    await waitFor(() => expect(world().style.transform).toContain('scale(1)'));
    fireEvent.click(
      container.querySelector('[data-node-id="evidence.request"]')!,
    );
    expect(screen.queryByRole('button', { name: /拓扑图/ })).toBeNull();
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="evidence.request"]'),
      ).toHaveClass('ring-2'),
    );
    expect(world().style.transform).toContain('scale(1)');
    const ledger = screen.getByRole('button', { name: '总台账' });
    fireEvent.click(ledger);
    await screen.findByLabelText('领域模型总台账');
    fireEvent.click(ledger);
    await waitFor(() => expect(world().style.transform).toContain('scale(1)'));
    expect(
      container.querySelector('[data-milestone-stage="rfp"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveClass('ring-2');
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('syncs scenario edits without a save button and can play the same scenario', async () => {
    const document = createDesktopFixture();
    document.stories.push({
      type: 'story',
      id: 'signing',
      title: '正常签约案例',
      kind: 'primary',
      steps: [
        {
          id: 'sign',
          sequence: 1,
          workObjectRef: 'evidence.contract',
          activity: '签约',
          asOf: '2026-01-01T00:00:00Z',
          actorRef: 'role.buyer',
          basedOn: [],
          values: { signed_at: '2025-12-31T00:00:00Z' },
        },
      ],
    });
    const api = readyProject(document);
    api.story.load = vi.fn(async ({ document, preferredFlowId }) =>
      storySnapshot(resolveStoryTraces(document!), preferredFlowId),
    );
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    expect(screen.getByText('业务旅程画布')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        container.querySelector('[data-swimlane-kind="lane"]'),
      ).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: '更多画布工具' }));
    fireEvent.click(screen.getByRole('button', { name: '业务场景推演' }));
    fireEvent.change(screen.getByLabelText('签署时间'), {
      target: { value: '2026-01-01T00:00:00Z' },
    });
    const submitted = api.calls.persistence.length;
    expect(
      api.calls.persistence.at(-1)?.document.stories[0]?.steps[0],
    ).toMatchObject({
      values: { signed_at: '2026-01-01T00:00:00Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: '放映当前场景' }));
    await waitFor(() =>
      expect(api.story.load).toHaveBeenCalledWith(
        expect.objectContaining({ preferredFlowId: 'signing' }),
      ),
    );
    expect(screen.queryByRole('dialog', { name: '业务场景推演' })).toBeNull();
    expect(screen.getByLabelText('选择业务流')).toHaveValue('signing');
    const details = screen.getByRole('region', { name: '业务故事' });
    expect(
      await within(details).findByRole('heading', { name: '正常签约案例' }),
    ).toBeVisible();
    expect(api.calls.persistence).toHaveLength(submitted);
  });
  it('shows the selected object’s source excerpt in the inspector', async () => {
    const document = createDesktopFixture();
    document.entities.find(
      (entity) => entity.id === 'evidence.request',
    )!.sourceSnippet = {
      text: '交货条款',
      source: 'contract',
      locator: '第 1 条',
    };
    installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document,
        issues: [],
      },
    });
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(
      container.querySelector('[data-node-id="evidence.request"]')!,
    );
    const excerpt = await screen.findByLabelText('依据条款原文');
    expect(excerpt).toHaveTextContent('交货条款');
    expect(excerpt).toHaveTextContent('第 1 条');
  });

  it('explains a missing project path instead of rendering an empty canvas', async () => {
    installDesktopApi();

    render(<EditorScreen rootPath="" />);

    expect(await screen.findByText(/缺少项目路径/)).toBeInTheDocument();
  });

  it('loads the source tree and draws the interactive canvas', async () => {
    readyProject();

    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );

    expect(await readyCanvas()).toBeInTheDocument();
    expect(
      container.querySelector('[data-node-id="evidence.contract"]'),
    ).not.toBeNull();
    expect(screen.getByText('业务对象 8')).toBeInTheDocument();
    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('访谈内容')).toBeNull();
    expect(
      within(screen.getByRole('navigation', { name: '活动导轨' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(3);
    expect(screen.getByText('履约连线 1')).toBeInTheDocument();
    expect(screen.getByText('上下文 2')).toBeInTheDocument();
  });

  it('slides the problems panel over the canvas with Alt+X', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    expect(screen.queryByLabelText('门禁问题面板')).toBeNull();
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });
    const stage = screen
      .getByLabelText('聚焦范围')
      .closest('[data-region="workspace-stage"]');
    expect(stage).toContainElement(
      await screen.findByLabelText('门禁问题面板'),
    );
    expect(
      screen.getByRole('region', { name: '实体属性检视' }),
    ).not.toContainElement(screen.getByLabelText('门禁问题面板'));
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });
    expect(screen.queryByLabelText('门禁问题面板')).toBeNull();
  });

  it('collapses and reopens the inspector without a tab switch', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    const pane = screen.getByRole('region', { name: '实体属性检视' });
    expect(
      within(pane).getByRole('heading', { name: '实体属性检视' }),
    ).toBeVisible();

    fireEvent.keyDown(window, { key: 'i', metaKey: true });
    expect(pane).toHaveAttribute('inert');
    fireEvent.keyDown(window, { key: 'i', metaKey: true });
    expect(pane).not.toHaveAttribute('inert');
    expect(pane).toHaveTextContent('选择画布上的业务对象查看属性。');
  });

  it('opens the read-only ledger through Alt+L without dirtying the model or losing selection', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const node = container.querySelector<HTMLElement>(
      '[data-node-id="evidence.contract"]',
    )!;
    fireEvent.click(node);
    act(() => node.focus());
    const inspector = screen.getByRole('region', { name: '实体属性检视' });
    expect(within(inspector).getByText('只读')).toBeVisible();
    expect(
      inspector.querySelector(
        'input, textarea, select, [contenteditable="true"]',
      ),
    ).toBeNull();

    fireEvent.keyDown(node, { key: 'l', code: 'KeyL', altKey: true });
    const ledger = screen.getByRole('dialog', {
      name: /核心要素台账 · 采购协议/,
    });
    const attribute = within(ledger).getByRole('button', { name: 'signed_at' });
    fireEvent.click(attribute);
    expect(attribute).toHaveAttribute('aria-pressed', 'true');
    expect(
      ledger.querySelector('input, textarea, select, [contenteditable="true"]'),
    ).toBeNull();
    fireEvent.keyDown(attribute, { key: 'Escape' });
    await waitFor(() => expect(ledger).not.toBeInTheDocument());
    await waitFor(() => expect(node).toHaveFocus());
    expect(node).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTitle('有未保存修改')).toBeNull();
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('returns keyboard focus to the selected node without clearing selection', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const node = container.querySelector<HTMLElement>(
      '[data-node-id="evidence.contract"]',
    )!;
    fireEvent.click(node);
    const pane = screen.getByRole('region', { name: '实体属性检视' });
    const back = within(pane).getByRole('button', { name: '返回画布' });
    back.focus();
    fireEvent.keyDown(back, { key: 'Escape' });
    expect(node).toHaveFocus();
    expect(node).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches the ledger and still opens rail tools with Mod+1, Mod+2 and Mod+4', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();

    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(await screen.findByLabelText('门禁问题面板')).toBeInTheDocument();

    const directory = screen.getByRole('button', { name: '实体目录' });
    expect(directory).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(
      screen.queryByRole('complementary', { name: '实体目录' }),
    ).toBeNull();
    fireEvent.click(directory);
    expect(
      screen.getByRole('complementary', { name: '实体目录' }),
    ).toBeVisible();
  });

  it('keeps the directory and canvas selection in sync, revealing nodes beyond the current scope', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const directory = within(
      screen.getByRole('complementary', { name: '实体目录' }),
    );
    expect(
      directory.getByRole('heading', { name: '实体目录 (8)' }),
    ).toBeVisible();
    expect(
      directory.getByRole('heading', { name: '角色 (Role)' }),
    ).toBeVisible();
    const contract = directory.getByRole('button', { name: /采购协议/ });
    const request = directory.getByRole('button', { name: /交付请求/ });
    const contractNode = container.querySelector(
      '[data-node-id="evidence.contract"]',
    );
    if (contractNode === null)
      throw new Error('Expected the contract on canvas');
    fireEvent.click(contractNode);
    expect(contract).toHaveAttribute('aria-current', 'true');
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    fireEvent.click(request);
    expect(request).toHaveAttribute('aria-current', 'true');
    expect(contract).not.toHaveAttribute('aria-current');
    expect(screen.getByLabelText('聚焦范围')).toHaveValue('');
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveClass('ring-2');
    expect(
      within(screen.getByRole('banner', { name: '工作台顶栏' })).getByText(
        /交付请求.*凭证/,
      ),
    ).toBeVisible();
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('keeps scope and view mode out of the document and undo history', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    fireEvent.change(screen.getByLabelText('密度'), {
      target: { value: 'standard' },
    });
    const world = container.querySelector(
      '.react-flow__viewport',
    ) as HTMLElement;
    const beforeKeys = world.style.transform;
    fireEvent.keyDown(screen.getByLabelText('聚焦范围'), { key: '+' });
    expect(world.style.transform).toBe(beforeKeys);
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="role.inventory"]'),
      ).toHaveStyle({ height: '156px' }),
    );
    // Undo has no history to walk, and the hub reports that instead of the
    // header, which no longer carries a greyed-out history button.
    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true });
    expect(await screen.findByRole('option', { name: /撤销/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull(),
    );
    expect(api.calls.persistence).toHaveLength(0);
    expect(screen.getByText('模型已写入')).toBeInTheDocument();
  });

  it('resets scope when quick search selects an out-of-scope object', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true });
    fireEvent.change(await screen.findByLabelText('搜索命令或业务对象'), {
      target: { value: '交付请求' },
    });
    fireEvent.click(screen.getByRole('option', { name: /交付请求/ }));
    expect(screen.getByLabelText('聚焦范围')).toHaveValue('');
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).not.toHaveAttribute('aria-disabled');
    expect(
      screen.getByText('交付请求（Delivery Request）', { selector: 'dd' }),
    ).toBeInTheDocument();
  });

  it('has no save button and offers a keyboard flush without rewriting a clean model', async () => {
    const api = readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    expect(screen.queryByRole('button', { name: '保存模型' })).toBeNull();
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    await waitFor(() => expect(api.calls.flushPersistence).toEqual(['editor']));
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('opens command navigation from the header', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.click(screen.getByRole('button', { name: '打开快速命令' }));
    expect(
      await screen.findByRole('dialog', { name: '快速命令' }),
    ).toBeInTheDocument();
  });

  it('opens the delivery hub from its chord', async () => {
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document: createDesktopFixture(),
        issues: [],
      },
      deliveryPreviewResult: {
        success: true,
        preview: {
          modelId: 'desktop-fixture',
          modelName: '桌面端夹具',
          modelVersion: '1.0.0',
          services: [
            {
              id: 'service.procurement',
              name: '商品采购',
              kind: 'fulfillment',
              contextRef: 'context.procurement',
              supplies: [],
              consumes: [],
              notes: '合同上下文。',
              routeCount: 4,
              routePrefixes: ['/product-procurements'],
              routes: [],
            },
          ],
          links: [],
          routes: [],
          limitations: [],
        },
      },
    });

    const project = api.projects;
    const originalPreview = project.deliveryLivePreview;
    const preview = vi
      .spyOn(project, 'deliveryLivePreview')
      .mockImplementation(async (input) => {
        const result = await originalPreview(input);
        return result.success && input.includeArtifacts
          ? {
              success: true,
              analysis: {
                ...result.analysis,
                artifacts: [
                  { path: 'openapi.json', content: '{"openapi":"3.1.0"}' },
                ],
              },
            }
          : result;
      });
    render(<EditorScreen rootPath="/models/procurement" />);

    await readyCanvas();
    fireEvent.keyDown(window, { code: 'KeyD', altKey: true });

    const hub = await screen.findByRole('dialog', { name: '交付与导出中枢' });
    expect(
      await within(hub).findByRole('button', { name: /OpenAPI 契约/ }),
    ).toBeInTheDocument();
    expect(preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArtifacts: true }),
    );
    fireEvent.click(within(hub).getByRole('button', { name: '契约全览' }));
    expect(within(hub).getByText('核心履约')).toBeInTheDocument();
    expect(api.calls.deliveryLivePreview).toContain('/models/procurement');
    expect(
      within(hub).queryByRole('button', { name: '导出当前草稿' }),
    ).toBeNull();
    fireEvent.keyDown(hub, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '交付与导出中枢' })).toBeNull();
    expect(screen.getByText('模型已写入')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true, shiftKey: true });
    const palette = await screen.findByRole('dialog', { name: '快速命令' });
    fireEvent.change(within(palette).getByRole('combobox'), {
      target: { value: '交付' },
    });
    fireEvent.click(
      within(palette).getByRole('option', { name: /打开交付契约/ }),
    );
    const reopened = await screen.findByRole('dialog', {
      name: '交付与导出中枢',
    });
    fireEvent.keyDown(reopened, { code: 'Digit2', altKey: true });
    fireEvent.click(
      within(reopened).getByRole('button', { name: '返回工作台' }),
    );
    expect(screen.getByText('业务旅程画布')).toBeInTheDocument();
  });

  it('shows a write failure and offers a retry without claiming success', async () => {
    const api = readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    act(() =>
      api.emitPersistenceStatus({
        persistenceId: 'editor',
        revision: 0,
        kind: 'failed',
        error: '磁盘不可写。',
      }),
    );
    expect(screen.getByText('磁盘不可写。')).toBeInTheDocument();
    expect(screen.queryByText('模型已写入')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试同步' }));
    await waitFor(() => expect(api.calls.flushPersistence).toEqual(['editor']));
  });

  it('surfaces an unreadable model tree', async () => {
    installDesktopApi({
      openResult: { success: false, error: 'model.json 无法解析。' },
    });

    render(<EditorScreen rootPath="/models/broken" />);

    expect(
      await screen.findByText('model.json 无法解析。'),
    ).toBeInTheDocument();
  });
});

describe('EditorScreen sensors', () => {
  it('shows the persisted verdict, opens the drawer and jumps to the finding', async () => {
    const api = readyProject();
    const report = healthyReport({
      passed: false,
      blockCount: 1,
      isStageGateReady: false,
      issues: [
        {
          issueId: 'check_fm:FM_INCONSISTENT:1',
          severity: 'block',
          source: 'check_fm',
          code: 'FM_INCONSISTENT',
          message: '采购协议缺少确认端',
          targetNodeId: 'evidence.contract#signed_at',
          suggestion: '补齐履约配对。',
        },
      ],
    });
    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByLabelText('聚焦范围');
    act(() =>
      api.emitArtifactStatus({
        persistenceId: 'editor',
        revision: 0,
        sourceDigest: 'disk',
        delivery: { kind: 'running' },
        acceptance: { kind: 'empty' },
        sensors: { kind: 'checked', report },
      }),
    );
    expect(await screen.findByText('阻塞 1')).toBeInTheDocument();
    expect(api.calls.triggerSensors).toEqual([]);

    fireEvent.click(screen.getByTitle('展开检查结果'));
    expect(await screen.findByLabelText('门禁问题面板')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    expect(screen.getByLabelText('领域模型总台账')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: '定位到 采购协议缺少确认端' }),
    );

    expect(
      await screen.findByText('采购协议（Procurement Contract）', {
        selector: 'dd',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
    expect(
      within(screen.getByRole('region', { name: '模型属性' }))
        .getByText('签署时间', { selector: 'p' })
        .closest('tr'),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('shows what an agent patch changed and reverts it on Escape', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.procurement' },
    });
    act(() =>
      api.agentMock.commitPatch({
        rationale: '新增审计员参与方',
        patches: [
          {
            op: 'add',
            path: '/entities/-',
            value: {
              type: 'entity',
              id: 'party.auditor',
              category: 'participant',
              kind: 'party',
              label: '审计员',
            },
          },
        ],
      }),
    );

    expect(await screen.findByLabelText('AI 补丁复核')).toBeInTheDocument();
    expect(screen.getByText('新增审计员参与方')).toBeInTheDocument();
    expect(screen.getByText('新增 1')).toBeInTheDocument();
    expect(
      await screen.findByLabelText('本次补丁新增 审计员'),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByLabelText('AI 补丁复核')).toBeNull();
    });
    expect(screen.queryByLabelText('本次补丁新增 审计员')).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText('聚焦范围')).toHaveValue(
        'context.procurement',
      ),
    );
  });

  it('keeps an agent patch when the modeler accepts it', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    act(() =>
      api.agentMock.commitPatch({
        rationale: '新增审计员参与方',
        patches: [
          {
            op: 'add',
            path: '/entities/-',
            value: {
              type: 'entity',
              id: 'party.auditor',
              category: 'participant',
              kind: 'party',
              label: '审计员',
            },
          },
        ],
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: '保留' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('AI 补丁复核')).toBeNull();
    });
    expect(screen.queryByLabelText('本次补丁新增 审计员')).toBeNull();
  });

  it('opens command search on Cmd+Shift+K and can launch canvas storming from it', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true });

    expect(
      await screen.findByRole('dialog', { name: '快速命令' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /铺设业务凭证/ }));

    await waitFor(() =>
      expect(screen.getByLabelText('业务场景')).toHaveFocus(),
    );
    expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull();
  });

  it('jumps to a business object from the command hub', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true });
    fireEvent.change(await screen.findByLabelText('搜索命令或业务对象'), {
      target: { value: '采购协议' },
    });
    fireEvent.click(screen.getByRole('option', { name: /采购协议/ }));

    // Selecting a target moves the shared selection, which the inspector reads.
    expect(
      await screen.findByText('采购协议（Procurement Contract）', {
        selector: 'dd',
      }),
    ).toBeInTheDocument();
  });

  it('returns from the ledger using the journey command', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true });
    fireEvent.click(await screen.findByRole('option', { name: /^业务旅程/ }));
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
  });
});
