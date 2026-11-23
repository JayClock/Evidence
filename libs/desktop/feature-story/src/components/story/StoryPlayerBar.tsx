import { Button } from '@evidence-poc/desktop-ui-kit';
import { RELATIONSHIP_FLOW_LABELS } from '@evidence-poc/evidence-schema';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import {
  RehearsalControls,
  StoryTimelineControls,
} from './StoryTimelineControls';

export interface StoryPlayerBarProps {
  playback: StoryPlaybackController;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
}

/** A controller for declared examples, with explicitly local CEL rehearsal. */
export const StoryPlayerBar = ({
  playback,
  aiConfigured = true,
  onConfigureAi,
}: StoryPlayerBarProps) => (
  <div
    role="group"
    aria-label="业务流放映控制"
    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[11px]"
  >
    <label className="flex items-center gap-1">
      <span className="sr-only">选择业务流</span>
      <select
        aria-label="选择业务流"
        value={playback.activeFlowId ?? ''}
        disabled={
          playback.loading ||
          (playback.flows.length === 0 && !playback.rehearsal.active)
        }
        onChange={(event) => {
          const id = event.currentTarget.value;
          if (id) playback.selectFlow(id);
          else playback.rehearsal.select();
        }}
        className="max-w-48 rounded border border-evidence-line bg-white px-2 py-1"
      >
        {playback.rehearsal.requests.length > 0 ? (
          <option value="">履约时钟假设</option>
        ) : playback.flows.length === 0 ? (
          <option value="">暂无业务流</option>
        ) : null}
        {playback.flows.map((flow) => (
          <option key={flow.flowId} value={flow.flowId}>
            {flow.flowTitle}
          </option>
        ))}
      </select>
    </label>
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-workbench-border p-0.5">
      <Button
        size="xs"
        variant="ghost"
        disabled={!playback.canPrevious}
        onClick={playback.previous}
      >
        ◀ 上一步
      </Button>
      <Button
        size="xs"
        variant={playback.isPlaying ? 'default' : 'ghost'}
        disabled={!playback.canPlay}
        aria-pressed={playback.isPlaying}
        onClick={playback.togglePlaying}
      >
        {playback.isPlaying ? '暂停放映' : '自动播放'}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={!playback.canNext}
        onClick={playback.next}
      >
        下一步 ▶
      </Button>
    </div>
    {playback.rehearsal.active ? (
      <RehearsalControls rehearsal={playback.rehearsal} />
    ) : null}
    <StoryTimelineControls playback={playback} />
    <select
      aria-label="播放速度"
      value={playback.speed}
      disabled={!playback.canPlay}
      onChange={(event) => playback.setSpeed(Number(event.currentTarget.value))}
      className="rounded border border-evidence-line bg-evidence-surface px-2 py-1"
    >
      {[1, 2, 5].map((speed) => (
        <option key={speed} value={speed}>
          {speed}×
        </option>
      ))}
    </select>
    <span
      className="min-w-0 text-evidence-muted"
      aria-live="polite"
      aria-atomic="true"
    >
      {playback.loading
        ? '正在读取业务流…'
        : playback.error
          ? '放映失败，请查看剧情详情'
          : playback.rehearsal.active
            ? '履约时钟假设 · 不写入模型'
            : playback.stepNumber > 0
              ? `步骤 ${playback.stepNumber}/${playback.stepCount}${playback.scene ? `：${playback.scene.phaseTitle}` : ''}`
              : playback.ready
                ? '时点推演 · 非业务凭证'
                : '暂无可放映的步骤'}
      {playback.clockUnavailable ? ' · 时间轴不可用' : null}
    </span>
    {playback.journeyPreview ? (
      <span
        aria-label="当前旅程分支"
        data-journey-flow={playback.journeyPreview.flowKind}
        className="rounded border px-2 py-1"
        style={{
          color:
            playback.journeyPreview.flowKind === 'escalation'
              ? '#7e22ce'
              : playback.journeyPreview.flowKind === 'breach_compensation'
                ? '#b42318'
                : '#21835b',
        }}
        title="仅对当前场景已展示的样例事实做本地 CEL 预演；不是 HTTP 验收。"
      >
        {RELATIONSHIP_FLOW_LABELS[playback.journeyPreview.flowKind]} · 本地预演
      </span>
    ) : null}
    {playback.journeyPreview?.triggeredRuleIds.map((id) => (
      <span
        key={id}
        role="status"
        data-triggered-rule={id}
        className="max-w-72 truncate rounded bg-[#fff1f0] px-2 py-1 text-[#b42318]"
        title={id}
      >
        ⚠{' '}
        {playback.journeyPreview?.rules.find((r) => r.id === id)?.label ?? id}
      </span>
    ))}
    {playback.journeyPreview?.rules
      .filter((r) => r.error)
      .map((r) => (
        <span
          key={r.id}
          role="status"
          className="text-[#8d6200]"
          title={r.error}
        >
          规则预演未知：{r.label}
        </span>
      ))}
    {playback.narration.running ? (
      <label className="flex items-center gap-1 text-evidence-muted">
        <span>
          AI 旁白 {playback.narration.completed}/{playback.narration.total}
        </span>
        <progress
          aria-label="AI 旁白生成进度"
          className="w-16"
          max={playback.narration.total}
          value={playback.narration.completed}
        />
      </label>
    ) : null}
    {playback.narration.incomplete ? (
      <div className="flex items-center gap-1 text-evidence-muted">
        <span role="status">部分旁白未生成，仍可放映模型事实。</span>
        <Button size="xs" variant="ghost" onClick={playback.narration.retry}>
          重试旁白
        </Button>
      </div>
    ) : null}
    {!playback.rehearsal.active ? (
      <label
        className="flex items-center gap-1 text-evidence-muted"
        title="不自动生成 AI 旁白；模型事实和本地预演仍可用"
      >
        <input
          type="checkbox"
          checked={playback.skipAi}
          onChange={(event) => {
            if (!event.target.checked && !aiConfigured) {
              onConfigureAi?.();
              return;
            }
            playback.setSkipAi(event.target.checked);
          }}
        />
        仅模型事实
      </label>
    ) : null}
  </div>
);
