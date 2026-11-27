import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import {
  createEmptyDomainModel,
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
import {
  STORY_REFRESH_DELAY,
  useStoryPlayback,
} from '../../state/useStoryPlayback';
import { StoryDrawer } from './StoryDrawer';
import { StoryPlayerBar } from './StoryPlayerBar';

const setup = async ({
  empty = false,
  failure = false,
  timed = false,
  timedRules = false,
  breach = false,
  noRules = false,
  unassignedConfirmation = false,
  aiConfigured = true,
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
  const timedFlow = {
    ...flow,
    steps: flow.steps.map((step, index) => ({
      ...step,
      asOf: `2026-11-11T0${index + 1}:00:00Z`,
      values:
        index === 1
          ? {
              started_at: '2026-11-11T02:00:00Z',
              expired_at: '2026-11-11T02:30:00Z',
            }
          : index === 2
            ? { ...step.values, confirmed_at: '2026-11-11T03:00:00Z' }
            : step.values,
    })),
  };
  const selected = timed ? timedFlow : flow;
  api.story.load = vi.fn(async () => storySnapshot(empty ? [] : [selected]));
  api.story.enrichStep = vi.fn(() => new Promise<null>(() => undefined));
  if (failure)
    api.story.enrichStep = async () => {
      throw new Error('AI 未配置');
    };
  api.story.whatIf = vi.fn<typeof api.story.whatIf>(async (input) => {
    if (!input.document || !input.targetedRuleId || !input.hypothesisDraft)
      throw new Error('Expected a structured challenge');
    const graph = createDomainGraph(input.document);
    const step = selected.steps.find(
      (step) => step.sequence === input.currentStepSequence,
    );
    const rule = graph.getRule(input.targetedRuleId);
    if (!step || !rule)
      throw new Error('Expected the challenge’s scene and rule');
    const ruleOutcome = createWhatIfScenario(graph, selected.steps, step)
      .apply(input.hypothesisDraft)
      .decide(rule);
    return {
      isSpeculative: false,
      hypothesis: input.hypothesisDraft,
      ruleOutcome,
      ruleOutcomes: [ruleOutcome],
      businessImpactExplanation: rule.label,
    };
  });
  const document = empty ? createEmptyDomainModel() : createDesktopFixture();
  if (unassignedConfirmation) {
    const confirmation = document.entities.find(
      ({ id }) => id === 'evidence.confirmation',
    );
    if (confirmation?.category === 'evidence') delete confirmation.contextRef;
  }
  if ((timed && !timedRules) || noRules) document.rules = [];
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
    flow: selected,
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
    const { onReturnToCanvas } = await setup();
    expect(screen.getByRole('tabpanel', { name: '故事剧本' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'What-If 业务沙盘' }),
    ).toBeNull();
    expect(screen.queryByRole('region', { name: '时点履约状态' })).toBeNull();
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    expect(screen.getByRole('article', { name: '本幕叙事' })).toHaveTextContent(
      '采购方签署《采购协议》。',
    );
    expect(screen.getByText(/尚未同步到磁盘的画布版本/)).toBeInTheDocument();
    expect(screen.getByText(/可从状态栏重新加载/)).toBeInTheDocument();
    const spine = within(screen.getByRole('navigation', { name: '故事步骤' }));
    expect(spine.queryByRole('list')).toBeNull();
    fireEvent.click(spine.getByRole('button', { name: /展开全部 3 幕/ }));
    const steps = within(spine.getByRole('list')).getAllByRole('button');
    expect(steps.map((step) => step.textContent)).toEqual([
      '1采购方签署《采购协议》当前幕',
      '2供货方要求采购方验收交付成果（《交付请求》）',
      '3采购方记录「验收交付成果」的履约确认（《交付确认》）',
    ]);
    fireEvent.click(steps[1]!);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('第 2/3 步')).toBeVisible();
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

  it('shows remaining time against the scenario clock, not the wall clock', async () => {
    await setup({ timed: true, aiConfigured: false });
    selectTab('推演与分支');
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByText('距截止：0 小时 30 分 0 秒')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.queryByText(/距截止/)).toBeNull();
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

  it('distinguishes a missing result from a confirmation that fails a rule', async () => {
    await setup({ timed: true, timedRules: true });
    selectTab('推演与分支');
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(
      screen.getByRole('list', { name: '当前时点规则结果' }),
    ).toHaveTextContent('输入不足，未能求值');
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(
      screen.getByRole('list', { name: '当前时点规则结果' }),
    ).toHaveTextContent('条件不成立');
    expect(screen.queryByText('完成条件成立')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: '推演此步异常 →' }));
    expect(screen.getByRole('tab', { name: '推演与分支' })).toHaveFocus();
    expect(screen.getByRole('button', { name: '推演假设' })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: /时效逾期 · 超过约定期限/ }),
    );
    const question =
      '如果将「确认时间」推迟到「截止时间」后一天（2026-11-12T10:00:00.000Z），《交付确认》的判定结果会怎样？';
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue(
      question,
    );
    expect(api.story.whatIf).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    expect(api.story.whatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStepSequence: 3,
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
    expect(
      screen.getByText('rule.delivery-completion：条件不成立'),
    ).toBeVisible();
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    expect(screen.queryByRole('button', { name: '固化违约分支…' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /上一步/ }));
    expect(
      screen.queryByText('rule.delivery-completion：条件不成立'),
    ).toBeNull();
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
    expect(screen.getByText(/尚未建模相关的完成或违约规则/)).toBeVisible();
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
        currentStepSequence: 2,
        allowSpeculative: true,
      }),
    );
    expect(screen.getByText('AI 临时推想 · 非规则判定')).toBeVisible();
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
    fireEvent.click(screen.getByRole('button', { name: '推演此步异常 →' }));
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
    const ruleOutcome = { ruleId: 'rule.late', result: true };
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
  });

  it('shows guidance but no speculative form while AI is unconfigured', async () => {
    const { api } = await setup({ noRules: true, aiConfigured: false });
    const drawer = within(screen.getByRole('region', { name: '业务故事' }));
    expect(drawer.queryByText(/配置.*模型/)).toBeNull();
    expect(screen.getByRole('button', { name: '配置旁白模型' })).toBeVisible();
    selectTab('推演与分支');
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    expect(screen.getByText(/尚未建模相关的完成或违约规则/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '开启 AI 临时推想' }),
    ).toBeNull();
    expect(api.story.whatIf).not.toHaveBeenCalled();
  });

  it.each(['lawsuit', 'arbitration', 'contract_termination'] as const)(
    'records the agreed %s handoff after a breach and links to its evidence',
    async (remedy) => {
      const { api, recordOutcome, onOpenBranchEntity } = await setup({
        breach: true,
      });
      fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
      fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
      fireEvent.click(screen.getByRole('button', { name: '推演此步异常 →' }));
      fireEvent.click(
        screen.getByRole('button', { name: /时效逾期 · 超过约定期限/ }),
      );
      expect(api.story.whatIf).not.toHaveBeenCalled();
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
      );
      expect(screen.getByText('rule.late：条件成立')).toBeVisible();
      const form = within(screen.getByRole('form', { name: '固化违约分支' }));
      fireEvent.click(form.getByRole('radio', { name: '争议终结' }));
      const submit = form.getByRole('button', { name: '固化为争议终结' });
      fireEvent.click(submit);
      expect(recordOutcome).not.toHaveBeenCalled();
      fireEvent.change(
        form.getByRole('textbox', { name: '已确认的触发条件' }),
        { target: { value: ' 到期未交付 ' } },
      );
      fireEvent.change(form.getByRole('combobox', { name: '争议终结方式' }), {
        target: { value: remedy },
      });
      // A rejected edit must keep the user's agreement available for retry.
      recordOutcome.mockImplementationOnce(() => {
        throw new Error('请复核触发条件');
      });
      await act(async () => fireEvent.click(submit));
      expect(form.getByRole('alert')).toHaveTextContent('请复核触发条件');
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
    },
  );

  it('opens the specific scene in a playable branch created from a between-step breach', async () => {
    const { api, flow } = await setup({
      timed: true,
      timedRules: true,
      breach: true,
    });
    api.story.load = vi.fn<typeof api.story.load>(
      async ({ document, preferredFlowId }) => {
        const handoff = document?.entities.find(
          ({ label }) => label === '仲裁移交凭证',
        );
        if (!handoff)
          throw new Error('Expected a recorded arbitration handoff');
        const branch = {
          ...flow,
          flowId: 'dispute',
          flowTitle: '争议移交',
          steps: [
            flow.steps[0]!,
            {
              ...flow.steps[1]!,
              entityId: handoff.id,
              entityLabel: handoff.label,
              entityKind: handoff.kind,
            },
          ],
        };
        return storySnapshot([flow, branch], preferredFlowId);
      },
    );
    fireEvent.change(screen.getByRole('slider', { name: '业务时间' }), {
      target: { value: String(105 * 60_000) },
    });
    expect(
      screen.getByRole('region', { name: '时点履约状态' }),
    ).toHaveTextContent('违约条件成立');
    expect(screen.queryByRole('button', { name: '固化违约分支…' })).toBeNull();
    selectTab('推演与分支');
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '固化违约分支…' }));
    const form = within(screen.getByRole('form', { name: '固化违约分支' }));
    fireEvent.change(form.getByLabelText('已确认的触发条件'), {
      target: { value: '未按期交付' },
    });
    fireEvent.click(form.getByRole('radio', { name: '争议终结' }));
    fireEvent.change(form.getByLabelText('争议终结方式'), {
      target: { value: 'arbitration' },
    });
    await act(async () =>
      fireEvent.click(form.getByRole('button', { name: '固化为争议终结' })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY));
    fireEvent.click(
      screen.getByRole('button', { name: '放映分支「争议移交」' }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY));
    expect(screen.getByRole('combobox', { name: '选择业务流' })).toHaveValue(
      'dispute',
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

  it('keeps the elapsed scene and its document alongside the clock when seeking between steps', async () => {
    const { api } = await setup({ timed: true });
    fireEvent.change(screen.getByRole('slider', { name: '业务时间' }), {
      target: { value: String(105 * 60_000) },
    });
    expect(screen.getByText(/已过截止，未判定违约/)).toBeVisible();
    expect(screen.queryByRole('form', { name: '固化违约分支' })).toBeNull();
    expect(screen.getByRole('article', { name: '业务单据' })).toHaveTextContent(
      '《交付请求》',
    );
    expect(screen.getByRole('article', { name: '本幕叙事' })).toHaveTextContent(
      '供货方要求采购方验收交付成果',
    );
    expect(screen.getByText('已推进至第 2 步，等待后续时点。')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '假设问题' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('article', { name: '业务单据' })).toHaveTextContent(
      '交付确认',
    );
    expect(api.story.load).toHaveBeenCalledOnce();
    expect(api.story.whatIf).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('slider', { name: '业务时间' }), {
      target: { value: '-1' },
    });
    expect(screen.getByText('第一步尚未发生，等待业务开始。')).toBeVisible();
    expect(screen.queryByRole('article', { name: '业务单据' })).toBeNull();
  });

  it('can enter the local rehearsal after an AI narration failure', async () => {
    const { api } = await setup({ failure: true });
    expect(screen.getByText(/当前故事未能润色/)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: '选择业务流' }), {
      target: { value: '' },
    });
    expect(screen.queryByText(/当前故事未能润色/)).toBeNull();
    expect(screen.getByRole('tab', { name: '推演与分支' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: '故事剧本' })).toBeDisabled();
    fireEvent.change(
      screen.getByRole('spinbutton', { name: '假设窗口（小时）' }),
      { target: { value: '24' } },
    );
    expect(screen.getByRole('slider', { name: '业务时间' })).toBeEnabled();
    expect(api.story.load).toHaveBeenCalledOnce();
  });

  it('explains missing examples and AI failures with a retry path', async () => {
    const empty = await setup({ empty: true });
    expect(screen.getByText(/请为实体的业务示例声明/)).toBeInTheDocument();
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
