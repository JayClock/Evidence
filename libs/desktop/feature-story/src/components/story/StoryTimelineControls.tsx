import {
  MAX_REHEARSAL_HOURS,
  type StoryTimeline,
} from '@evidence-poc/evidence-model-core';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';

export const durationLabel = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fraction = Math.round(milliseconds % 1000);
  return `${hours} 小时 ${minutes} 分 ${seconds}${fraction ? `.${String(fraction).padStart(3, '0')}` : ''} 秒`;
};

export const timelineLabel = (timeline: StoryTimeline, time: number) =>
  timeline.kind === 'examples'
    ? `${new Date(time).toISOString().slice(0, -1).replace('T', ' ')} UTC`
    : `T+${durationLabel(time - timeline.start)}`;

export const RehearsalControls = ({
  rehearsal,
}: {
  rehearsal: StoryPlaybackController['rehearsal'];
}) => (
  <div className="flex min-w-0 flex-wrap items-center gap-2">
    <select
      aria-label="假设履约请求"
      value={rehearsal.requestId ?? ''}
      onChange={(event) => rehearsal.setRequest(event.currentTarget.value)}
      className="max-w-44 rounded border border-evidence-line bg-evidence-surface px-2 py-1"
    >
      {rehearsal.requests.map(({ id, label }) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
    {rehearsal.hasClockFields ? (
      <label className="flex items-center gap-1">
        假设窗口（小时）
        <input
          type="number"
          min={1}
          max={MAX_REHEARSAL_HOURS}
          step={1}
          value={rehearsal.windowHours}
          onChange={(event) =>
            rehearsal.setWindowHours(event.currentTarget.value)
          }
          className="w-18 rounded border border-evidence-line bg-evidence-surface px-2 py-1"
        />
      </label>
    ) : (
      <span className="text-evidence-muted">此请求尚未定义起止时标。</span>
    )}
  </div>
);

export const StoryTimelineControls = ({
  playback,
}: {
  playback: StoryPlaybackController;
}) => {
  const { timeline, currentTime, seekStart } = playback;
  if (!timeline || currentTime === undefined || seekStart === null) return null;
  const range = timeline.end - timeline.start;
  const sliderRange = timeline.end - seekStart;
  const label = timelineLabel(timeline, currentTime);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <label className="flex flex-col">
        <span className="sr-only">业务时间</span>
        <span aria-hidden="true" className="relative mx-2 h-2">
          {timeline.marks.map((mark, index) => (
            <span
              key={index}
              className={
                mark.kind === 'deadline'
                  ? 'absolute top-1 size-1.5 -translate-x-1/2 rotate-45 bg-evidence-role'
                  : 'absolute top-1 size-1.5 -translate-x-1/2 rounded-full bg-evidence-accent'
              }
              style={{
                left: `${range === 0 ? 0 : (100 * (mark.time - seekStart)) / sliderRange}%`,
              }}
            />
          ))}
        </span>
        <input
          type="range"
          aria-valuetext={label}
          min={seekStart - timeline.start}
          max={range}
          step="any"
          value={currentTime - timeline.start}
          disabled={!playback.ready || range === 0}
          onChange={(event) =>
            playback.seek(timeline.start + event.currentTarget.valueAsNumber)
          }
          className="h-8 w-32 cursor-pointer accent-evidence-accent xl:w-50"
        />
      </label>
      <span
        aria-hidden="true"
        className="font-mono tabular-nums text-evidence-muted"
      >
        {label}
      </span>
      <select
        aria-label="跳转时点"
        value=""
        disabled={!playback.ready}
        onChange={(event) => {
          if (!event.currentTarget.value) return;
          const mark = timeline.marks[Number(event.currentTarget.value)];
          if (mark) playback.seek(mark.time, mark.stepIndex);
        }}
        className="max-w-40 rounded border border-evidence-line bg-evidence-surface px-2 py-1"
      >
        <option value="" disabled>
          跳转时点
        </option>
        {timeline.marks.map((mark, index) => (
          <option key={index} value={index}>
            {mark.stepIndex === undefined ? '' : `${mark.stepIndex + 1}. `}
            {mark.label} · {timelineLabel(timeline, mark.time)}
          </option>
        ))}
      </select>
    </div>
  );
};
