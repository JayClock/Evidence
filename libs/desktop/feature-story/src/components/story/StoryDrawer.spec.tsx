import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  createEmptyDomainModel,
  isFulfillmentRequest,
  type DomainModelDocument,
  type RecordBreachOutcomeInput,
} from '@evidence-poc/evidence-schema';
import {
  applyModelPatches,
  createModelPatch,
  createDomainGraph,
  createWhatIfScenario,
  recordBreachOutcomeMutator,
} from '@evidence-poc/evidence-model-core';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storyFlow, storySnapshot } from '@evidence-poc/desktop-testing/story';
import type { StoryEnrichStepResult } from '@evidence-poc/desktop-contracts/story';
import type { WhatIfResult } from '@evidence-poc/evidence-agent/browser';
import {
  STORY_REFRESH_DELAY,
  useStoryPlayback,
} from '../../state/useStoryPlayback';
import { createDesktopStoryFixture } from '@evidence-poc/desktop-testing/story';
import { resolveStoryTraces } from '@evidence-poc/evidence-model-core';
import { StoryDrawer } from './StoryDrawer';
import { StoryPlayerBar } from './StoryPlayerBar';

const setup = async ({
  empty = false,
  failure = false,
  breach = false,
  noRules = false,
  unassignedConfirmation = false,
  aiConfigured = true,
  model = createDesktopStoryFixture(),
} = {}) => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const base = storyFlow();
  const flow = {
    ...base,
    steps: base.steps.map((step) =>
      step.entityKind === 'fulfillment_confirmation'
        ? {
            ...step,
            values: { ...step.values, confirmed_at: '2026-11-11T08:00:00Z' },
          }
        : step.entityKind === 'fulfillment_request'
          ? {
              ...step,
              values: {
                ...step.values,
                expired_at: '2026-11-11T18:00:00+08:00',
              },
            }
          : step,
    ),
  };
  api.story.load = vi.fn(async ({ document, preferredFlowId }) =>
    storySnapshot(
      empty
        ? []
        : [
            flow,
            ...(document
              ? resolveStoryTraces(document).filter((s) => s.forkedFrom)
              : []),
          ],
      preferredFlowId,
    ),
  );
  api.story.enrichStep = vi.fn(() => new Promise<null>(() => undefined));
  if (failure)
    api.story.enrichStep = async () => {
      throw new Error('AI 未配置');
    };
  api.story.whatIf = vi.fn<typeof api.story.whatIf>(async (input) => {
    if (!input.document || !input.targetedRuleId || !input.hypothesisDraft)
      throw new Error('Expected a structured challenge');
    const graph = createDomainGraph(input.document);
    const step = flow.steps.find(
      (step) => step.stepId === input.currentStep.stepId,
    );
    const rule = graph.getRule(input.targetedRuleId);
    if (!step || (rule?.kind !== 'completion' && rule?.kind !== 'breach'))
      throw new Error('Expected the challenge’s scene and rule');
    const trial = createWhatIfScenario(graph, flow.steps, step).apply(
      input.hypothesisDraft,
    );
    const ruleOutcome = {
      ...trial.decide(rule),
      label: rule.label,
      kind: rule.kind,
      description: rule.description,
    };
    return {
      isSpeculative: false,
      hypothesis: input.hypothesisDraft,
      ruleOutcome,
      ruleOutcomes: [ruleOutcome],
      completionGap: trial.completionGap([ruleOutcome]),
      businessImpactExplanation: rule.label,
    };
  });
  const document = empty ? createEmptyDomainModel() : model;
  if (unassignedConfirmation) {
    const confirmation = document.entities.find(
      ({ id }) => id === 'evidence.confirmation',
    );
    if (confirmation?.category === 'evidence') delete confirmation.contextRef;
  }
  if (noRules) document.rules = [];
  if (breach) {
    document.rules.push({
      ...document.rules[0]!,
      id: 'rule.late',
      label: '逾期未交付',
      kind: 'breach',
      bindings: {
        request: { ref: 'evidence.request' },
        now: { type: 'timestamp' },
      },
      expression: 'now > request.expired_at',
    });
  }
  const onClarifyGap = vi.fn();
  const onReturnToCanvas = vi.fn();
  const onOpenBranchEntity = vi.fn();
  const recordOutcome = vi.fn(
    (input: RecordBreachOutcomeInput, base: DomainModelDocument) => {
      const { patches } = createModelPatch(base, (draft) =>
        recordBreachOutcomeMutator(draft, input),
      );
      return applyModelPatches(base, patches);
    },
  );
  const Harness = () => {
    const [current, setCurrent] = useState(document);
    const playback = useStoryPlayback({
      api: window.evidenceAPI.story,
      rootPath: '/models/test',
      document: current,
      onRecordBreachOutcome: (input, base) => {
        const after = recordOutcome(input, base);
        setCurrent(after);
        return after;
      },
      enabled: true,
      aiConfigured,
    });
    return (
      <>
        <StoryPlayerBar
          playback={playback}
          aiConfigured={aiConfigured}
          onConfigureAi={vi.fn()}
        />
        <StoryDrawer
          playback={playback}
          aiConfigured={aiConfigured}
          onReturnToCanvas={onReturnToCanvas}
          onOpenBranchEntity={onOpenBranchEntity}
          onClarifyGap={onClarifyGap}
          pendingPersistence
          externalConflict
        />
      </>
    );
  };
  const view = render(<Harness />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
  });
  return {
    api,
    flow,
    view,
    onClarifyGap,
    onReturnToCanvas,
    onOpenBranchEntity,
    recordOutcome,
  };
};
const selectTab = (name: '故事剧本' | '推演与分支') =>
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
afterEach(() => {
  vi.useRealTimers();
});

describe('StoryDrawer', () => {
  it('opens on the script and follows any numbered sentence with its actor and recipient', async () => {
    const { flow, onReturnToCanvas } = await setup();
    const flowPicker = within(
      screen.getByRole('combobox', { name: '选择业务流' }),
    );
    expect(
      flowPicker.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([flow.flowTitle]);
    expect(screen.getByRole('tabpanel', { name: '故事剧本' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'What-If 业务沙盘' }),
    ).toBeNull();
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    expect(screen.getByRole('article', { name: '本幕叙事' })).toHaveTextContent(
      '采购方签署《采购协议》。',
    );
    expect(screen.getByText(/尚未同步到磁盘的画布版本/)).toBeInTheDocument();
    expect(screen.getByText(/可从状态栏重新加载/)).toBeInTheDocument();
    const spine = within(screen.getByRole('navigation', { name: '故事步骤' }));
    expect(spine.queryByRole('list')).toBeNull();
    fireEvent.click(spine.getByRole('button', { name: /展开全部 3 幕/ }));
    const steps = within(spine.getByRole('list')).getAllByRole('button', {
      name: /^[123]/,
    });
    expect(steps.map((step) => step.textContent)).toEqual([
      '1采购方签署《采购协议》当前幕',
      '2供货方要求采购方验收交付成果（《交付请求》）',
      '3采购方记录「验收交付成果」的履约确认（《交付确认》）',
    ]);
    fireEvent.click(steps[1]!);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('第 2/3 步')).toBeVisible();
    expect(screen.getByText(/^业务时点：/)).toHaveAttribute(
      'datetime',
      flow.steps[1]!.asOf,
    );
    expect(
      screen.getByRole('heading', {
        name: /经办方：供货方.*要求采购方验收交付成果.*《交付请求》.*接收方：采购方/,
      }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: '本步注解' })).toHaveTextContent(
      '待采购方落实交付确认',
    );
    fireEvent.click(steps[2]!);
    expect(
      screen.getByRole('heading', { name: /《交付确认》.*义务方：采购方/ }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '返回画布' }));
    expect(onReturnToCanvas).toHaveBeenCalledOnce();
  });

  it('switches views with the arrow keys and keeps focus on the selected tab', async () => {
    await setup();
    const script = screen.getByRole('tab', { name: '故事剧本' });
    act(() => script.focus());
    fireEvent.keyDown(script, { key: 'ArrowRight' });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(
      screen.getByRole('tab', { name: '推演与分支', selected: true }),
    ).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: '推演与分支' })).toBeVisible();
  });

  it('keeps the script selected when a sandbox reply arrives in the background', async () => {
    const { api } = await setup({ noRules: true });
    let finish!: (result: WhatIfResult) => void;
    vi.mocked(api.story.whatIf).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /展开全部 3 幕/ }));
    fireEvent.click(screen.getByRole('button', { name: '推演第 2 幕' }));
    fireEvent.click(screen.getByRole('button', { name: '开启 AI 临时推想' }));
    fireEvent.change(screen.getByRole('textbox', { name: '假设问题' }), {
      target: { value: '如果延迟交付，会影响验收吗？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 推想' }));
    selectTab('故事剧本');
    await act(async () =>
      finish({
        isSpeculative: true,
        ruleOutcomes: [],
        businessImpactExplanation: '验收可能延迟。',
      }),
    );
    expect(screen.getByRole('tabpanel', { name: '故事剧本' })).toBeVisible();
    selectTab('推演与分支');
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue(
      '如果延迟交付，会影响验收吗？',
    );
    expect(screen.getByText('验收可能延迟。')).toBeVisible();
  });

  it('keeps core values visible and discloses the archive and source of each field on demand', async () => {
    await setup();
    const card = within(screen.getByRole('article', { name: '业务单据' }));
    expect(card.getByText('500')).toBeVisible();
    expect(card.getByText('业务归档要素')).not.toBeVisible();
    expect(card.getByText(/合同参数/)).not.toBeVisible();
    fireEvent.click(card.getByText('单据归档与字段依据'));
    expect(card.getByText('C-001')).toBeVisible();
    expect(card.getByText(/合同参数/)).toBeVisible();
  });

  it('checks the causal request on a confirmation and directs each gap to its own evidence', async () => {
    const { onClarifyGap } = await setup({
      noRules: true,
      unassignedConfirmation: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    const checklist = within(screen.getByRole('region', { name: '本步注解' }));
    expect(checklist.getByText('权利方：供货方')).toBeVisible();
    expect(checklist.getByText('义务方：采购方')).toBeVisible();
    expect(checklist.getByText('约定交付：验收交付成果')).toBeVisible();
    fireEvent.click(checklist.getByRole('button', { name: '补齐合同归属' }));
    fireEvent.click(checklist.getByRole('button', { name: '补齐完成规则' }));
    expect(onClarifyGap.mock.calls).toEqual([
      ['evidence.confirmation', 'contract'],
      ['evidence.request', 'completion'],
    ]);
  });

  it('does not offer a question on the contract and jumps to a fulfillment step', async () => {
    const { api } = await setup();
    selectTab('推演与分支');
    expect(screen.getByText(/合同步骤记录双方的约定/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '假设问题' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: '开启 AI 临时推想' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    expect(
      screen.getByRole('heading', { name: 'What-If 业务沙盘' }),
    ).toHaveFocus();
    expect(screen.getByText('第 2/3 步')).toBeVisible();
    expect(api.story.whatIf).not.toHaveBeenCalled();
  });

  it('submits a strict question about the confirmation and clears the answer after stepping', async () => {
    const { api } = await setup();
    fireEvent.click(screen.getByRole('button', { name: /展开全部 3 幕/ }));
    fireEvent.click(screen.getByRole('button', { name: '推演第 3 幕' }));
    expect(screen.getByRole('tab', { name: '推演与分支' })).toHaveFocus();
    expect(screen.getByRole('button', { name: '推演假设' })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: /时效逾期 · 超过约定期限/ }),
    );
    const question =
      '如果《交付确认》上的「确认时间」推迟到「截止时间」次日（2026年11月12日），会产生什么业务后果？对后续流程有何影响？';
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue(
      question,
    );
    expect(api.story.whatIf).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    expect(api.story.whatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStep: { storyId: 'procurement', stepId: 'step-3' },
        stepHash: 'step-2',
        question,
        hypothesisDraft: {
          asOf: '2026-11-12T10:00:00.000Z',
          values: { confirmed_at: '2026-11-12T10:00:00.000Z' },
        },
      }),
    );
    expect(vi.mocked(api.story.whatIf).mock.calls[0]![0]).not.toHaveProperty(
      'allowSpeculative',
    );
    const outcomes = screen.getByRole('list', { name: '履约推演结论' });
    expect(
      within(outcomes).getByText(
        '交付完成（Delivery Completion） · 完成条件未达成',
      ),
    ).toBeVisible();
    expect(outcomes).not.toHaveTextContent('rule.delivery-completion');
    expect(screen.queryByText(/审批或发布授权/u)).toBeNull();
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    expect(screen.queryByRole('button', { name: '固化违约分支…' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /上一步/ }));
    expect(screen.queryByRole('list', { name: '履约推演结论' })).toBeNull();
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue('');
  });

  it('requires explicit AI opt-in without rules and displays no verdict for the result', async () => {
    const { api } = await setup({ noRules: true });
    vi.mocked(api.story.whatIf).mockResolvedValue({
      isSpeculative: true,
      ruleOutcomes: [],
      businessImpactExplanation: '后续入库可能延迟。',
    });
    selectTab('推演与分支');
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    expect(
      screen.getByText(/还没有可用于判断履约完成或违约的约定/),
    ).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '假设问题' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '开启 AI 临时推想' }));
    fireEvent.change(screen.getByRole('textbox', { name: '假设问题' }), {
      target: { value: '如果未能按约交付，会影响后续入库吗？' },
    });
    expect(api.story.whatIf).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '生成 AI 推想' })),
    );
    expect(api.story.whatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStep: { storyId: 'procurement', stepId: 'step-2' },
        allowSpeculative: true,
      }),
    );
    expect(screen.getByText('AI 临时推想')).toBeVisible();
    expect(screen.queryByRole('list', { name: '履约推演结论' })).toBeNull();
    expect(screen.getByText('后续入库可能延迟。')).toBeVisible();
    expect(screen.queryByRole('button', { name: '固化违约分支…' })).toBeNull();
    expect(screen.queryByText(/条件不成立|条件成立/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '退出 AI 临时推想' }));
    fireEvent.click(screen.getByRole('button', { name: '开启 AI 临时推想' }));
    expect(screen.queryByText('后续入库可能延迟。')).toBeNull();
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.queryByRole('textbox', { name: '假设问题' })).toBeNull();
  });

  it('shows a met completion and an untriggered breach as distinct outcomes', async () => {
    const { api } = await setup({ breach: true });
    const ruleOutcome = {
      ruleId: 'rule.delivery-completion',
      label: '按期交付',
      kind: 'completion' as const,
      result: true,
    };
    vi.mocked(api.story.whatIf).mockResolvedValueOnce({
      isSpeculative: false,
      hypothesis: { values: { confirmed_at: '2026-11-11T08:00:00Z' } },
      ruleOutcome,
      ruleOutcomes: [
        ruleOutcome,
        {
          ruleId: 'rule.late',
          label: '交付逾期',
          kind: 'breach',
          result: false,
        },
      ],
      businessImpactExplanation: '若按期交付，采购方可继续核对交付确认。',
    });
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    selectTab('推演与分支');
    fireEvent.change(screen.getByRole('textbox', { name: '假设问题' }), {
      target: { value: '如果提前交付呢？' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    const outcomes = within(screen.getByRole('list', { name: '履约推演结论' }));
    expect(
      outcomes.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['按期交付 · 完成条件已达成', '交付逾期 · 未触发违约']);
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
  });

  it('upgrades local cards in place, keeps typed text and drops the selected draft when the question is edited', async () => {
    const { api } = await setup({ breach: true });
    let finish!: (reply: StoryEnrichStepResult) => void;
    api.story.enrichStep = vi.fn(
      () =>
        new Promise<StoryEnrichStepResult>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    selectTab('推演与分支');
    expect(
      screen.getByRole('button', { name: /时效逾期 · 超过约定期限/ }),
    ).toBeVisible();
    const editor = screen.getByRole('textbox', { name: '假设问题' });
    fireEvent.change(editor, { target: { value: '我正在写的假设' } });
    const card = {
      id: 'late',
      category: 'overdue' as const,
      label: '逾期三天',
      question: '如果采购方逾期三天仍未验收，会怎样？',
      targetedRuleId: 'rule.late',
      hypothesisDraft: { asOf: '2026-11-14T10:00:00Z' },
    };
    await act(async () =>
      finish({
        stepIndex: 2,
        stepHash: 'step-1',
        narrative: { headline: '交付请求', prose: '请求验收。' },
        cached: false,
        challenges: [card],
      }),
    );
    expect(editor).toHaveValue('我正在写的假设');
    expect(screen.queryByRole('button', { name: /超过约定期限/ })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /时效逾期 · 逾期三天/ }),
    );
    expect(editor).toHaveValue(card.question);
    expect(editor).toHaveFocus();
    const edited = '如果采购方逾期五天仍未验收，会怎样？';
    fireEvent.change(editor, { target: { value: edited } });
    const ruleOutcome = {
      ruleId: 'rule.late',
      label: '逾期未交付',
      kind: 'breach' as const,
      result: true,
    };
    vi.mocked(api.story.whatIf).mockResolvedValueOnce({
      isSpeculative: false,
      hypothesis: { asOf: '2026-11-16T10:00:00Z' },
      ruleOutcome,
      ruleOutcomes: [ruleOutcome],
      businessImpactExplanation: '已超过约定期限五天。',
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    const [input] = vi.mocked(api.story.whatIf).mock.calls[0]!;
    expect(input.question).toBe(edited);
    expect(input).not.toHaveProperty('hypothesisDraft');
    expect(input).not.toHaveProperty('targetedRuleId');
    expect(screen.getByText('已超过约定期限五天。')).toBeVisible();
  });

  it('evaluates an offline deadline challenge and opens the breach form only on submission', async () => {
    const { api } = await setup({ breach: true, aiConfigured: false });
    selectTab('推演与分支');
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    fireEvent.click(
      screen.getByRole('button', { name: /时效逾期 · 超过约定期限/ }),
    );
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    expect(api.story.whatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        localOnly: true,
        targetedRuleId: 'rule.late',
        hypothesisDraft: { asOf: '2026-11-12T10:00:00.000Z' },
      }),
    );
    expect(screen.getByRole('form', { name: '固化违约分支' })).toBeVisible();
    expect(
      screen.getByRole('region', { name: '下游协同阻断' }),
    ).toHaveTextContent('第 3 幕 · 交付确认');
    expect(screen.getByRole('button', { name: /下一步/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '恢复本幕正常流' }));
    expect(screen.getByRole('button', { name: /下一步/ })).toBeEnabled();
    expect(screen.queryByRole('region', { name: '下游协同阻断' })).toBeNull();
  });

  it.each(['compensation_pair', 'terminal_escalation'] as const)(
    'freezes the dependent confirmation and saves %s from an overdue request without a breach rule',
    async (kind) => {
      const model = createDesktopStoryFixture();
      model.entities.find(isFulfillmentRequest)!.fulfillmentAction =
        '验收交付成果';
      const rule = model.rules[0]!;
      rule.bindings = {
        receipt: { ref: 'evidence.confirmation' },
        now: { type: 'timestamp' },
      };
      rule.expression = 'receipt.confirmed_at <= now';
      const { api, recordOutcome } = await setup({
        model,
        aiConfigured: false,
      });
      const spine = within(
        screen.getByRole('navigation', { name: '故事步骤' }),
      );
      fireEvent.click(spine.getByRole('button', { name: /展开全部 3 幕/ }));
      fireEvent.click(spine.getByRole('button', { name: /^2/ }));
      expect(
        screen.getByRole('region', { name: '本步注解' }),
      ).toHaveTextContent(`完成规则：${rule.label}`);
      fireEvent.click(spine.getByRole('button', { name: '推演第 2 幕' }));
      const card = screen.getByRole('button', {
        name: /时效逾期 · 超过约定期限/,
      });
      expect(card).toHaveTextContent(
        '采购方（Buyer）仍未完成「验收交付成果」且未出具《交付确认（Delivery Confirmation）》',
      );
      fireEvent.click(card);
      expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
      );
      expect(api.story.whatIf).toHaveBeenCalledWith(
        expect.objectContaining({
          currentStep: { storyId: 'procurement', stepId: 'step-2' },
          targetedRuleId: rule.id,
          localOnly: true,
        }),
      );
      expect(
        screen.getByRole('list', { name: '履约推演结论' }),
      ).toHaveTextContent('截止时仍未达成，构成逾期违约');
      expect(spine.getByRole('button', { name: /^3/ })).toHaveTextContent(
        '已冻结',
      );
      expect(
        screen.getByRole('region', { name: '下游协同阻断' }),
      ).toHaveTextContent('第 3 幕 · 交付确认');
      expect(screen.getByRole('button', { name: /下一步/ })).toBeDisabled();
      const form = within(screen.getByRole('form', { name: '固化违约分支' }));
      expect(
        form.getByText('原履约请求：交付请求（Delivery Request）'),
      ).toBeVisible();
      expect(form.getByRole('radio', { name: '约定履约补救' })).toBeChecked();
      expect(form.getByRole('radio', { name: '启动终极救济' })).toBeEnabled();
      fireEvent.change(form.getByLabelText('已确认的触发条件'), {
        target: { value: '交付期限届满仍缺验收凭证' },
      });
      if (kind === 'compensation_pair') {
        fireEvent.change(form.getByLabelText('补救请求名称'), {
          target: { value: '补办验收请求' },
        });
        fireEvent.change(form.getByLabelText('补救确认名称'), {
          target: { value: '补办验收确认' },
        });
      } else {
        fireEvent.click(form.getByRole('radio', { name: '启动终极救济' }));
        fireEvent.change(form.getByLabelText('救济方式'), {
          target: { value: 'contract_termination' },
        });
      }
      await act(async () =>
        fireEvent.click(form.getByRole('button', { name: /保存.*分支/ })),
      );
      expect(recordOutcome).toHaveBeenCalledOnce();
      const updated = recordOutcome.mock.results[0]!
        .value as DomainModelDocument;
      expect(
        createDomainGraph(updated).breachOutcomesOf('evidence.request'),
      ).toMatchObject([
        {
          kind,
          edge: {
            notes: '交付期限届满仍缺验收凭证',
          },
          ...(kind === 'compensation_pair'
            ? {
                compensation: {
                  request: { label: '补办验收请求' },
                  confirmations: [{ label: '补办验收确认' }],
                },
              }
            : {
                remedyKind: 'contract_termination',
                handoff: { label: '解除合同移交凭证' },
              }),
        },
      ]);
      await act(async () => vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY));
      expect(
        spine.getByRole('list', { name: '第 2 幕的违约分支' }),
      ).toHaveTextContent(
        kind === 'compensation_pair' ? '补办验收请求' : '解除合同',
      );
    },
  );

  it('shows guidance but no speculative form while AI is unconfigured', async () => {
    const { api } = await setup({ noRules: true, aiConfigured: false });
    const drawer = within(screen.getByRole('region', { name: '业务故事' }));
    expect(drawer.queryByText(/配置.*模型/)).toBeNull();
    expect(screen.getByRole('button', { name: '配置旁白模型' })).toBeVisible();
    selectTab('推演与分支');
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    expect(
      screen.getByText(/还没有可用于判断履约完成或违约的约定/),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '开启 AI 临时推想' }),
    ).toBeNull();
    expect(api.story.whatIf).not.toHaveBeenCalled();
  });

  it.each(['lawsuit', 'arbitration', 'contract_termination'] as const)(
    'records the agreed %s handoff after a breach and links to its evidence',
    async (remedy) => {
      const { api, recordOutcome, onOpenBranchEntity, view } = await setup({
        breach: true,
      });
      fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
      fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
      selectTab('推演与分支');
      fireEvent.click(
        screen.getByRole('button', { name: /时效逾期 · 超过约定期限/ }),
      );
      expect(api.story.whatIf).not.toHaveBeenCalled();
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
      );
      expect(screen.getByText('逾期未交付 · 触发违约')).toBeVisible();
      expect(
        screen.getByRole('region', { name: 'What-If 业务沙盘' }),
      ).not.toHaveTextContent('rule.late');
      const form = within(screen.getByRole('form', { name: '固化违约分支' }));
      expect(form.getByRole('radio', { name: '约定履约补救' })).toBeChecked();
      fireEvent.click(form.getByRole('radio', { name: '启动终极救济' }));
      const submit = form.getByRole('button', { name: '保存救济分支' });
      fireEvent.click(submit);
      expect(recordOutcome).not.toHaveBeenCalled();
      fireEvent.change(
        form.getByRole('textbox', { name: '已确认的触发条件' }),
        { target: { value: ' 到期未交付 ' } },
      );
      fireEvent.change(form.getByRole('combobox', { name: '救济方式' }), {
        target: { value: remedy },
      });
      // A rejected edit must keep the user's agreement available for retry.
      recordOutcome.mockImplementationOnce(() => {
        throw new Error('Invalid terminal_escalation payload');
      });
      await act(async () => fireEvent.click(submit));
      expect(form.getByRole('alert')).toHaveTextContent('请复核触发条件');
      expect(form.getByRole('alert')).not.toHaveTextContent(
        'terminal_escalation',
      );
      await act(async () => fireEvent.click(submit));
      const updated = recordOutcome.mock.results.at(-1)!
        .value as DomainModelDocument;
      expect(updated.relationships).toContainEqual(
        expect.objectContaining({
          flowKind: 'escalation',
          terminalRemedyKind: remedy,
          targetRef: 'evidence.request',
          notes: '到期未交付',
        }),
      );
      expect(updated.rules.map(({ id }) => id)).toEqual([
        'rule.delivery-completion',
        'rule.late',
      ]);
      await act(async () => vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY));
      expect(screen.getByText('步骤 3/3：交付确认')).toBeVisible();
      expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /在画布查看/ }));
      expect(onOpenBranchEntity).toHaveBeenCalledWith(
        updated.relationships.at(-1)?.sourceRef,
      );
      view.unmount();
      await setup({ model: structuredClone(updated) });
      fireEvent.click(screen.getByRole('button', { name: /展开全部 3 幕/ }));
      const forks = within(
        screen.getByRole('list', { name: '第 3 幕的违约分支' }),
      );
      expect(forks.getByText('到期未交付')).toBeVisible();
      expect(
        screen.queryByRole('list', { name: '第 2 幕的违约分支' }),
      ).toBeNull();
    },
  );

  it('plays the saved handoff scene after an offline request challenge', async () => {
    await setup({ breach: true, aiConfigured: false });
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    selectTab('推演与分支');
    fireEvent.click(
      screen.getByRole('button', { name: /时效逾期 · 超过约定期限/ }),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    const form = within(screen.getByRole('form', { name: '固化违约分支' }));
    fireEvent.change(form.getByLabelText('已确认的触发条件'), {
      target: { value: '未按期交付' },
    });
    fireEvent.click(form.getByRole('radio', { name: '启动终极救济' }));
    fireEvent.change(form.getByLabelText('救济方式'), {
      target: { value: 'arbitration' },
    });
    await act(async () =>
      fireEvent.click(form.getByRole('button', { name: '保存救济分支' })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY));
    fireEvent.click(
      screen.getByRole('button', { name: '放映分支「仲裁移交凭证」' }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY));
    expect(screen.getByText(/继承自《采购履约流》/)).toHaveTextContent(
      '第 1 至 2 步',
    );
    expect(screen.getByRole('tabpanel', { name: '故事剧本' })).toBeVisible();
    expect(screen.getByRole('article', { name: '业务单据' })).toHaveTextContent(
      '仲裁移交凭证',
    );
  });

  it('shows a recoverable business message rather than a raw IPC rejection', async () => {
    const { api } = await setup();
    vi.mocked(api.story.whatIf).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'evidence:story:what-if': Error: No relevant completion/breach rule is modeled for this step.",
      ),
    );
    selectTab('推演与分支');
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    fireEvent.change(screen.getByRole('textbox', { name: '假设问题' }), {
      target: { value: '如果改动截止时间？' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    expect(screen.getByText(/当前步骤没有可用的完成或违约规则/)).toBeVisible();
    expect(screen.queryByText(/remote method/)).toBeNull();
  });

  it('explains missing examples and AI failures with a retry path', async () => {
    const empty = await setup({ empty: true });
    expect(screen.getByText(/请在场景工作台创建领域故事/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '选择业务流' })).toBeDisabled();
    expect(screen.queryByRole('tablist', { name: '故事视图' })).toBeNull();
    empty.view.unmount();
    await setup({ failure: true });
    expect(screen.getByText(/当前故事未能润色/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '重试润色' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: '仅模型事实' }),
    ).toBeInTheDocument();
  });
});
