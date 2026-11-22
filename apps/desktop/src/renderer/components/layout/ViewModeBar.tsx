import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Clapperboard, Compass, X } from 'lucide-react';

import { Button } from '@evidence-poc/desktop-ui-kit';

type ViewModeBarProps =
  | { storyActive: false; canPlay: boolean; onOpenStory: () => void }
  | { storyActive: true; storyControls: ReactNode; onCloseStory: () => void };

/** The journey is the canvas, not a mode; playback is a separate action. */
export const ViewModeBar = (props: ViewModeBarProps) => {
  const actionRef = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(props.storyActive);
  const storyActive = props.storyActive;
  useLayoutEffect(() => {
    if (!storyActive && wasActive.current)
      actionRef.current?.focus({ preventScroll: true });
    wasActive.current = storyActive;
  }, [storyActive]);

  const ledgerChord = navigator.userAgent.includes('Macintosh')
    ? '⌘1'
    : 'Ctrl+1';
  return (
    <div
      data-canvas-control=""
      data-evidence-capture-hide=""
      data-story-toolbar=""
      data-workbench-chrome=""
      className="flex min-h-[38px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-workbench-border bg-white px-4 py-1"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-evidence-ink">
        <Compass aria-hidden="true" className="size-3.5" />
        业务旅程画布
      </span>
      {props.storyActive ? props.storyControls : null}
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          ref={actionRef}
          type="button"
          variant="outline"
          size="xs"
          disabled={!props.storyActive && !props.canPlay}
          onClick={props.storyActive ? props.onCloseStory : props.onOpenStory}
          aria-keyshortcuts={props.storyActive ? 'Escape' : undefined}
        >
          {props.storyActive ? (
            <>
              <X aria-hidden="true" className="size-3.5" />
              退出放映
            </>
          ) : (
            <>
              <Clapperboard aria-hidden="true" className="size-3.5" />
              放映业务流
            </>
          )}
        </Button>
        {!props.storyActive ? (
          <p className="text-[11px] text-workbench-muted">
            {props.canPlay ? (
              <>
                <kbd>{ledgerChord}</kbd> 总台账
              </>
            ) : (
              '当前模型暂无业务流或履约请求'
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
};
