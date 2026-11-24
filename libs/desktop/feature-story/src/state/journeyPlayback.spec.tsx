import { act, renderHook, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  collectFlowScenarios,
  parseModelSourceFiles,
} from '@evidence-poc/evidence-model-core';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storySnapshot } from '@evidence-poc/desktop-testing/story';
import { StoryPlayerBar } from '../components/story/StoryPlayerBar';
import { STORY_REFRESH_DELAY, useStoryPlayback } from './useStoryPlayback';

afterEach(() => vi.useRealTimers());

it('walks across responsibility lanes, resets branch focus when switching scenarios and never saves', async () => {
  vi.useFakeTimers();
  const files = import.meta.glob<string>(
    '../../../../../examples/full-spectrum-procurement/.evidence/model/**/*.json',
    { eager: true, query: '?raw', import: 'default' },
  );
  const document = parseModelSourceFiles(
    Object.entries(files).map(([path, content]) => ({
      path: path.split('/.evidence/model/')[1]!,
      content,
    })),
  ).document;
  const before = JSON.stringify(document);
  const flows = collectFlowScenarios(document);
  const api = installDesktopApi();
  api.story.load = vi.fn(async ({ preferredFlowId }) =>
    storySnapshot(flows, preferredFlowId),
  );
  const hook = renderHook(() =>
    useStoryPlayback({
      api: api.story,
      document,
      enabled: true,
      rootPath: '/test',
      aiConfigured: false,
    }),
  );
  const load = async () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
    });
  await load();
  const advanceTo = (id: string) => {
    for (let i = 0; i < 30 && hook.result.current.step?.entityId !== id; i++)
      act(() => hook.result.current.next());
    expect(hook.result.current.step?.entityId).toBe(id);
  };
  act(() => hook.result.current.selectFlow('late-delivery'));
  expect(hook.result.current.canvasFocus).toBeNull();
  await load();
  advanceTo('conf-equipment-delivery');
  expect(hook.result.current.canvasFocus?.flowKind).toBe('breach_compensation');
  expect(hook.result.current.canvasFocus?.triggeredRuleIds).toContain(
    'rule-breach-detection-overdue',
  );
  const bar = render(<StoryPlayerBar playback={hook.result.current} />);
  expect(screen.getByLabelText('当前旅程分支')).toHaveTextContent('违约补偿');
  expect(screen.getByText(/发货交期逾期自动判定/)).toBeInTheDocument();
  act(() => hook.result.current.selectFlow('defect-escalation'));
  expect(hook.result.current.canvasFocus).toBeNull();
  await load();
  advanceTo('req-escrow-freeze');
  expect(hook.result.current.canvasFocus?.relatedEntityIds).toContain(
    'role-collateral-voucher',
  );
  expect(hook.result.current.canvasFocus?.flowKind).toBe('escalation');
  expect(hook.result.current.canvasFocus?.activeValues).toHaveProperty(
    'expired_at',
  );
  act(() => hook.result.current.selectFlow('happy-path'));
  await load();
  advanceTo('conf-escrow-release');
  bar.rerender(<StoryPlayerBar playback={hook.result.current} />);
  expect(screen.getByLabelText('当前旅程分支')).toHaveTextContent('正常履约');
  expect(hook.result.current.canvasFocus?.triggeredRuleIds).toEqual([]);
  expect(JSON.stringify(document)).toBe(before);
  expect(api.calls.persistence).toEqual([]);
});
