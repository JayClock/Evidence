import { Button } from '@evidence-poc/desktop-ui-kit';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import { WhatIfSection } from './WhatIfSection';
import { BreachOutcomeDisclosure } from './BreachOutcomeForm';

export const StorySandboxPane = ({
  playback,
  aiConfigured,
  reviewPending,
  onOpenBranchEntity,
  onPlayBranch,
}: {
  playback: StoryPlaybackController;
  aiConfigured: boolean;
  reviewPending: boolean;
  onOpenBranchEntity?: (nodeId: string) => void;
  onPlayBranch: StoryPlaybackController['selectFlow'];
}) => {
  const { promotedBranch, step } = playback;
  const branchFlow = promotedBranch?.flow;
  return (
    <div className="flex flex-col gap-3">
      <WhatIfSection playback={playback} aiConfigured={aiConfigured} />
      {playback.promotionRequests.length ? (
        <BreachOutcomeDisclosure
          key={`${playback.snapshotId}:${step?.stepHash}:${playback.hasSandboxBreach}`}
          playback={playback}
        />
      ) : null}
      {!reviewPending && promotedBranch ? (
        <>
          {' '}
          {branchFlow && (
            <Button
              className="self-start"
              onClick={() =>
                onPlayBranch(branchFlow.flowId, promotedBranch.step)
              }
            >
              放映分支「{branchFlow.flowTitle}」
            </Button>
          )}{' '}
          {onOpenBranchEntity && (
            <Button
              className="self-start"
              onClick={() => onOpenBranchEntity(promotedBranch.entity.id)}
            >
              在画布查看「{promotedBranch.entity.label}」
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
};
