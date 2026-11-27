import { Button } from '@evidence-poc/desktop-ui-kit';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import { durationLabel, timelineLabel } from './StoryTimelineControls';
import { WhatIfSection } from './WhatIfSection';
import { BreachOutcomeDisclosure } from './BreachOutcomeForm';

const statusLabel = {
  waiting: '窗口内等待',
  completed: '完成条件成立',
  overdue: '已过截止，未判定违约',
  breached: '违约条件成立',
  unknown: '待定：缺少可求值的约定或输入',
} as const;

export const TimelineDetails = ({
  playback,
  sceneClock,
}: {
  playback: StoryPlaybackController;
  sceneClock?: StoryPlaybackController['sceneClock'];
}) => {
  const { timeline } = playback;
  const currentTime = sceneClock?.time ?? playback.currentTime;
  const obligations = sceneClock?.obligations ?? playback.focusedObligations;
  if (!timeline || currentTime === undefined) return null;
  return (
    <section
      aria-label="时点履约状态"
      className="flex flex-col gap-2 rounded border border-evidence-line p-3"
    >
      <h3 className="font-medium">
        时点履约状态 · {timelineLabel(timeline, currentTime)}
      </h3>
      {sceneClock &&
      sceneClock.obligations.length > 0 &&
      sceneClock.end > sceneClock.start ? (
        <label className="flex flex-col gap-1">
          本幕假设时钟
          <input
            type="range"
            min={0}
            max={sceneClock.end - sceneClock.start}
            step="any"
            value={currentTime - sceneClock.start}
            aria-valuetext={timelineLabel(timeline, currentTime)}
            onChange={(event) =>
              playback.setSceneTime(
                sceneClock.start + event.currentTarget.valueAsNumber,
              )
            }
            className="w-full accent-evidence-accent"
          />
        </label>
      ) : null}
      <p className="text-[11px] text-evidence-muted">
        {timeline.kind === 'rehearsal'
          ? '假设在 T0 发起且尚无确认，按输入的实际经过小时推演，不推断工作日或合同条款。'
          : '仅用当前示例中在该时点可见的数据预演；缺失或未求出的输入不作推断。'}
      </p>
      {obligations.length === 0 ? <p>该时点没有可预演的履约请求。</p> : null}
      <ul className="flex flex-col gap-2">
        {obligations.map(
          ({ key, label, deadline, status, ruleResults, responses }) => (
            <li key={key} className="border-t border-evidence-line pt-2">
              <p>
                <strong>{label}</strong> · {statusLabel[status]}
              </p>
              {deadline === undefined ? null : (
                <p>截止：{timelineLabel(timeline, deadline)}</p>
              )}
              {status === 'waiting' && deadline !== undefined ? (
                <p>
                  距截止：{durationLabel(Math.max(0, deadline - currentTime))}
                </p>
              ) : null}
              {ruleResults.length ? (
                <ul
                  aria-label="当前时点规则结果"
                  className="mt-1 flex flex-col gap-0.5 ps-3"
                >
                  {ruleResults.map(({ id, label: rule, status }) => (
                    <li key={id}>
                      {rule}：
                      {status === 'satisfied'
                        ? '条件成立'
                        : status === 'unsatisfied'
                          ? '条件不成立'
                          : '输入不足，未能求值'}
                    </li>
                  ))}
                </ul>
              ) : null}
              {responses.length ? (
                <p>
                  模型中的处置选项（未发生）：
                  {responses.map(({ label }) => label).join('、')}
                </p>
              ) : null}
            </li>
          ),
        )}
      </ul>
      <p className="text-[11px] text-evidence-muted">
        假设时点与规则判定仅用于本次推演。
      </p>
    </section>
  );
};

export const StorySandboxPane = ({
  playback,
  aiConfigured,
  context,
  reviewPending,
  onOpenBranchEntity,
  onPlayBranch,
}: {
  playback: StoryPlaybackController;
  aiConfigured: boolean;
  context?: string;
  reviewPending: boolean;
  onOpenBranchEntity?: (nodeId: string) => void;
  onPlayBranch: StoryPlaybackController['selectFlow'];
}) => {
  const { promotedBranch, anchoredStep, rehearsal } = playback;
  const branchFlow = promotedBranch?.flow;
  const request =
    rehearsal.active &&
    rehearsal.requests.find(({ id }) => id === rehearsal.requestId);
  return (
    <div className="flex flex-col gap-3">
      {request ? (
        <p>
          假设从「{request.label}」开始计时。
          {playback.timeline
            ? null
            : rehearsal.hasClockFields
              ? '在播放条输入假设窗口以开始推演。'
              : '请先为这项请求补齐起止时标。'}
        </p>
      ) : context ? (
        <p className="text-evidence-muted">{context}</p>
      ) : null}
      {playback.ready ? (
        <TimelineDetails playback={playback} sceneClock={playback.sceneClock} />
      ) : null}
      <WhatIfSection playback={playback} aiConfigured={aiConfigured} />
      {playback.promotionRequests.length ? (
        <BreachOutcomeDisclosure
          key={`${playback.snapshotId ?? playback.rehearsal.requestId}:${anchoredStep?.stepHash}:${playback.sceneClock?.time ?? playback.currentTime}:${playback.hasSandboxBreach}`}
          playback={playback}
        />
      ) : null}
      {!reviewPending && promotedBranch ? (
        branchFlow ? (
          <Button
            className="self-start"
            onClick={() => onPlayBranch(branchFlow.flowId, promotedBranch.step)}
          >
            放映分支「{branchFlow.flowTitle}」
          </Button>
        ) : onOpenBranchEntity ? (
          <Button
            className="self-start"
            onClick={() => onOpenBranchEntity(promotedBranch.entity.id)}
          >
            在画布查看「{promotedBranch.entity.label}」
          </Button>
        ) : null
      ) : null}
    </div>
  );
};
