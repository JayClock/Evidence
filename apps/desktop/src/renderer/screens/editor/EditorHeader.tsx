import { ModelHealthRadar } from '@evidence-poc/desktop-feature-diagnostics';
import {
  downloadLedgerCsv,
  useEntityLedger,
} from '@evidence-poc/desktop-feature-ledger';
import { TopHeader } from '../../components/TopHeader';
import { toast } from '@evidence-poc/desktop-ui-kit';
import type { EditorSessionState } from '../../state/useEditorSession';
import type { EditorSurfaces } from './useEditorSurfaces';
import type { EditorModeling } from './useEditorModeling';
import type { CanvasNavigation } from './useCanvasNavigation';
import type { StoryPlaybackController } from '@evidence-poc/desktop-feature-story';

export const EditorHeader = ({
  state,
  surfaces,
  modeling,
  navigation,
  story,
  entityLedger,
  openCommands,
}: {
  state: EditorSessionState;
  surfaces: EditorSurfaces;
  modeling: EditorModeling;
  navigation: CanvasNavigation;
  story: StoryPlaybackController;
  entityLedger: ReturnType<typeof useEntityLedger>;
  openCommands: () => void;
}) => {
  const { storyActive, ledgerActive, canvasStageRef, setStoryEntry } = surfaces;
  const { agent, patchReview, openInquiry } = modeling;
  const { revealOnGraph } = navigation;
  return (
    <TopHeader
      projectName={state.project.name}
      persistence={state.persistence}
      graph={state.graph}
      selection={state.selection}
      onOpenCommandPalette={openCommands}
      healthControl={
        !storyActive && !ledgerActive ? (
          <ModelHealthRadar
            graph={state.graph}
            canLocate={(nodeId) => state.layout.nodeById.has(nodeId)}
            inquiryBusy={agent.running || patchReview.review !== null}
            onAction={(kind, issue) => {
              const target =
                kind === 'locate' ? issue.targetNodeId : issue.inquiry?.nodeId;
              if (!target || !state.layout.nodeById.has(target)) return false;
              if (
                kind === 'guide' &&
                (agent.running || patchReview.review !== null || !issue.inquiry)
              )
                return false;
              canvasStageRef.current?.focus();
              revealOnGraph(target);
              if (kind === 'guide' && issue.inquiry?.kind === 'story') {
                story.openAtRequest(target);
                setStoryEntry('sandbox');
              } else if (kind === 'guide')
                openInquiry(
                  target,
                  `请用 scan_model_health 复核体检发现项 ${issue.id}。若它仍存在，针对这项发现问我一个澄清问题；若已消失则停止。本轮不修改模型。`,
                  true,
                );
              return true;
            }}
          />
        ) : null
      }
      ledgerExport={
        ledgerActive
          ? {
              enabled: entityLedger.rows.length > 0,
              onExport: () => {
                try {
                  downloadLedgerCsv(state.project.name, entityLedger.rows);
                } catch {
                  toast.error('无法导出总台账 CSV');
                }
              },
            }
          : undefined
      }
    />
  );
};
