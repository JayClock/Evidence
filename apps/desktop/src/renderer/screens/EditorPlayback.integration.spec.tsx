import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StoryInvalidatedEvent } from '@evidence-poc/desktop-contracts/story';
import {
  createDesktopStoryFixture,
  storySnapshot,
} from '@evidence-poc/desktop-testing/story';
import {
  collectFlowScenarios,
  recordBreachOutcomeMutator,
} from '@evidence-poc/evidence-model-core';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { EditorScreen } from './EditorScreen';
import { projectSummary } from '@evidence-poc/desktop-testing/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { readyCanvas, readyProject } from '../../../tests/editorScreenFixture';

describe('Editor playback', () => {
  it('plays on the same canvas and adopts external edits after a reload', async () => {
    const api = readyProject(createDesktopStoryFixture());
    api.story.load = vi.fn(async () => storySnapshot());
    let invalidate: (event: StoryInvalidatedEvent) => void = () => undefined;
    const unsubscribe = vi.fn();
    api.story.onInvalidated = (listener) => {
      invalidate = listener;
      return unsubscribe;
    };
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    expect(api.story.load).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    const canvas = container.querySelector('[data-region="canvas-viewport"]');
    const launch = screen.getByRole('button', { name: '放映业务流' });
    expect(
      screen.getByRole('complementary', { name: '实体目录' }),
    ).toBeVisible();
    expect(launch).not.toHaveAttribute('aria-pressed');
    fireEvent.click(launch);
    expect(screen.getByText('业务旅程画布')).toBeInTheDocument();
    expect(container.querySelector('[data-region="canvas-viewport"]')).toBe(
      canvas,
    );
    expect(screen.queryByLabelText('副视口')).toBeNull();
    const details = screen.getByRole('region', { name: '业务故事' });
    expect(details).toBeVisible();
    expect(
      screen.queryByRole('complementary', { name: '实体目录' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: '实体目录' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('region', { name: '实体属性检视' })).toBeNull();
    expect(
      await within(details).findByText('采购方签署《采购协议》。'),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: /^交付请求（Delivery Request）/ }),
    );
    expect(
      within(details).getByText(
        '供货方要求采购方验收交付成果（《交付请求》）。',
      ),
    ).toBeVisible();
    expect(container.querySelector('[data-id="role.buyer"]')).toHaveClass(
      'evidence-story-role',
    );
    expect(container.querySelector('[data-id="evidence.request"]')).toHaveClass(
      'evidence-story-active',
    );
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).not.toHaveAttribute('aria-disabled');
    const document = createDesktopStoryFixture();
    document.entities.find(({ id }) => id === 'evidence.contract')!.label =
      '外部更新采购协议';
    api.projects.open = vi.fn(async () => ({
      success: true as const,
      project: projectSummary(),
      document,
      issues: [],
    }));
    act(() => {
      api.emitPersistenceStatus({
        persistenceId: 'editor',
        revision: 0,
        kind: 'conflict',
        error: '外部源文件已更新',
      });
      invalidate({ rootPath: '/models/procurement' });
    });
    expect(
      container.querySelector('[data-node-id="evidence.contract"]'),
    ).not.toHaveTextContent('外部更新采购协议');
    fireEvent.click(screen.getByRole('button', { name: '从磁盘重载' }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="evidence.contract"]'),
      ).toHaveTextContent('外部更新采购协议'),
    );
    await waitFor(() =>
      expect(screen.getByText('步骤 2/3：交付请求')).toBeInTheDocument(),
    );
    expect(api.story.load).toHaveBeenLastCalledWith(
      expect.objectContaining({ document }),
    );
    expect(
      container.querySelector('[data-node-id="evidence.contract"]'),
    ).toHaveAttribute('data-story-step', 'completed');
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveAttribute('data-story-step', 'active');
    expect(screen.getByRole('slider', { name: '业务时间' })).toHaveAttribute(
      'aria-valuetext',
      '2026-11-11 08:00:00.000 UTC',
    );
    const camera = container.querySelector<HTMLElement>(
      '.react-flow__viewport',
    )!;
    const transform = camera.style.transform;
    fireEvent.click(within(details).getByRole('button', { name: '返回画布' }));
    expect(camera.style.transform).toBe(transform);
    expect(container.querySelector('[data-region="canvas-viewport"]')).toBe(
      canvas,
    );
    expect(screen.getByRole('button', { name: '放映业务流' })).toHaveFocus();
    expect(screen.queryByLabelText('业务流放映控制')).toBeNull();
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    expect(screen.getByRole('region', { name: '实体属性检视' })).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: '实体目录' }),
    ).toBeVisible();
    expect(unsubscribe).toHaveBeenCalled();
    expect(container.querySelector('.evidence-story-active')).toBeNull();
    expect(screen.getByLabelText('聚焦范围')).toHaveValue('context.catalog');
  });

  it('opens playback on the selected canvas example and follows a node into its own flow', async () => {
    const document = createDesktopStoryFixture();
    const request = document.entities.find(
      ({ id }) => id === 'evidence.request',
    );
    if (!request) throw new Error('Missing request fixture');
    document.entities.push({
      ...request,
      id: 'request.refund',
      label: '退款请求',
      examples: [
        {
          label: '退还定金',
          value: {},
          test: {
            flow: '退款业务',
            actingRoleRef: 'role.supplier',
            asOf: '2026-11-12T08:00:00Z',
          },
        },
      ],
    });
    const api = readyProject(document);
    api.story.load = vi.fn(async ({ document, preferredFlowId }) =>
      storySnapshot(collectFlowScenarios(document!), preferredFlowId),
    );
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(
      screen.getByRole('button', {
        name: '交付确认（Delivery Confirmation）（履约确认）',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    expect(await screen.findByText('第 3/3 步')).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '推演与分支' }), {
      button: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: /^退款请求（/ }));
    expect(await screen.findByText('第 1/1 步')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '选择业务流' })).toHaveValue(
      '退款业务',
    );
    expect(
      screen.getByRole('tab', { name: '推演与分支', selected: true }),
    ).toBeVisible();
  });

  it('loads the adopted disk version for a new walkthrough', async () => {
    const api = readyProject();
    api.story.load = vi.fn(async () => storySnapshot());
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    const document = createDesktopStoryFixture();
    document.entities.find(({ id }) => id === 'evidence.contract')!.label =
      '进入前的外部修改';
    api.projects.open = vi.fn(async () => ({
      success: true as const,
      project: projectSummary(),
      document,
      issues: [],
    }));
    act(() =>
      api.emitPersistenceStatus({
        persistenceId: 'editor',
        revision: 0,
        kind: 'conflict',
        error: '外部源文件已更新',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '从磁盘重载' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '放映业务流' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    await waitFor(() => expect(api.story.load).toHaveBeenCalledOnce());
    expect(api.story.load).toHaveBeenCalledWith(
      expect.objectContaining({ document }),
    );
  });

  it('explains why playback is unavailable without a flow or request', async () => {
    const api = readyProject(createEmptyDomainModel());
    api.story.load = vi.fn();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    expect(screen.getByRole('button', { name: '放映业务流' })).toBeDisabled();
    expect(screen.getByText(/当前模型暂无业务流或履约请求/)).toBeVisible();
    expect(api.story.load).not.toHaveBeenCalled();
  });

  it('rehearses a request locally, then preserves its clock when an explicit handoff is submitted for review', async () => {
    const document = createDesktopFixture();
    recordBreachOutcomeMutator(document, {
      requestRef: 'evidence.request',
      condition: '请求过期且未交付',
      breachRule: {
        id: 'rule.delivery-timeout',
        label: '未按期交付',
        description: '未在期限内取得交付确认。',
        bindings: {
          request: { ref: 'evidence.request' },
          confirmations: { ref: 'evidence.confirmation', cardinality: 'many' },
          now: { type: 'timestamp' },
        },
        expression:
          'now > request.expired_at && !confirmations.exists(c, c.confirmed_at <= request.expired_at)',
      },
      outcome: {
        kind: 'terminal_escalation',
        remedyKind: 'arbitration',
        handoff: { id: 'evidence.arbitration', label: '仲裁移交' },
      },
    });
    const api = readyProject(document);
    api.story.load = vi.fn(async () => storySnapshot([]));
    api.story.enrichStep = vi.fn(async () => null);
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    const hours = await screen.findByRole('spinbutton', {
      name: '假设窗口（小时）',
    });
    expect(hours).toHaveValue(null);
    expect(screen.queryByRole('slider', { name: '业务时间' })).toBeNull();
    fireEvent.change(hours, { target: { value: '8' } });
    const slider = screen.getByRole('slider', { name: '业务时间' });
    expect(slider).toHaveAccessibleName('业务时间');
    fireEvent.change(slider, { target: { value: String(8 * 3_600_000 + 1) } });
    const details = within(screen.getByRole('region', { name: '业务故事' }));
    expect(
      details.getByRole('tab', { name: '故事剧本', selected: true }),
    ).toBeVisible();
    fireEvent.mouseDown(details.getByRole('tab', { name: '推演与分支' }), {
      button: 0,
    });
    expect(
      details.getByRole('tab', { name: '推演与分支', selected: true }),
    ).toBeVisible();
    expect(details.getByText(/违约条件成立/)).toBeVisible();
    expect(
      details.getByText('模型中的处置选项（未发生）：仲裁移交'),
    ).toBeVisible();
    expect(details.queryByRole('article', { name: '业务单据' })).toBeNull();
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).not.toHaveAttribute('data-story-step');
    expect(api.story.enrichStep).not.toHaveBeenCalled();
    expect(api.calls.persistence).toHaveLength(0);
    const expectedClock = slider.getAttribute('aria-valuetext');
    expect(details.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    fireEvent.click(details.getByRole('button', { name: '固化违约分支…' }));
    const form = details.getByRole('form', { name: '固化违约分支' });
    fireEvent.change(within(form).getByLabelText('已确认的触发条件'), {
      target: { value: '到期仍未交付且协商失败' },
    });
    fireEvent.click(within(form).getByRole('radio', { name: '启动终极救济' }));
    fireEvent.change(within(form).getByLabelText('救济方式'), {
      target: { value: 'lawsuit' },
    });
    fireEvent.click(within(form).getByRole('button', { name: '保存救济分支' }));
    const review = await details.findByRole('region', { name: '违约分支复核' });
    expect(
      await details.findByText(/模型中的处置选项.*诉讼移交凭证/),
    ).toBeVisible();
    expect(screen.getByRole('slider', { name: '业务时间' })).toHaveAttribute(
      'aria-valuetext',
      expectedClock,
    );
    expect(hours).toHaveValue(8);
    fireEvent.click(within(review).getByRole('button', { name: '撤销补丁' }));
    await waitFor(() =>
      expect(api.calls.persistence.at(-1)?.document).toEqual(document),
    );
    expect(screen.getByRole('region', { name: '业务故事' })).toBeVisible();
    expect(
      details.queryByRole('button', { name: '在画布查看「诉讼移交凭证」' }),
    ).toBeNull();
  });

  it('opens a collapsed rail from the command palette and exits from the rail with one Escape', async () => {
    const api = readyProject(createDesktopStoryFixture());
    api.story.load = vi.fn(async () => storySnapshot());
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const node = container.querySelector('[data-node-id="evidence.contract"]')!;
    fireEvent.click(screen.getByRole('button', { name: '实体目录' }));
    fireEvent.click(node);
    const inspector = screen.getByRole('region', { name: '实体属性检视' });
    fireEvent.keyDown(node, { key: 'i', metaKey: true });
    expect(inspector).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: '打开快速命令' }));
    fireEvent.click(await screen.findByRole('option', { name: /放映业务流/ }));
    const details = screen.getByRole('region', { name: '业务故事' });
    expect(details).not.toHaveAttribute('inert');
    expect(
      await within(details).findByRole('article', { name: '本幕叙事' }),
    ).toBeVisible();
    const back = within(details).getByRole('button', { name: '返回画布' });
    act(() => back.focus());
    fireEvent.keyDown(back, { key: 'Escape' });
    expect(screen.queryByLabelText('业务流放映控制')).toBeNull();
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    expect(screen.getByRole('region', { name: '实体属性检视' })).toBeVisible();
    expect(
      screen.queryByRole('complementary', { name: '实体目录' }),
    ).toBeNull();
    expect(node).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '放映业务流' })).toHaveFocus();
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('shows loading, failure and retry in the same details rail', async () => {
    const api = readyProject(createDesktopStoryFixture());
    api.story.load = vi
      .fn()
      .mockRejectedValueOnce(new Error('故事快照暂不可用'))
      .mockResolvedValue(storySnapshot());
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    const details = within(screen.getByRole('region', { name: '业务故事' }));
    expect(details.getByRole('status')).toHaveTextContent('正在读取业务流');
    expect(await details.findByRole('alert')).toHaveTextContent(
      '故事快照暂不可用',
    );
    fireEvent.click(details.getByRole('button', { name: '重试放映' }));
    expect(
      await details.findByRole('article', { name: '本幕叙事' }),
    ).toBeVisible();
    expect(details.queryByRole('alert')).toBeNull();
    expect(api.story.load).toHaveBeenCalledTimes(2);
  });

  it('stops automatic playback when entering the ledger and does not resume on return', async () => {
    const api = readyProject(createDesktopStoryFixture());
    api.story.load = vi.fn(async () => storySnapshot());
    const unsubscribe = vi.fn();
    api.story.onInvalidated = () => unsubscribe;
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    await screen.findByRole('slider', { name: '业务时间' });
    fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
    expect(screen.getByRole('button', { name: '暂停放映' })).toBeVisible();
    expect(screen.getByRole('region', { name: '业务故事' })).toBeVisible();
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(screen.getByLabelText('领域模型总台账')).toBeVisible();
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    expect(unsubscribe).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { code: 'Digit1', altKey: true });
    expect(screen.queryByLabelText('业务流放映控制')).toBeNull();
    expect(screen.getByRole('region', { name: '实体属性检视' })).toBeVisible();
    expect(screen.getByRole('button', { name: '放映业务流' })).toBeEnabled();
    expect(api.story.load).toHaveBeenCalledOnce();
  });
});
