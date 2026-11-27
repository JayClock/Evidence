import { InspectorShell } from '../../components/layout/InspectorShell';
import { StoryDrawer } from '@evidence-poc/desktop-feature-story';
import { RightInspector } from '@evidence-poc/desktop-feature-inspector';
import type { EditorSessionState } from '../../state/useEditorSession';
import type { EditorSurfaces } from './useEditorSurfaces';
import type { EditorModeling } from './useEditorModeling';
import type { StoryPlaybackController } from '@evidence-poc/desktop-feature-story';
import type { ReactNode } from 'react';
import type { SensorReport } from '@evidence-poc/evidence-agent-sensors/browser';

export const EditorDetailsRail = ({
  state,
  surfaces,
  modeling,
  story,
  revealFromStory,
  review,
  gateReport,
}: {
  state: EditorSessionState;
  surfaces: EditorSurfaces;
  modeling: EditorModeling;
  story: StoryPlaybackController;
  revealFromStory: (nodeId: string) => void;
  review: ReactNode;
  gateReport: SensorReport | null;
}) => {
  const {
    storyEntry,
    storyActive,
    closeStory,
    ledgerActive,
    rightRailCollapsed,
    returnToCanvas,
  } = surfaces;
  const { ai, agent, patchReview, openInquiry, stormingOpen } = modeling;
  return storyActive ? (
    <StoryDrawer
      aiConfigured={ai?.aiConfigured}
      initialView={storyEntry ?? undefined}
      collapsed={rightRailCollapsed}
      onReturnToCanvas={closeStory}
      onOpenBranchEntity={revealFromStory}
      onClarifyGap={
        agent.running || patchReview.review
          ? undefined
          : (nodeId, gap) => {
              revealFromStory(nodeId);
              openInquiry(
                nodeId,
                {
                  contract:
                    '请读取这张凭证，和我核对它属于哪份合同，确认后再补齐合同归属。',
                  completion:
                    '请读取这项履约请求，和我核对哪些交付事实能证明完成，确认后再补齐完成规则。',
                  request:
                    '请读取这张凭证，和我核对它回应的履约请求及其示例依据。',
                }[gap],
              );
            }
      }
      playback={story}
      review={review}
      pendingPersistence={state.persistence.kind !== 'persisted'}
      externalConflict={state.persistence.kind === 'conflict'}
    />
  ) : !ledgerActive ? (
    <InspectorShell
      title="实体属性检视"
      badge="只读"
      collapsed={rightRailCollapsed}
      onReturnToCanvas={returnToCanvas}
      returnOnEscape={patchReview.review === null && !stormingOpen}
    >
      <RightInspector
        graph={state.graph}
        selection={state.selection}
        showHeading={false}
        active={!rightRailCollapsed}
        gateReport={gateReport}
      />
    </InspectorShell>
  ) : null;
};
