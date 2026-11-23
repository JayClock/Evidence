import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storyFlow, storyResult } from '@evidence-poc/desktop-testing/story';
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
} = {}) => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const flow = storyFlow();
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
  api.story.listFlows = vi.fn(async () => (empty ? [] : [selected]));
  api.story.project = vi.fn(async () => {
    if (failure) throw new Error('AI 未配置');
    return storyResult(selected);
  });
  api.story.whatIf = vi.fn(async () => ({
    isSpeculative: false as const,
    hypothesis: { values: { amount: 300 } },
    ruleOutcome: { ruleId: 'rule.payment', result: false },
    ruleOutcomes: [{ ruleId: 'rule.payment', result: false }],
    businessImpactExplanation: '付款不足，未满足结清条件。',
  }));
  const document = empty ? createEmptyDomainModel() : createDesktopFixture();
  if (timed) document.rules = [];
  const Harness = () => {
    const playback = useStoryPlayback({
      api: window.evidenceAPI.story,
      rootPath: '/models/test',
      document,
      enabled: true,
    });
    return (
      <>
        <StoryPlayerBar playback={playback} />
        <StoryDrawer playback={playback} dirty externalConflict />
      </>
    );
  };
  const view = render(<Harness />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
  });
  return { api, view };
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
    expect(screen.getByText('核心要素')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '剧情旁白' })).toHaveTextContent(
      '采购方办理采购协议。',
    );
    expect(screen.getByText(/包含未保存的画布修改/)).toBeInTheDocument();
    expect(screen.getByText(/保留本地未保存修改/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByLabelText('业务缺口')).toHaveTextContent(
      '请问谁负责确认？',
    );
  });

  it('copies prose and reports clipboard failure honestly', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await setup();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '复制旁白' })),
    );
    expect(writeText).toHaveBeenCalledWith('采购方办理采购协议。');
    expect(screen.getByText('旁白已复制。')).toBeInTheDocument();
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '复制旁白' })),
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
    fireEvent.click(screen.getByRole('button', { name: '朗读旁白' }));
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: '采购方办理采购协议。', lang: 'zh-CN' }),
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

  it('submits a read-only current-step question and clears the answer after stepping', async () => {
    const { api } = await setup();
    expect(screen.getByRole('button', { name: '推演假设' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '填入示例问题' }));
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: '假设问题' })
        .value,
    ).toContain('无法按期完成');
    expect(api.story.whatIf).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: '假设问题' }), {
      target: { value: '如果只付300会怎样？' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '推演假设' })),
    );
    expect(api.story.whatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStepSequence: 1,
        stepHash: 'step-0',
        question: '如果只付300会怎样？',
      }),
    );
    expect(screen.getByText('付款不足，未满足结清条件。')).toBeInTheDocument();
    expect(screen.getByText('rule.payment：条件不成立')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(
      screen.queryByText('付款不足，未满足结清条件。'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '假设问题' })).toHaveValue('');
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
    expect(api.story.project).toHaveBeenCalledOnce();
    expect(api.story.whatIf).not.toHaveBeenCalled();
  });

  it('can enter the local rehearsal after an AI narration failure', async () => {
    const { api } = await setup({ failure: true });
    expect(screen.getByText('AI 未配置')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: '选择业务流' }), {
      target: { value: '' },
    });
    expect(screen.queryByText('AI 未配置')).toBeNull();
    fireEvent.change(
      screen.getByRole('spinbutton', { name: '假设窗口（小时）' }),
      { target: { value: '24' } },
    );
    expect(screen.getByRole('slider', { name: '业务时间' })).toBeEnabled();
    expect(api.story.project).toHaveBeenCalledOnce();
  });

  it('explains missing examples and AI failures with a retry path', async () => {
    const empty = await setup({ empty: true });
    expect(screen.getByText(/请为实体的业务示例声明/)).toBeInTheDocument();
    empty.view.unmount();
    await setup({ failure: true });
    expect(screen.getByText('AI 未配置')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '重试放映' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: '仅模型事实' }),
    ).toBeInTheDocument();
  });
});
