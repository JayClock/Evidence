import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storyFlow, storySnapshot } from '@evidence-poc/desktop-testing/story';
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
  noRules = false,
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
          : step.values,
    })),
  };
  const selected = timed ? timedFlow : flow;
  api.story.load = vi.fn(async () => storySnapshot(empty ? [] : [selected]));
  if (failure)
    api.story.enrichStep = async () => {
      throw new Error('AI 未配置');
    };
  api.story.whatIf = vi.fn(async () => ({
    isSpeculative: false as const,
    hypothesis: { values: { amount: 300 } },
    ruleOutcome: { ruleId: 'rule.payment', result: false },
    ruleOutcomes: [{ ruleId: 'rule.payment', result: false }],
    businessImpactExplanation: '付款不足，未满足结清条件。',
  }));
  const document = empty ? createEmptyDomainModel() : createDesktopFixture();
  if (timed || noRules) document.rules = [];
  const onRevealOnCanvas = vi.fn();
  const Harness = () => {
    const playback = useStoryPlayback({
      api: window.evidenceAPI.story,
      rootPath: '/models/test',
      document,
      enabled: true,
      aiConfigured,
    });
    return (
      <>
        <StoryPlayerBar playback={playback} />
        <StoryDrawer
          playback={playback}
          aiConfigured={aiConfigured}
          onRevealOnCanvas={onRevealOnCanvas}
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
  return { api, view, onRevealOnCanvas };
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('StoryDrawer', () => {
  it('renders a paper document with key data, narrative and gap questions instead of JSON', async () => {
    await setup();
    expect(screen.getByRole('article', { name: '业务单据' })).toHaveTextContent(
      '采购协议',
    );
    expect(screen.getByText('核心商业要素')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '领域故事' })).toHaveTextContent(
      '采购方签署《采购协议》。',
    );
    expect(screen.getByText(/尚未同步到磁盘的画布版本/)).toBeInTheDocument();
    expect(screen.getByText(/可从状态栏重新加载/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByLabelText('协同闭环')).toHaveTextContent(
      '待采购方落实交付确认',
    );
    expect(screen.getByText('承前流转')).toBeInTheDocument();
    expect(screen.getByText('业务归档要素')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '第 1 步' }));
    expect(screen.getByRole('article', { name: '领域故事' })).toHaveTextContent(
      '采购方签署《采购协议》',
    );
  });

  it('copies prose and reports clipboard failure honestly', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await setup();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '复制故事' })),
    );
    expect(writeText).toHaveBeenCalledWith(
      '采购方签署《采购协议》\n\n采购方签署《采购协议》。',
    );
    expect(screen.getByText('故事已复制。')).toBeInTheDocument();
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '复制故事' })),
    );
    expect(screen.getByText(/复制失败/)).toBeInTheDocument();
  });

  it('cancels speech on navigation and unmount', async () => {
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel, speak });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    const { view } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '朗读故事' }));
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '采购方签署《采购协议》\n\n采购方签署《采购协议》。',
        lang: 'zh-CN',
      }),
    );
    expect(
      screen.getByRole('button', { name: '停止朗读' }),
    ).toBeInTheDocument();
    cancel.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(cancel).toHaveBeenCalled();
    cancel.mockClear();
    view.unmount();
    expect(cancel).toHaveBeenCalled();
  });

  it('does not offer a question on the contract and jumps to a fulfillment step', async () => {
    const { api } = await setup();
    expect(screen.getByText(/合同步骤记录双方的约定/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '假设问题' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: '开启 AI 临时推想' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    expect(
      screen.getByRole('heading', { name: 'What-If 业务沙盘' }),
    ).toHaveFocus();
    expect(screen.getByRole('article', { name: '业务单据' })).toHaveTextContent(
      '交付请求',
    );
    expect(api.story.whatIf).not.toHaveBeenCalled();
  });

  it('submits a strict question about the confirmation and clears the answer after stepping', async () => {
    const { api } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('button', { name: '推演假设' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '填入示例问题' }));
    const question =
      '如果「确认时间」比该示例晚一小时，改为 2026-11-11T09:00:00.000Z，判定结果会怎样？';
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
      }),
    );
    expect(vi.mocked(api.story.whatIf).mock.calls[0]![0]).not.toHaveProperty(
      'allowSpeculative',
    );
    expect(screen.getByText('rule.payment：条件不成立')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /上一步/ }));
    expect(screen.queryByText('rule.payment：条件不成立')).toBeNull();
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue('');
  });

  it('requires explicit AI opt-in without rules and displays no verdict for the result', async () => {
    const { api, onRevealOnCanvas } = await setup({ noRules: true });
    vi.mocked(api.story.whatIf).mockResolvedValue({
      isSpeculative: true,
      ruleOutcomes: [],
      businessImpactExplanation: '后续入库可能延迟。',
    });
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    expect(screen.getByText(/尚未建模相关的完成或违约规则/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '假设问题' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '在画布定位凭证' }));
    expect(onRevealOnCanvas).toHaveBeenCalledWith('evidence.request');
    fireEvent.click(screen.getByRole('button', { name: '开启 AI 临时推想' }));
    fireEvent.click(screen.getByRole('button', { name: '填入示例问题' }));
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
    expect(screen.queryByText(/条件不成立|条件成立/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '退出 AI 临时推想' }));
    fireEvent.click(screen.getByRole('button', { name: '开启 AI 临时推想' }));
    expect(screen.queryByText('后续入库可能延迟。')).toBeNull();
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.queryByRole('textbox', { name: '假设问题' })).toBeNull();
  });

  it('shows guidance but no speculative form while AI is unconfigured', async () => {
    const { api } = await setup({ noRules: true, aiConfigured: false });
    fireEvent.click(screen.getByRole('button', { name: '前往「交付请求」' }));
    expect(screen.getByText(/尚未建模相关的完成或违约规则/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '开启 AI 临时推想' }),
    ).toBeNull();
    expect(api.story.whatIf).not.toHaveBeenCalled();
  });

  it('shows a recoverable business message rather than a raw IPC rejection', async () => {
    const { api } = await setup();
    vi.mocked(api.story.whatIf).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'evidence:story:what-if': Error: No relevant completion/breach rule is modeled for this step.",
      ),
    );
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

  it('seeks between steps locally, hides the future document and then resumes the story', async () => {
    const { api } = await setup({ timed: true });
    fireEvent.change(screen.getByRole('slider', { name: '业务时间' }), {
      target: { value: String(105 * 60_000) },
    });
    expect(screen.getByText(/已过截止，未判定违约/)).toBeVisible();
    expect(screen.queryByRole('article', { name: '业务单据' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('article', { name: '业务单据' })).toHaveTextContent(
      '交付确认',
    );
    expect(api.story.load).toHaveBeenCalledOnce();
    expect(api.story.whatIf).not.toHaveBeenCalled();
  });

  it('can enter the local rehearsal after an AI narration failure', async () => {
    const { api } = await setup({ failure: true });
    expect(screen.getByText(/当前故事未能润色/)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: '选择业务流' }), {
      target: { value: '' },
    });
    expect(screen.queryByText(/当前故事未能润色/)).toBeNull();
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
