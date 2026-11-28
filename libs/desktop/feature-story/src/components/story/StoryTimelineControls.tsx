import type { StoryPlaybackController } from '../../state/useStoryPlayback';

export const durationLabel = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fraction = Math.round(milliseconds % 1000);
  return `${hours} 小时 ${minutes} 分 ${seconds}${fraction ? `.${String(fraction).padStart(3, '0')}` : ''} 秒`;
};

export const timelineLabel = (time: number) =>
  `${new Date(time).toISOString().slice(0, -1).replace('T', ' ')} UTC`;

export const StoryTimelineControls = ({
  playback,
}: {
  playback: StoryPlaybackController;
}) => {
  const { timeline, currentTime, seekStart } = playback;
  if (!timeline || currentTime === undefined || seekStart === null) return null;
  const range = timeline.end - timeline.start;
  const sliderRange = timeline.end - seekStart;
  const label = timelineLabel(currentTime);
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
            {mark.label} · {timelineLabel(mark.time)}
          </option>
        ))}
      </select>
    </div>
  );
};
