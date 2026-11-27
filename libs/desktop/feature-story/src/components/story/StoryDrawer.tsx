import * as Tabs from '@radix-ui/react-tabs';
import { useRef, useState, type ReactNode } from 'react';
import { Badge, Button } from '@evidence-poc/desktop-ui-kit';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import { StoryOutlineSpine } from './StoryOutlineSpine';
import { StorySandboxPane, TimelineDetails } from './StorySandboxPane';
import { StorySceneSheet, type ClarifyStoryGap } from './StorySceneSheet';

export type StoryView = 'script' | 'sandbox';

interface StoryDrawerProps {
  playback: StoryPlaybackController;
  initialView?: StoryView;
  collapsed?: boolean;
  pendingPersistence?: boolean;
  externalConflict?: boolean;
  aiConfigured?: boolean;
  onReturnToCanvas: () => void;
  onClarifyGap?: ClarifyStoryGap;
  onOpenBranchEntity?: (nodeId: string) => void;
  review?: ReactNode;
}

const tabClass =
  'relative min-h-8 flex-1 whitespace-nowrap px-2 text-evidence-muted hover:bg-evidence-hover aria-selected:text-evidence-ink aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:bottom-0 aria-selected:after:border-b-2 aria-selected:after:border-evidence-accent disabled:opacity-40';

export const StoryDrawer = ({
  playback,
  initialView = 'script',
  collapsed = false,
  pendingPersistence = false,
  externalConflict = false,
  aiConfigured = true,
  onReturnToCanvas,
  onClarifyGap,
  onOpenBranchEntity,
  review,
}: StoryDrawerProps) => {
  const [view, setView] = useState<StoryView>(initialView);
  const sandboxTab = useRef<HTMLButtonElement>(null);
  const {
    anchoredScene,
    anchoredChecklist,
    anchoredStep,
    isBetweenSteps,
    rehearsal,
  } = playback;
  const context = isBetweenSteps
    ? anchoredStep
      ? `已推进至第 ${anchoredStep.sequence} 步，等待后续时点。`
      : '第一步尚未发生，等待业务开始。'
    : undefined;
  const showTabs = rehearsal.active || playback.scenes.length > 0;
  return (
    <section
      aria-label="业务故事"
      aria-busy={playback.loading}
      inert={collapsed}
      lang="zh-CN"
      className="flex h-full min-h-0 min-w-0 flex-col bg-evidence-panel text-[12px] text-evidence-ink"
    >
      <header className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-workbench-border bg-workbench-background px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className="break-words text-sm font-semibold">
            {rehearsal.active
              ? '履约时钟假设'
              : (playback.projection?.storyTitle ?? '业务流放映')}
          </h2>
          {playback.scenes.length ? (
            <Badge>
              {anchoredStep
                ? `第 ${anchoredStep.sequence}/${playback.stepCount} 步`
                : `共 ${playback.stepCount} 步`}
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onReturnToCanvas}
        >
          返回画布
        </Button>
      </header>
      <StoryOutlineSpine
        key={playback.projection?.flowId}
        playback={playback}
        onExploreStep={(sequence) => {
          playback.jumpToStep(sequence);
          setView('sandbox');
          sandboxTab.current?.focus();
        }}
      />
      <Tabs.Root
        value={view}
        onValueChange={(value) =>
          setView(value === 'sandbox' ? 'sandbox' : 'script')
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        {showTabs ? (
          <Tabs.List
            aria-label="故事视图"
            className="flex shrink-0 border-b border-workbench-border px-2"
          >
            <Tabs.Trigger value="script" className={tabClass}>
              故事剧本
            </Tabs.Trigger>
            <Tabs.Trigger value="sandbox" ref={sandboxTab} className={tabClass}>
              推演与分支
            </Tabs.Trigger>
          </Tabs.List>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex max-w-2xl flex-col gap-3 p-3">
            {pendingPersistence ? (
              <p className="text-workbench-muted">
                当前故事基于尚未同步到磁盘的画布版本。
              </p>
            ) : null}
            {externalConflict ? (
              <p role="alert" className="text-evidence-role">
                磁盘模型已变化，当前故事仍基于画布版本。可从状态栏重新加载。
              </p>
            ) : null}
            {playback.loading ? (
              <p role="status" className="text-evidence-muted">
                正在读取业务流…{anchoredScene ? '暂显示上一版本。' : ''}
              </p>
            ) : null}
            {playback.error ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 text-evidence-evidence"
              >
                <p className="break-words whitespace-pre-wrap">
                  {playback.error}
                </p>
                <Button onClick={playback.retry}>重试放映</Button>
              </div>
            ) : null}
            {!playback.loading &&
            !playback.error &&
            !rehearsal.active &&
            !playback.scenes.length ? (
              <p>
                暂无可放映的步骤。请为实体的业务示例声明所属业务流、业务时点和单据依据。
              </p>
            ) : null}
            {showTabs ? (
              <>
                <Tabs.Content value="script">
                  <div className="flex flex-col gap-3">
                    {rehearsal.active ? (
                      <p>
                        履约时钟假设暂无剧本。可在「推演与分支」查看履约状态。
                      </p>
                    ) : null}
                    {context ? (
                      <p className="text-evidence-muted">{context}</p>
                    ) : null}
                    {anchoredScene && anchoredChecklist ? (
                      <StorySceneSheet
                        key={`${playback.projection?.flowId}:${anchoredStep?.entityId}:${anchoredStep?.exampleLabel}`}
                        scene={anchoredScene}
                        checklist={anchoredChecklist}
                        ready={playback.ready}
                        onClarifyGap={onClarifyGap}
                      />
                    ) : null}
                    {isBetweenSteps && playback.ready ? (
                      <TimelineDetails playback={playback} />
                    ) : null}
                  </div>
                </Tabs.Content>
                <Tabs.Content value="sandbox">
                  <StorySandboxPane
                    playback={playback}
                    aiConfigured={aiConfigured}
                    context={context}
                    reviewPending={Boolean(review)}
                    onOpenBranchEntity={onOpenBranchEntity}
                    onPlayBranch={() => setView('script')}
                  />
                </Tabs.Content>
              </>
            ) : null}
            {review}
          </div>
        </div>
      </Tabs.Root>
    </section>
  );
};
