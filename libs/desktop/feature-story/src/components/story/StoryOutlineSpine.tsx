import { useId, useState } from 'react';
import { Badge, Button, cn } from '@evidence-poc/desktop-ui-kit';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import type { StoryFork } from '../../state/storyForks';

type BranchActions = {
  onPlayBranch: StoryPlaybackController['selectFlow'];
  onOpenBranchEntity?: (nodeId: string) => void;
};

const ForkItem = ({
  fork: { flow, step },
  ready,
  onPlayBranch,
  onOpenBranchEntity,
}: { fork: StoryFork; ready: boolean } & BranchActions) => (
  <li className="flex min-w-0 flex-col items-start gap-1 border-s-2 border-evidence-role ps-3">
    {flow.forkedFrom?.reason && <p>{flow.forkedFrom.reason}</p>}
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={!ready}
      onClick={() => onPlayBranch(flow.flowId, step)}
    >
      放映「{flow.flowTitle}」
    </Button>
    {onOpenBranchEntity && (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={!ready}
        onClick={() => onOpenBranchEntity(step.entityId)}
      >
        查看分支凭证
      </Button>
    )}
  </li>
);

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
  const { scenes, scene: current } = playback;
  if (!scenes.length) return null;
  const inherited = scenes.filter((scene) => scene.inherited);
  const local = scenes.filter((scene) => !scene.inherited);
  const parent = playback.flows.find(
    (flow) => flow.flowId === playback.forkedFrom?.storyId,
  );
  const currentForks = current && playback.forksByStep?.get(current.stepIndex);
  return (
    <nav
      aria-label="故事步骤"
      className="shrink-0 border-b border-workbench-border px-3 py-2"
    >
      {parent && inherited.length > 0 && (
        <details className="mb-2">
          <summary className="cursor-pointer">
            继承自《{parent.flowTitle}》第 1 至 {inherited.length} 步
          </summary>
          <ol className="ps-4">
            {inherited.map((scene) => (
              <li key={scene.stepIndex}>
                {scene.stepIndex}. {scene.narrative.headline}
              </li>
            ))}
          </ol>
        </details>
      )}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-7 w-full items-center gap-2 rounded text-start hover:bg-evidence-hover"
      >
        {current ? <Badge variant="default">{current.stepIndex}</Badge> : null}
        <span className="min-w-0 flex-1 break-words font-medium">
          {current?.narrative.headline ?? '等待第一步'}
        </span>
        {currentForks?.length ? (
          <Badge variant="role">{currentForks.length} 个分支</Badge>
        ) : null}
        <span className="shrink-0 text-[11px] text-evidence-muted">
          {expanded
            ? '收起'
            : `展开${parent ? '分支' : '全部'} ${local.length} 幕`}
        </span>
      </button>
      <ol
        id={listId}
        hidden={!expanded}
        className={cn(
          'max-h-[25vh] overflow-y-auto overscroll-contain',
          parent && 'border-s-2 border-evidence-role ps-2',
        )}
      >
        {expanded &&
          local.map(({ stepIndex, narrative }) => {
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
                    aria-current={active ? 'step' : undefined}
                    disabled={!playback.ready}
                    onClick={() => playback.jumpToStep(stepIndex)}
                  >
                    <Badge variant={active ? 'default' : 'outline'}>
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
                      <small className="ms-auto shrink-0">当前幕</small>
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
                        key={fork.flow.flowId}
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
