import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storyFlow, storySnapshot } from '@evidence-poc/desktop-testing/story';
import {
  STORY_REFRESH_DELAY,
  useStoryPlayback,
} from '../../state/useStoryPlayback';
import { StoryPlayerBar } from './StoryPlayerBar';

const setup = async () => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const flows = [storyFlow(), storyFlow('定金预售流')];
  api.story.load = vi.fn(async ({ preferredFlowId }) =>
    storySnapshot(flows, preferredFlowId),
  );
  api.story.enrichStep = vi.fn(() => new Promise<null>(() => undefined));
  api.story.cancelStep = vi.fn(async () => undefined);
  const document = createDesktopFixture();
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
        <output aria-label="当前步骤序号">
          {playback.currentStepSequence}
        </output>
      </>
    );
  };
  render(<Harness />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
  });
  return api;
};
afterEach(() => vi.useRealTimers());

describe('StoryPlayerBar', () => {
  it('steps through a flow and disables boundary buttons', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /上一步/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByLabelText('当前步骤序号')).toHaveTextContent('2');
    expect(screen.getByText('步骤 2/3：交付请求')).toBeInTheDocument();
    // Same-time steps remain independently addressable without inventing timestamps.
    expect(screen.getByRole('slider', { name: '业务时间' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '跳转时点' }), {
      target: { value: '1' },
    });
    expect(screen.getByLabelText('当前步骤序号')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('button', { name: /下一步/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /上一步/ }));
    expect(screen.getByLabelText('当前步骤序号')).toHaveTextContent('2');
  });

  it('switches flows and toggles playback/facts mode', async () => {
    const api = await setup();
    fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
    expect(screen.getByRole('button', { name: '暂停放映' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.change(screen.getByRole('combobox', { name: '选择业务流' }), {
      target: { value: '定金预售流' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
    });
    expect(api.story.load).toHaveBeenLastCalledWith(
      expect.objectContaining({ preferredFlowId: '定金预售流' }),
    );
    expect(screen.getByLabelText('当前步骤序号')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('checkbox', { name: '仅模型事实' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
    });
    expect(api.story.load).toHaveBeenCalledTimes(2);
    expect(api.story.cancelStep).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: /下一步/ })).toBeEnabled();
  });
});
