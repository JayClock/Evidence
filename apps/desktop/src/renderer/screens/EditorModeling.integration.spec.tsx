import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  projectStoryFacts,
  simulateWhatIf,
} from '@evidence-poc/evidence-agent';
import {
  createDesktopStoryFixture,
  storySnapshot,
} from '@evidence-poc/desktop-testing/story';
import {
  applyModelPatches,
  assignFulfillmentContextMutator,
  batchAddEvidenceMutator,
  bindBreachRuleMutator,
  resolveStoryTraces,
  createModelPatch,
  createStory,
  splitEvidenceToPairMutator,
} from '@evidence-poc/evidence-model-core';
import { EditorScreen } from './EditorScreen';
import {
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { readyCanvas, readyProject } from '../../../tests/editorScreenFixture';

describe('Editor modeling and patch review', () => {
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
    expect(api.calls.persistence).toHaveLength(0);
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
    expect(api.calls.persistence).toHaveLength(0);
  });

  it('opens the affected playback step from a breach finding and keeps ordinary clarification read-only', async () => {
    const document = createDesktopStoryFixture();
    const request = document.entities.find(
      ({ id }) => id === 'evidence.request',
    )!;
    if ('responsibleRoleRef' in request) delete request.responsibleRoleRef;
    const api = readyProject(document);
    api.story.load = vi.fn(async ({ document, preferredFlowId }) =>
      storySnapshot(resolveStoryTraces(document!), preferredFlowId),
    );
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    const radar = async () => {
      fireEvent.click(screen.getByRole('button', { name: /^体检 \d+ 分/ }));
      return within(
        await screen.findByRole('dialog', { name: '8X Flow 模型体检' }),
      );
    };
    let drawer = await radar();
    fireEvent.click(
      drawer.getByRole('button', { name: /在放映中推演.*交付请求.*异常处置/ }),
    );
    const story = within(
      await screen.findByRole('region', { name: '业务故事' }),
    );
    expect(
      await story.findByRole('heading', { name: 'What-If 业务沙盘' }),
    ).toBeVisible();
    expect(
      story.getByRole('tab', { name: '推演与分支', selected: true }),
    ).toBeVisible();
    expect(
      story.getByRole('navigation', { name: '故事步骤' }),
    ).toHaveTextContent('交付请求');
    expect(story.getByRole('textbox', { name: '假设问题' })).toBeVisible();
    expect(api.calls.prompt).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '退出放映' }));
    drawer = await radar();
    fireEvent.click(
      drawer.getByRole('button', { name: /引导澄清.*交付请求.*责任角色/ }),
    );
    await screen.findByRole('dialog', { name: /权责与交付澄清：交付请求/ });
    await waitFor(() =>
      expect(api.calls.prompt[0]).toMatchObject({
        focus: { nodeId: 'evidence.request', inquiry: 'trace', readOnly: true },
        text: expect.stringContaining('vacant_responsibility:evidence.request'),
      }),
    );
    expect(api.calls.persistence).toHaveLength(0);
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
      screen.getByRole('button', { name: /^澄清权责：交付确认/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: /^权责与交付澄清：交付确认/,
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
    expect(api.calls.persistence.length).toBeGreaterThan(0);
  });

  it('grows stormed evidence into a pair and records an agreed compensation from its playback step', async () => {
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
      '卖方向买方发起付款主张，到账回执确认完成。截止时刻前须到账，确认金额沿用请求上的金额，请补齐这项履约。';
    const scenarioFacts =
      '请为口头买卖合同记录示例。卖方 09:00 签约，10:00 发起付款请求，12:00 截止，逾期仍未收到付款凭证即视为违约。';
    const flowId = 'sale-payment';
    const asOf = '2026-04-01T10:00:00Z';
    const deadline = '2026-04-01T12:00:00Z';
    const late = '2026-04-01T13:00:00Z';
    api.story.load = vi.fn(async ({ document: model, preferredFlowId }) => {
      const flows = resolveStoryTraces(model!);
      const flow =
        flows.find((flow) => flow.flowId === preferredFlowId) ?? flows[0]!;
      return {
        flows,
        snapshotId: crypto.randomUUID(),
        selected: { flow, projection: projectStoryFacts(flow, model) },
      };
    });
    api.story.whatIf = vi.fn(async (input) =>
      simulateWhatIf(
        {
          model: input.document!,
          flow: resolveStoryTraces(input.document!)[0]!,
          currentStep: input.currentStep,
          hypothesisQuestion: input.question,
          hypothesis: { asOf: late },
        },
        {
          agent: {
            generate: async () => ({
              businessImpactExplanation: '截止后仍未收到付款凭证。',
            }),
          },
        },
      ),
    );
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
      } else if (input.text === scenarioFacts) {
        apply(
          '记录已确认的付款示例',
          (draft) => {
            draft.entities.push(
              {
                type: 'entity',
                category: 'context',
                kind: 'contract',
                id: 'context.sale',
                label: '口头买卖合同',
                rootRefs: ['evidence.sale'],
              },
              {
                type: 'entity',
                category: 'role',
                kind: 'party',
                id: 'role.seller',
                label: '卖方',
                contextRef: 'context.sale',
              },
            );
            draft.manifest.entryContextRefs = ['context.sale'];
            const sale = draft.entities.find(
              ({ id }) => id === 'evidence.sale',
            )!;
            if (sale.category === 'evidence') sale.contextRef = 'context.sale';
            assignFulfillmentContextMutator(draft, {
              requestRef: 'request.payment',
              contextRef: 'context.sale',
            });
            bindBreachRuleMutator(draft, {
              requestRef: 'request.payment',
              rule: {
                id: 'rule.payment-late',
                label: '逾期未到账',
                description: '截止后仍未收到付款凭证。',
                resultType: 'bool',
                bindings: {
                  now: { type: 'timestamp' },
                  request: { ref: 'request.payment' },
                  confirmations: {
                    ref: 'evidence.payment',
                    cardinality: 'many',
                  },
                },
                expression:
                  'now > request.expired_at && size(confirmations) == 0',
              },
            });
            createStory(draft, {
              type: 'story',
              id: flowId,
              title: '买卖付款',
              kind: 'primary',
              steps: [
                {
                  id: 'sign',
                  sequence: 1,
                  actorRef: 'role.seller',
                  activity: '签署',
                  workObjectRef: sale.id,
                  asOf: '2026-04-01T09:00:00Z',
                  values: {},
                  basedOn: [],
                },
                {
                  id: 'request',
                  sequence: 2,
                  actorRef: 'role.seller',
                  activity: '请款',
                  workObjectRef: 'request.payment',
                  asOf,
                  values: { started_at: asOf, expired_at: deadline },
                  basedOn: ['sign'],
                },
              ],
            });
          },
          input.focus?.nodeId ?? undefined,
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
                deadlineMeaning: '应当到账的最后时刻。',
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
    expect(screen.queryByRole('button', { name: /推演异常/ })).toBeNull();
    expect(api.calls.prompt).toHaveLength(1);
    expect(api.calls.persistence.length).toBeGreaterThan(0);
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
    await answer(sourcing, scenarioFacts);
    const keep = await within(sourcing).findByRole('button', { name: '保留' });
    await waitFor(() => expect(keep).toBeEnabled());
    fireEvent.click(keep);
    fireEvent.click(within(sourcing).getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    const story = within(
      await screen.findByRole('region', { name: '业务故事' }),
    );
    fireEvent.click(
      await story.findByRole('button', { name: /展开全部 2 幕/ }),
    );
    fireEvent.click(
      within(story.getByRole('list')).getByRole('button', { name: /付款申请/ }),
    );
    expect(story.getByRole('region', { name: '本步注解' })).toHaveTextContent(
      '合同归属：口头买卖合同',
    );
    const card = story.getByRole('article', { name: '业务单据' });
    fireEvent.click(within(card).getByText('单据归档与字段依据'));
    expect(within(card).getAllByText(/请求形成事实/)[0]).toBeVisible();
    expect(card).toHaveTextContent('示例未提供');
    fireEvent.mouseDown(story.getByRole('tab', { name: '推演与分支' }), {
      button: 0,
    });
    const question = '如果到 13:00 还没有收到付款凭证？';
    fireEvent.change(story.getByRole('textbox', { name: '假设问题' }), {
      target: { value: question },
    });
    fireEvent.click(story.getByRole('button', { name: '推演假设' }));
    expect(await story.findByText('逾期未到账 · 触发违约')).toBeVisible();
    const form = within(story.getByRole('form', { name: '固化违约分支' }));
    for (const [name, value] of [
      ['已确认的触发条件', '逾期未到账'],
      ['补救请求名称', '退款请求'],
      ['补救确认名称', '退款确认'],
    ]) {
      fireEvent.change(form.getByRole('textbox', { name }), {
        target: { value },
      });
    }
    fireEvent.click(form.getByRole('button', { name: '保存补救分支' }));
    const review = within(
      await story.findByRole('region', { name: '违约分支复核' }),
    );
    expect(review.getByText('挂载违约补偿')).toBeVisible();
    const after = api.calls.persistence.at(-1)!.document;
    const refund = after.entities.find(({ label }) => label === '退款请求')!;
    expect(after.relationships).toContainEqual(
      expect.objectContaining({
        flowKind: 'breach_compensation',
        sourceRef: refund.id,
        targetRef: 'request.payment',
        notes: '逾期未到账',
      }),
    );
    expect(after.rules).toEqual(document.rules);
    expect(after.stories).toEqual([
      ...document.stories,
      expect.objectContaining({
        kind: 'breach_branch',
        forkedFrom: expect.objectContaining({
          storyId: flowId,
          stepId: 'request',
        }),
      }),
    ]);
    expect(await screen.findByText('步骤 2/2：付款申请')).toBeVisible();
    expect(
      container.querySelector(`[data-overlay-node-id="${refund.id}"]`),
    ).toHaveAttribute('data-overlay-change', 'added');
    expect(
      container.querySelector(
        '[data-flow-kind="breach_compensation"][data-edge-id]',
      ),
    ).toHaveAttribute('opacity', '1');
    expect(
      story.queryByRole('button', { name: '在画布查看「退款请求」' }),
    ).toBeNull();
    fireEvent.mouseDown(story.getByRole('tab', { name: '故事剧本' }), {
      button: 0,
    });
    expect(story.getByRole('region', { name: '违约分支复核' })).toBeVisible();
    fireEvent.click(review.getByRole('button', { name: '保留' }));
    expect(story.queryByRole('region', { name: '违约分支复核' })).toBeNull();
    const forks = within(
      story.getByRole('list', { name: '第 2 幕的违约分支' }),
    );
    expect(
      forks.getByRole('button', { name: '放映「退款请求」' }),
    ).toBeEnabled();
    expect(forks.getByText('逾期未到账')).toBeVisible();
    fireEvent.mouseDown(story.getByRole('tab', { name: '推演与分支' }), {
      button: 0,
    });
    fireEvent.click(
      story.getByRole('button', { name: '在画布查看「退款请求」' }),
    );
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    expect(
      container.querySelector(`[data-node-id="${refund.id}"]`),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(api.calls.prompt).toHaveLength(4);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() =>
      expect(api.calls.persistence.at(-1)?.document).toEqual(document),
    );
    fireEvent.click(screen.getByRole('button', { name: '放映业务流' }));
    expect(await screen.findByText('步骤 2/2：付款申请')).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '推演与分支' }), {
      button: 0,
    });
    expect(
      screen.queryByRole('button', { name: '在画布查看「退款请求」' }),
    ).toBeNull();
  });
});
