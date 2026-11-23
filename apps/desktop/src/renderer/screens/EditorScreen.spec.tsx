import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoryInvalidatedEvent } from '@evidence-poc/desktop-contracts/story';
import {
  createDesktopStoryFixture,
  storySnapshot,
} from '@evidence-poc/desktop-testing/story';

import {
  applyModelPatches,
  batchAddEvidenceMutator,
  collectFlowScenarios,
  createModelPatch,
  instantiateArchetypeMutator,
  recordBreachOutcomeMutator,
  splitEvidenceToPairMutator,
} from '@evidence-poc/evidence-model-core';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { EditorScreen } from './EditorScreen';
import {
  healthyReport,
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const readyProject = (document = createDesktopFixture()) =>
  installDesktopApi({
    openResult: {
      success: true,
      project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
      document,
      issues: [],
    },
  });

const readyCanvas = () => screen.findByText('业务旅程画布');

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
    expect(api.calls.save).toEqual([]);
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
    expect(api.calls.save).toEqual([]);
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
    expect(api.calls.save).toEqual([]);
  });

  it('opens swimlanes and saves a scenario into the story pipeline', async () => {
    const api = readyProject();
    api.projects.save = vi.fn(api.projects.save);
    api.story.load = vi.fn(async ({ document, preferredFlowId }) =>
      storySnapshot(collectFlowScenarios(document!), preferredFlowId),
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
    fireEvent.change(screen.getByLabelText('新场景名称'), {
      target: { value: '正常签约案例' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建空白场景' }));
    fireEvent.change(screen.getByLabelText('添加业务操作'), {
      target: { value: 'evidence.contract' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加步骤' }));
    fireEvent.change(screen.getByLabelText('业务时刻'), {
      target: { value: '2026-01-01T00:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('签署时间'), {
      target: { value: '2026-01-01T00:00:00Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并放映' }));
    await waitFor(() =>
      expect(api.story.load).toHaveBeenCalledWith(
        expect.objectContaining({ preferredFlowId: '正常签约案例' }),
      ),
    );
    expect(screen.queryByRole('dialog', { name: '业务场景推演' })).toBeNull();
    expect(screen.getByLabelText('选择业务流')).toHaveValue('正常签约案例');
    expect(api.projects.save).not.toHaveBeenCalled();
  });
  it('opens canvas storming from the directory without submitting an empty business example', async () => {
    const api = readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(
      within(screen.getByRole('complementary', { name: '实体目录' })).getByRole(
        'button',
        { name: '铺设凭证' },
      ),
    );
    expect(await screen.findByLabelText('业务场景')).toHaveValue('');
    expect(api.calls.prompt).toEqual([]);
    expect(api.calls.save).toEqual([]);
  });

  it('opens storming from the ledger with Cmd+K and restores canvas focus on Escape', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    expect(screen.getByLabelText('领域模型总台账')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
    expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull();
    const input = screen.getByLabelText('业务场景');
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('业务场景')).toBeNull();
    expect(
      container.querySelector('[data-region="canvas-stage"]'),
    ).toHaveFocus();
    expect(api.calls.prompt).toEqual([]);
  });

  it('keeps the draft when no evidence was produced and leaves the inspector untouched', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const contract = container.querySelector<HTMLElement>(
      '[data-node-id="evidence.contract"]',
    )!;
    fireEvent.click(contract);
    contract.focus();
    fireEvent.keyDown(contract, { key: 'k', ctrlKey: true });
    const input = screen.getByLabelText('业务场景');
    const inspector = screen.getByRole('region', { name: '实体属性检视' });
    expect(
      within(inspector).getByText('采购协议（Procurement Contract）', {
        selector: 'dd',
      }),
    ).toBeVisible();
    fireEvent.change(input, { target: { value: '追补一份交接记录' } });
    fireEvent.click(screen.getByRole('button', { name: /发起发散/ }));
    expect(await screen.findByText(/未生成新凭证/)).toBeVisible();
    expect(input).toHaveValue('追补一份交接记录');
    expect(api.calls.prompt[0]?.focus).toEqual({ nodeId: null });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(contract).toHaveFocus();
    expect(contract).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a clarification question beside the exact evidence card', async () => {
    const api = readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    const trace = await screen.findByRole('button', {
      name: /^澄清权责：交付请求/,
    });
    trace.focus();
    fireEvent.click(trace);
    const dialog = await screen.findByRole('dialog', {
      name: /^权责与交付澄清：交付请求/,
    });
    expect(trace).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByLabelText('访谈内容')).toHaveFocus();
    await waitFor(() =>
      expect(api.calls.prompt).toEqual([
        expect.objectContaining({
          focus: { nodeId: 'evidence.request', inquiry: 'trace' },
          text: expect.stringContaining('谁向谁主张什么'),
        }),
      ]),
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.calls.save).toEqual([]);
  });

  it('locates a radar finding and starts a focused read-only clarification only on request', async () => {
    const document = createDesktopFixture();
    document.entities.push({
      type: 'entity',
      category: 'evidence',
      kind: 'fulfillment_request',
      id: 'request.radar',
      label: '待澄清的稿件交付',
      attributes: [
        {
          name: 'due_at',
          label: '交稿期限',
          meaning: '最后交稿时刻',
          timeRole: 'deadline',
          valueType: 'timestamp',
        },
      ],
    });
    const api = readyProject(document);
    const answer = '按约定，逾期未交稿则移交仲裁，请记录。';
    const patch = createModelPatch(document, (draft) =>
      recordBreachOutcomeMutator(draft, {
        requestRef: 'request.radar',
        condition: '逾期未交稿',
        outcome: {
          kind: 'terminal_escalation',
          remedyKind: 'arbitration',
          handoff: { id: 'evidence.arbitration', label: '仲裁移交' },
        },
      }),
    );
    const submit = api.agent.prompt;
    api.agent.prompt = async (input) => {
      const result = submit(input);
      if (input.text === answer)
        api.agentMock.commitPatch(
          { rationale: '记录仲裁移交', patches: patch.patches },
          input.focus?.nodeId ?? undefined,
        );
      return result;
    };
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const trigger = screen.getByRole('button', { name: /^体检 \d+ 分/ });
    const initialSummary = trigger.textContent;
    const radar = async () => {
      fireEvent.click(trigger);
      return within(
        await screen.findByRole('dialog', { name: '8X Flow 模型体检' }),
      );
    };
    let drawer = await radar();
    fireEvent.click(drawer.getByRole('button', { name: '履约与异常处置' }));
    expect(drawer.queryByText(/待澄清的稿件交付.*责任角色/)).toBeNull();
    fireEvent.click(
      drawer.getByRole('button', { name: /定位.*稿件交付.*异常处置/ }),
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="request.radar"]'),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(api.calls.prompt).toEqual([]);
    drawer = await radar();
    fireEvent.click(
      drawer.getByRole('button', { name: /引导澄清.*稿件交付.*异常处置/ }),
    );
    const inquiry = within(
      await screen.findByRole('dialog', {
        name: 'What-If 异常推演：待澄清的稿件交付',
      }),
    );
    await waitFor(() =>
      expect(api.calls.prompt[0]).toMatchObject({
        focus: { nodeId: 'request.radar', inquiry: 'what-if', readOnly: true },
        text: expect.stringContaining('dead_end_request:request.radar'),
      }),
    );
    fireEvent.change(inquiry.getByLabelText('访谈内容'), {
      target: { value: answer },
    });
    await waitFor(() =>
      expect(inquiry.getByRole('button', { name: '发送' })).toBeEnabled(),
    );
    fireEvent.click(inquiry.getByRole('button', { name: '发送' }));
    await waitFor(() =>
      expect(api.calls.prompt[1]?.focus).toEqual({
        nodeId: 'request.radar',
        inquiry: 'what-if',
      }),
    );
    const undo = await inquiry.findByRole('button', { name: '撤销补丁' });
    await waitFor(() => expect(undo).toBeEnabled());
    expect(trigger.textContent).not.toBe(initialSummary);
    fireEvent.click(undo);
    await waitFor(() => expect(trigger.textContent).toBe(initialSummary));
    expect(api.calls.save).toEqual([]);
  });

  it('opens What-If from an unpaired card and pins the follow-up to that evidence', async () => {
    const document = createDesktopFixture();
    document.entities.push({
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      id: 'evidence.unpaired',
      label: '到货记录',
    });
    const api = readyProject(document);
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(
      await screen.findByRole('button', { name: '推演异常：到货记录' }),
    );
    const dialog = within(
      await screen.findByRole('dialog', { name: 'What-If 异常推演：到货记录' }),
    );
    await waitFor(() =>
      expect(api.calls.prompt[0]).toEqual(
        expect.objectContaining({
          focus: { nodeId: 'evidence.unpaired', inquiry: 'what-if' },
          text: expect.stringContaining('尚未识别请求'),
        }),
      ),
    );
    fireEvent.change(dialog.getByLabelText('访谈内容'), {
      target: { value: '超时则通知采购方。' },
    });
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: '发送' })).toBeEnabled(),
    );
    fireEvent.click(dialog.getByRole('button', { name: '发送' }));
    await waitFor(() =>
      expect(api.calls.prompt[1]?.focus).toEqual({
        nodeId: 'evidence.unpaired',
        inquiry: 'what-if',
      }),
    );
    expect(api.calls.save).toEqual([]);
  });

  it('reverts an already committed inquiry patch in place without closing the dialog', async () => {
    const api = readyProject();
    const submit = api.agent.prompt;
    api.agent.prompt = async (input) => {
      const result = submit(input);
      if (input.text === '请补记复核通知') {
        api.agentMock.commitPatch(
          {
            rationale: '补记复核通知',
            patches: [
              {
                op: 'add',
                path: '/entities/-',
                value: {
                  type: 'entity',
                  category: 'evidence',
                  kind: 'other_evidence',
                  id: 'evidence.notice',
                  label: '复核通知',
                },
              },
            ],
          },
          input.focus?.nodeId ?? undefined,
        );
      }
      return result;
    };
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(
      screen.getByRole('button', { name: /^推演异常：交付确认/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: /^What-If 异常推演：交付确认/,
    });
    const input = within(dialog).getByLabelText('访谈内容');
    fireEvent.change(input, { target: { value: '请补记复核通知' } });
    const send = within(dialog).getByRole('button', { name: '发送' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    const revert = await within(dialog).findByRole('button', {
      name: '撤销补丁',
    });
    await waitFor(() => expect(revert).toBeEnabled());
    expect(
      screen.getByRole('button', { name: '澄清权责：复核通知' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(revert).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('AI 补丁复核')).toBeNull();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: '澄清权责：复核通知' }),
      ).toBeNull(),
    );
    expect(api.calls.save).toEqual([]);
  });

  it('grows a saved-model canvas from stormed evidence through a real pair and a compensation branch', async () => {
    let document = createDesktopFixture();
    document.manifest.entryContextRefs = [];
    document.entities = [];
    document.relationships = [];
    document.rules = [];
    const api = installDesktopApi({
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
    const canvas = screen.getByRole('group', {
      name: '业务全生命周期四阶段泳道',
    });
    expect(canvas.querySelectorAll('[data-milestone-stage]')).toHaveLength(4);
    const apply = (
      requestId: string,
      build: Parameters<typeof createModelPatch>[1],
      focusNodeId?: string,
    ) => {
      const { patches } = createModelPatch(document, build);
      act(() =>
        api.agentMock.commitPatch(
          { rationale: requestId, patches },
          focusNodeId,
        ),
      );
      document = applyModelPatches(document, patches);
    };
    const example =
      '买家发出询价，摊主报价 20 元，双方订立口头合同，买家完成付款。';
    const confirmedPayment =
      '卖方向买方发起付款主张，到账回执确认完成。确认金额沿用请求上的金额，请补齐这项履约。';
    const remedyCondition = '超时之后按约定启动退款。';
    const prompt = api.agent.prompt;
    api.agent.prompt = async (input) => {
      const result = prompt(input);
      if (input.focus?.nodeId === null) {
        expect(input.text).toContain('batch_add_evidence_stubs');
        expect(input.text).toContain('不记录资料出处和摘录');
        expect(input.text).toContain(example);
        apply('头脑风暴', (draft) =>
          batchAddEvidenceMutator(draft, {
            evidences: [
              { id: 'evidence.enquiry', label: '询价', stage: 'rfp' },
              { id: 'evidence.quotation', label: '报价', stage: 'proposal' },
              { id: 'evidence.sale', label: '口头合同', stage: 'contract' },
              {
                id: 'evidence.payment',
                label: '付款凭证',
                stage: 'fulfillment',
                times: [
                  {
                    name: 'paid_at',
                    label: '付款时间',
                    meaning: '到账时刻',
                    timeRole: 'occurrence',
                  },
                ],
                keyData: [
                  {
                    name: 'amount',
                    label: '实付金额',
                    meaning: '实际付款金额',
                    valueType: 'decimal',
                  },
                ],
              },
            ],
          }),
        );
      } else if (
        input.focus?.inquiry === 'trace' &&
        input.text !== confirmedPayment
      ) {
        expect(input.text).toContain('谁向谁主张什么');
        api.agentMock.emitEvent({
          type: 'assistant-message',
          parts: [{ type: 'text', text: '**谁向谁主张付款**？' }],
          done: true,
        });
      } else if (
        input.focus?.inquiry === 'what-if' &&
        input.text !== remedyCondition
      ) {
        api.agentMock.emitEvent({
          type: 'assistant-message',
          parts: [{ type: 'text', text: '如果买方超时未付款怎么办？' }],
          done: true,
        });
      } else if (input.text === confirmedPayment) {
        apply(
          '已确认业务事实',
          (draft) =>
            splitEvidenceToPairMutator(draft, {
              evidenceRef: 'evidence.payment',
              request: {
                mode: 'create',
                id: 'request.payment',
                label: '付款申请',
              },
              inputAttributes: [
                {
                  confirmationAttribute: 'amount',
                  requestAttribute: 'requested_amount',
                },
              ],
            }),
          input.focus?.nodeId ?? undefined,
        );
      } else if (input.text === remedyCondition) {
        apply(
          '已确认业务事实',
          (draft) =>
            recordBreachOutcomeMutator(draft, {
              requestRef: 'request.payment',
              condition: remedyCondition,
              outcome: {
                kind: 'compensation_pair',
                request: { id: 'request.refund', label: '退款请求' },
                confirmation: { id: 'evidence.refund', label: '退款确认' },
              },
            }),
          input.focus?.nodeId ?? undefined,
        );
      }
      return result;
    };

    const inspector = screen.getByRole('region', { name: '实体属性检视' });
    const scenario = screen.getByLabelText('业务场景');
    expect(scenario.closest('[data-region="canvas-viewport"]')).not.toBeNull();
    expect(inspector).not.toContainElement(scenario);
    fireEvent.change(scenario, { target: { value: example } });
    fireEvent.keyDown(scenario, { key: 'Enter' });
    const trace = await screen.findByRole('button', {
      name: '澄清权责：付款凭证',
    });
    expect(
      screen.getByRole('button', { name: '推演异常：付款凭证' }),
    ).toBeInTheDocument();
    expect(api.calls.prompt).toHaveLength(1);
    expect(api.calls.save).toEqual([]);
    await waitFor(() => expect(screen.queryByLabelText('业务场景')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '保留' }));
    expect(
      within(inspector).getByRole('region', { name: '核心要素台账' }),
    ).toHaveTextContent('依据待确认');
    const positionedX = (id: string) =>
      Number(
        (
          container.querySelector(`[data-id="${id}"]`) as HTMLElement
        ).style.transform.match(/translate\(([-.\d]+)px,/)?.[1],
      );
    expect(positionedX('evidence.enquiry')).toBeLessThan(
      positionedX('evidence.quotation'),
    );
    expect(positionedX('evidence.quotation')).toBeLessThan(
      positionedX('evidence.sale'),
    );
    expect(positionedX('evidence.sale')).toBeLessThan(
      positionedX('evidence.payment'),
    );

    fireEvent.click(trace);
    const sourcing = await screen.findByRole('dialog', {
      name: '权责与交付澄清：付款凭证',
    });
    expect(
      await within(sourcing).findByText('谁向谁主张付款', {
        selector: 'strong',
      }),
    ).toBeVisible();
    const answer = async (dialog: HTMLElement, text: string) => {
      const panel = within(dialog);
      fireEvent.change(panel.getByLabelText('访谈内容'), {
        target: { value: text },
      });
      const send = panel.getByRole('button', { name: '发送' });
      await waitFor(() => expect(send).toBeEnabled());
      fireEvent.click(send);
    };
    await answer(sourcing, confirmedPayment);

    const request = await screen.findByRole('button', {
      name: '澄清权责：付款申请',
    });
    expect(request).toBeInTheDocument();
    expect(positionedX('request.payment')).toBeLessThan(
      positionedX('evidence.payment'),
    );
    expect(trace).toHaveAttribute('aria-expanded', 'true');
    expect(sourcing).toBeInTheDocument();
    expect(container.querySelector('[data-pair-link]')).not.toBeNull();
    expect(
      within(inspector).getByText('付款凭证', { selector: 'dd' }),
    ).toBeVisible();
    expect(within(inspector).getByText('发生时刻')).toBeVisible();
    expect(within(inspector).queryByLabelText('访谈内容')).toBeNull();
    expect(within(sourcing).getByLabelText('AI 补丁复核')).toHaveTextContent(
      '关联履约请求与确认',
    );
    const reply = within(sourcing).getByLabelText('访谈内容');
    fireEvent.keyDown(reply, { key: 'Enter', isComposing: true });
    expect(within(sourcing).getByLabelText('AI 补丁复核')).toBeInTheDocument();
    fireEvent.keyDown(reply, { key: 'Enter' });
    expect(within(sourcing).queryByLabelText('AI 补丁复核')).toBeNull();
    fireEvent.click(within(sourcing).getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: '推演异常：付款凭证' }));
    const whatIf = await screen.findByRole('dialog', {
      name: 'What-If 异常推演：付款凭证',
    });
    expect(
      screen.queryByRole('button', { name: '澄清权责：退款确认' }),
    ).toBeNull();
    expect(
      await within(whatIf).findByText('如果买方超时未付款怎么办？'),
    ).toBeVisible();
    await answer(whatIf, remedyCondition);

    expect(
      await screen.findByRole('button', { name: '澄清权责：退款确认' }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-corridor-kind="remedy_corridor"]'),
    ).not.toBeNull();
    expect(
      document.relationships.some(
        (edge) =>
          edge.flowKind === 'breach_compensation' &&
          edge.sourceRef === 'request.refund' &&
          edge.targetRef === 'request.payment',
      ),
    ).toBe(true);
    expect(api.calls.prompt.map(({ focus }) => focus)).toEqual([
      { nodeId: null },
      { nodeId: 'evidence.payment', inquiry: 'trace' },
      { nodeId: 'evidence.payment', inquiry: 'trace' },
      { nodeId: 'evidence.payment', inquiry: 'what-if' },
      { nodeId: 'evidence.payment', inquiry: 'what-if' },
    ]);
    expect(api.calls.save).toEqual([]);
    expect(within(whatIf).getByLabelText('AI 补丁复核')).toHaveTextContent(
      '挂载违约补偿',
    );
    fireEvent.click(within(whatIf).getByRole('button', { name: '关闭' }));
    expect(whatIf).not.toBeInTheDocument();
    expect(screen.getByLabelText('AI 补丁复核')).toHaveTextContent(
      '挂载违约补偿',
    );
    fireEvent.click(screen.getByRole('button', { name: '保留' }));
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));
    await waitFor(() =>
      expect(api.calls.save).toEqual(['/models/procurement']),
    );
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

  it('plays the walkthrough on the same canvas and silently refreshes clean models', async () => {
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
    expect(launch).not.toHaveAttribute('aria-pressed');
    fireEvent.click(launch);
    expect(screen.getByText('业务旅程画布')).toBeInTheDocument();
    expect(container.querySelector('[data-region="canvas-viewport"]')).toBe(
      canvas,
    );
    expect(screen.queryByLabelText('副视口')).toBeNull();
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '剧情详情' }));
    expect(await screen.findByText('采购方办理采购协议。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByText('采购方办理交付请求。')).toBeInTheDocument();
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
    act(() => invalidate({ rootPath: '/models/procurement' }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="evidence.contract"]'),
      ).toHaveTextContent('外部更新采购协议'),
    );
    await waitFor(() =>
      expect(screen.getByText('步骤 2/3：办理交付请求')).toBeInTheDocument(),
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
    fireEvent.keyDown(screen.getByRole('dialog', { name: '剧情详情' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog', { name: '剧情详情' })).toBeNull();
    expect(screen.getByRole('slider', { name: '业务时间' })).toHaveAttribute(
      'aria-valuetext',
      '2026-11-11 08:00:00.000 UTC',
    );
    const camera = container.querySelector<HTMLElement>(
      '.react-flow__viewport',
    )!;
    const transform = camera.style.transform;
    fireEvent.click(screen.getByRole('button', { name: '退出放映' }));
    expect(camera.style.transform).toBe(transform);
    expect(container.querySelector('[data-region="canvas-viewport"]')).toBe(
      canvas,
    );
    expect(screen.getByRole('button', { name: '放映业务流' })).toHaveFocus();
    expect(screen.queryByLabelText('业务流放映控制')).toBeNull();
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    expect(unsubscribe).toHaveBeenCalled();
    expect(container.querySelector('.evidence-story-active')).toBeNull();
    expect(screen.getByLabelText('聚焦范围')).toHaveValue('context.catalog');
  });

  it('returns from an unmodeled What-If step to the selected credential on the canvas', async () => {
    const document = createDesktopStoryFixture();
    document.rules = [];
    const api = readyProject(document);
    api.story.load = vi.fn(async () => storySnapshot());
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    fireEvent.click(screen.getByRole('button', { name: '剧情详情' }));
    fireEvent.click(
      await screen.findByRole('button', { name: '前往「交付请求」' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '在画布定位凭证' }));
    expect(screen.queryByRole('dialog', { name: '剧情详情' })).toBeNull();
    expect(screen.getByRole('button', { name: '放映业务流' })).toBeVisible();
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('reads pending disk changes before starting a walkthrough', async () => {
    const api = readyProject();
    let changed: Parameters<typeof api.projects.onChanged>[0] = () => undefined;
    api.projects.onChanged = (listener) => {
      changed = listener;
      return () => undefined;
    };
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
      changed({
        rootPath: '/models/procurement',
        paths: ['entities/contract.json'],
        changedAt: '2026-11-11T09:00:00Z',
      }),
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
    expect(screen.getByText('当前模型暂无业务流或履约请求')).toBeVisible();
    expect(api.story.load).not.toHaveBeenCalled();
  });

  it('rehearses a request without declared examples, AI or model writes', async () => {
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
    api.story.startNarration = vi.fn();
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
    fireEvent.click(screen.getByRole('button', { name: '剧情详情' }));
    expect(screen.getByText(/违约条件成立/)).toBeVisible();
    expect(
      screen.getByText('模型中的处置选项（未发生）：仲裁移交'),
    ).toBeVisible();
    expect(screen.queryByRole('article', { name: '业务单据' })).toBeNull();
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).not.toHaveAttribute('data-story-step');
    expect(api.story.startNarration).not.toHaveBeenCalled();
    expect(api.calls.save).toEqual([]);
  });

  it('starts from the command palette and exits with Escape without clearing selection', async () => {
    const api = readyProject(createDesktopStoryFixture());
    api.story.load = vi.fn(async () => storySnapshot());
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const node = container.querySelector('[data-node-id="evidence.contract"]')!;
    fireEvent.click(node);
    fireEvent.click(screen.getByRole('button', { name: '打开快速命令' }));
    fireEvent.click(await screen.findByRole('option', { name: /放映业务流/ }));
    await screen.findByRole('slider', { name: '业务时间' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText('业务流放映控制')).toBeNull();
    expect(node).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '放映业务流' })).toHaveFocus();
    expect(api.calls.save).toEqual([]);
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
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(screen.getByLabelText('领域模型总台账')).toBeVisible();
    expect(unsubscribe).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { code: 'Digit1', altKey: true });
    expect(screen.queryByLabelText('业务流放映控制')).toBeNull();
    expect(screen.getByRole('button', { name: '放映业务流' })).toBeEnabled();
    expect(api.story.load).toHaveBeenCalledOnce();
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
    expect(api.calls.save).toHaveLength(0);
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
    expect(api.calls.save).toEqual([]);
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
    expect(screen.queryByTitle('有未保存修改')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));
    await waitFor(() => expect(api.calls.save).toHaveLength(1));
    expect(screen.queryByTitle('有未保存修改')).toBeNull();
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

  it('saves the edited document to disk from the header', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);

    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));

    await waitFor(() => {
      expect(api.calls.save).toEqual(['/models/procurement']);
    });
    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
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
    expect(api.calls.deliveryPreview).toEqual([]);
    fireEvent.keyDown(hub, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '交付与导出中枢' })).toBeNull();
    expect(
      screen.getByRole('button', { name: '保存模型' }),
    ).toBeInTheDocument();
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

  it('shows a save failure without claiming success', async () => {
    installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document: createDesktopFixture(),
        issues: [],
      },
      saveResult: { success: false, error: '磁盘不可写。' },
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));

    expect(await screen.findByText('磁盘不可写。')).toBeInTheDocument();
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
  it('shows the verdict, opens the drawer and jumps to the finding', async () => {
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary(),
        document: createDesktopFixture(),
        issues: [],
      },
      sensorReport: healthyReport({
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
      }),
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    await screen.findByLabelText('聚焦范围');
    expect(await screen.findByText('阻塞 1')).toBeInTheDocument();
    expect(api.calls.triggerSensors).toEqual(['/models/procurement']);

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

  it('tells the main process when the model changes', async () => {
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary(),
        document: createDesktopFixture(),
        issues: [],
      },
    });

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('商品采购（Product Procurement）');

    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));

    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
    expect(api.calls.save).toEqual(['/models/procurement']);
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
    expect(api.calls.save).toEqual([]);
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
