import { useId, useState } from 'react';
import { Badge, Button, cn } from '@evidence-poc/desktop-ui-kit';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import type { StoryFork } from '../../state/storyForks';

type BranchActions = {
  onPlayBranch: StoryPlaybackController['selectFlow'];
  onOpenBranchEntity?: (nodeId: string) => void;
};

const ForkItem = ({
  fork: { outcome, destinations },
  ready,
  onPlayBranch,
  onOpenBranchEntity,
}: {
  fork: StoryFork;
  ready: boolean;
} & BranchActions) => {
  const entity =
    outcome.kind === 'compensation_pair'
      ? outcome.compensation.request
      : outcome.handoff;
  return (
    <li className="flex min-w-0 flex-col items-start gap-1 border-s-2 border-evidence-role ps-3">
      <details className="w-full">
        <summary className="cursor-pointer break-words py-1 font-medium">
          {outcome.kind === 'compensation_pair' ? '约定履约补救' : '终极救济'} ·{' '}
          {entity.label}
        </summary>
        <div className="flex flex-col items-start gap-1 break-words py-1">
          {outcome.edge.notes ? <p>触发条件：{outcome.edge.notes}</p> : null}
          {outcome.kind === 'compensation_pair' ? (
            <>
              <p>
                发起《{entity.label}》
                {outcome.compensation.request.fulfillmentAction
                  ? `，要求${outcome.compensation.request.fulfillmentAction}`
                  : ''}
                。
              </p>
              <p>
                履约确认：
                {outcome.compensation.confirmations
                  .map(({ label }) => `《${label}》`)
                  .join('、') || '待约定'}
              </p>
            </>
          ) : (
            <p>以《{entity.label}》移交争议处理。</p>
          )}
          {onOpenBranchEntity ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!ready}
              onClick={() => onOpenBranchEntity(entity.id)}
            >
              查看分支凭证
            </Button>
          ) : null}
        </div>
      </details>
      {destinations.map(({ flow, step }) => (
        <Button
          key={flow.flowId}
          type="button"
          size="xs"
          variant="outline"
          className="h-auto max-w-full whitespace-normal break-words"
          disabled={!ready}
          onClick={() => onPlayBranch(flow.flowId, step)}
        >
          放映「{flow.flowTitle}」
        </Button>
      ))}
    </li>
  );
};

export const StoryOutlineSpine = ({
  playback,
  onExploreStep,
  onPlayBranch,
  onOpenBranchEntity,
}: {
  playback: StoryPlaybackController;
  onExploreStep: (sequence: number) => void;
} & BranchActions) => {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { scenes, anchoredScene: current, isBetweenSteps } = playback;
  if (!scenes.length) return null;
  const currentForks = current && playback.forksByStep?.get(current.stepIndex);
  return (
    <nav
      aria-label="故事步骤"
      className="shrink-0 border-b border-workbench-border px-3 py-2"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-7 w-full items-center gap-2 rounded text-start hover:bg-evidence-hover"
      >
        {current ? (
          <Badge variant={isBetweenSteps ? 'outline' : 'default'}>
            {current.stepIndex}
          </Badge>
        ) : null}
        <span className="min-w-0 flex-1 break-words font-medium">
          {current?.narrative.headline ?? '等待第一步'}
          {current && isBetweenSteps ? (
            <small className="ms-1 text-evidence-muted">已发生</small>
          ) : null}
        </span>
        {currentForks?.length ? (
          <Badge variant="role">{currentForks.length} 个分支</Badge>
        ) : null}
        <span className="shrink-0 text-[11px] text-evidence-muted">
          {expanded ? '收起' : `展开全部 ${scenes.length} 幕`}
        </span>
      </button>
      <ol
        id={listId}
        hidden={!expanded}
        className="max-h-[25vh] overflow-y-auto overscroll-contain"
      >
        {expanded &&
          scenes.map(({ stepIndex, narrative }) => {
            const active = stepIndex === current?.stepIndex;
            const blocked = playback.blockedScenes.has(stepIndex);
            const forks = playback.forksByStep?.get(stepIndex);
            return (
              <li key={stepIndex}>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className={cn(
                      'h-auto min-h-7 min-w-0 flex-1 justify-start whitespace-normal text-start',
                      blocked && 'text-evidence-muted bg-evidence-hover',
                    )}
                    aria-current={
                      active && !isBetweenSteps ? 'step' : undefined
                    }
                    disabled={!playback.ready}
                    onClick={() => playback.jumpToStep(stepIndex)}
                  >
                    <Badge
                      variant={
                        active && !isBetweenSteps ? 'default' : 'outline'
                      }
                    >
                      {stepIndex}
                    </Badge>
                    <span className="min-w-0 break-words">
                      {narrative.headline}
                    </span>
                    {blocked ? <Badge variant="secondary">已冻结</Badge> : null}
                    {playback.breachedStep === stepIndex ? (
                      <Badge variant="destructive">触发违约</Badge>
                    ) : null}
                    {active ? (
                      <small className="ms-auto shrink-0">
                        {isBetweenSteps ? '已发生' : '当前幕'}
                      </small>
                    ) : null}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={`推演第 ${stepIndex} 幕`}
                    disabled={!playback.ready}
                    onClick={() => onExploreStep(stepIndex)}
                  >
                    推演
                  </Button>
                </div>
                {forks?.length ? (
                  <ul
                    aria-label={`第 ${stepIndex} 幕的违约分支`}
                    className="ms-4 flex flex-col gap-1 py-1"
                  >
                    {forks.map((fork) => (
                      <ForkItem
                        key={fork.outcome.edge.id}
                        fork={fork}
                        ready={playback.ready}
                        onPlayBranch={onPlayBranch}
                        onOpenBranchEntity={onOpenBranchEntity}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
      </ol>
    </nav>
  );
};
