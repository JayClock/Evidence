import { useId, useState } from 'react';
import { Badge, Button } from '@evidence-poc/desktop-ui-kit';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';

export const StoryOutlineSpine = ({
  playback,
  onExploreStep,
}: {
  playback: StoryPlaybackController;
  onExploreStep: (sequence: number) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { scenes, anchoredScene: current, isBetweenSteps } = playback;
  if (!scenes.length) return null;
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
            return (
              <li key={stepIndex} className="flex items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-auto min-h-7 min-w-0 flex-1 justify-start whitespace-normal text-start"
                  aria-current={active && !isBetweenSteps ? 'step' : undefined}
                  disabled={!playback.ready}
                  onClick={() => playback.jumpToStep(stepIndex)}
                >
                  <Badge
                    variant={active && !isBetweenSteps ? 'default' : 'outline'}
                  >
                    {stepIndex}
                  </Badge>
                  <span className="min-w-0 break-words">
                    {narrative.headline}
                  </span>
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
              </li>
            );
          })}
      </ol>
    </nav>
  );
};
