import { Button } from '@evidence-poc/desktop-ui-kit';
import { RELATIONSHIP_FLOW_LABELS } from '@evidence-poc/evidence-schema';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import { StoryTimelineControls } from './StoryTimelineControls';

export interface StoryPlayerBarProps {
  playback: StoryPlaybackController;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
}

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
        disabled={playback.loading || playback.flows.length === 0}
        onChange={(event) => playback.selectFlow(event.currentTarget.value)}
        className="max-w-48 rounded border border-evidence-line bg-white px-2 py-1"
      >
        {playback.flows.length === 0 ? (
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
          ? '放映失败，请查看右侧故事面板'
          : playback.stepNumber > 0
            ? `步骤 ${playback.stepNumber}/${playback.stepCount}${playback.scene ? `：${playback.scene.activity.workObject.entityLabel}` : ''}`
            : playback.ready
              ? '时点推演 · 非业务凭证'
              : '暂无可放映的步骤'}
      {playback.clockUnavailable ? ' · 时间轴不可用' : null}
      {playback.blockedScenes.size > 0
        ? ` · 本次推演冻结 ${playback.blockedScenes.size} 幕`
        : null}
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
    {playback.narration.incomplete ? (
      <div className="flex items-center gap-1 text-evidence-muted">
        <span role="status">当前故事未能润色，仍可查看业务事实。</span>
        <Button size="xs" variant="ghost" onClick={playback.narration.retry}>
          重试润色
        </Button>
      </div>
    ) : null}
    <label
      className="flex items-center gap-1 text-evidence-muted"
      title="隐藏 AI 草稿，不读取缓存或重新生成；仍显示模型业务解释"
    >
      <input
        type="checkbox"
        checked={playback.skipAi}
        onChange={(event) => playback.setSkipAi(event.target.checked)}
      />
      仅模型事实
    </label>
    {!aiConfigured && onConfigureAi ? (
      <Button type="button" size="xs" variant="ghost" onClick={onConfigureAi}>
        配置旁白模型
      </Button>
    ) : null}
  </div>
);
