import { isContextEntity } from '@evidence-poc/evidence-schema';
import { CanvasFloatingHud } from '../../components/canvas/CanvasFloatingHud';
import {
  ArchetypeWizard,
  type ArchetypePreview,
} from '../../components/canvas/ArchetypeWizard';
import { EvidenceAgentThread } from '@evidence-poc/desktop-feature-agent';
import {
  CanvasViewport,
  ContextMapView,
} from '@evidence-poc/desktop-feature-canvas';
import { Button } from '@evidence-poc/desktop-ui-kit';
import type { EditorSessionState } from '../../state/useEditorSession';
import type { EditorSurfaces } from './useEditorSurfaces';
import type { EditorModeling } from './useEditorModeling';
import type { CanvasNavigation } from './useCanvasNavigation';
import type { DiagnosticIndex } from '@evidence-poc/desktop-feature-canvas';
import type { StoryPlaybackController } from '@evidence-poc/desktop-feature-story';

export const EditorCanvasStage = ({
  state,
  surfaces,
  navigation,
  modeling,
  story,
  diagnostics,
  onOpenScenarios,
}: {
  state: EditorSessionState;
  surfaces: EditorSurfaces;
  navigation: CanvasNavigation;
  modeling: EditorModeling;
  story: StoryPlaybackController;
  diagnostics: DiagnosticIndex;
  onOpenScenarios: () => void;
}) => {
  const {
    layout,
    storyActive,
    overviewOpen,
    canvasStageRef,
    canvasMemory,
    viewMode,
    selectedScope,
    setDensity,
    setDetailContext,
  } = surfaces;
  const {
    changeScope,
    scope,
    focusIssue,
    focusRequest,
    zoomCommand,
    setZoomCommand,
    openContextMap,
    closeContextMap,
    openMapContext,
    revealOnGraph,
  } = navigation;
  const {
    ai,
    agent,
    patchReview,
    stormingOpen,
    stormingFocus,
    stormingBusy,
    stormingError,
    stormingFrame,
    clearStormingFrame,
    submitStorming,
    closeStorming,
    closeInquiry,
    openInquiry,
    inquiryTarget,
    reviewInInquiry,
    canKeepPatch,
    canRevertPatch,
  } = modeling;
  const { accept: acceptPatch, revert: revertPatch } = patchReview;
  const { openAtEntityExample } = story;
  const mapVisible = overviewOpen && !storyActive;
  const canOpenContextMap =
    !storyActive &&
    inquiryTarget === null &&
    !stormingOpen &&
    !agent.running &&
    patchReview.review === null;
  const applyArchetype = (preview: ArchetypePreview) => {
    if (!canOpenContextMap || state.session.isDocumentLocked())
      throw new Error('当前画布有建模事务正在处理，请稍后重试。');
    if (state.session.getDocument() !== preview.base)
      throw new Error('模型已变化，请返回并重新预览。');
    state.session.applyPatchBatch(
      [{ op: 'test', path: '', value: preview.base }, ...preview.patches],
      `应用业务模式：${preview.label}`,
    );
    setZoomCommand(null);
    openMapContext(preview.result.contextRef);
  };
  return (
    <div
      ref={canvasStageRef}
      data-region="canvas-stage"
      tabIndex={-1}
      className="relative flex h-full min-h-0 flex-1 flex-col"
    >
      {!storyActive && (
        <div
          className="flex items-center gap-2 border-b border-workbench-border bg-evidence-panel px-2 py-1"
          data-evidence-capture-hide=""
        >
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-pressed={mapVisible}
            disabled={!mapVisible && !canOpenContextMap}
            onClick={mapVisible ? closeContextMap : openContextMap}
          >
            {mapVisible ? '返回履约画布' : '上下文地图'}
          </Button>
          <ArchetypeWizard
            document={state.document}
            disabled={!canOpenContextMap}
            onApply={applyArchetype}
          />
        </div>
      )}
      {state.layoutError !== null ? (
        <div
          role="alert"
          className="absolute top-24 left-5 z-40 rounded bg-white px-3 py-2 text-sm shadow"
        >
          画布布局失败：{state.layoutError}
        </div>
      ) : null}
      {mapVisible ? (
        <ContextMapView graph={state.graph} onOpenContext={openMapContext} />
      ) : (
        <CanvasViewport
          graph={state.graph}
          layout={state.layout}
          document={state.document}
          viewMode={viewMode}
          selection={state.selection}
          focusRequest={focusRequest}
          zoomCommand={zoomCommand}
          viewportMemory={canvasMemory}
          frameRequest={stormingFrame}
          onFrameComplete={clearStormingFrame}
          storyActive={storyActive}
          storyFocus={story.canvasFocus}
          hud={(controls) => (
            <CanvasFloatingHud
              {...controls}
              density={viewMode}
              onOpenScenarios={onOpenScenarios}
              onDensityChange={(mode) => {
                setDetailContext(null);
                setDensity(mode);
              }}
              hasSelection={state.selection.nodeId !== null}
              onClearSelection={() => state.session.clearSelection()}
            />
          )}
          diagnostics={diagnostics}
          storming={
            storyActive
              ? undefined
              : {
                  open: stormingOpen,
                  focusToken: stormingFocus,
                  busy: stormingBusy,
                  blocked:
                    patchReview.review !== null ||
                    (agent.running && !stormingBusy),
                  error: stormingError,
                  aiConfigured: ai?.aiConfigured,
                  onConfigureAi: ai?.openSettings,
                  onClose: closeStorming,
                  onStorm: submitStorming,
                  onStop: () => void agent.stop(),
                }
          }
          clarification={
            storyActive
              ? undefined
              : {
                  nodeId: inquiryTarget,
                  busy: agent.running || patchReview.review !== null,
                  onAcceptPatch:
                    reviewInInquiry && canKeepPatch ? acceptPatch : undefined,
                  onRevertPatch:
                    reviewInInquiry && canRevertPatch ? revertPatch : undefined,
                  onOpen: openInquiry,
                  onClose: closeInquiry,
                  content:
                    inquiryTarget === null ? null : (
                      <EvidenceAgentThread
                        key={inquiryTarget}
                        nodeId={inquiryTarget}
                        canExploreVariation={
                          state.graph.getEntity(inquiryTarget)?.kind ===
                          'fulfillment_confirmation'
                        }
                        conversation={agent}
                        patchReview={patchReview}
                        onFocusEntity={revealOnGraph}
                        aiConfigured={ai?.aiConfigured}
                        onConfigureAi={ai?.openSettings}
                      />
                    ),
                }
          }
          onOpenIssues={(issues) => {
            if (issues[0] === undefined) return;
            layout.openProblemsWithIssue(issues[0].issueId);
            focusIssue(issues[0]);
          }}
          overlay={patchReview.review?.overlay ?? null}
          scope={scope}
          onScopeChange={storyActive ? undefined : changeScope}
          onUserZoom={(zoom) => {
            if (storyActive) return;
            if (canOpenContextMap && zoom < 0.35 && selectedScope === null) {
              openContextMap();
            } else if (selectedScope !== null) {
              const context = state.graph.getEntity(selectedScope);
              if (isContextEntity(context) && context.kind === 'domain') {
                if (zoom > 0.85) setDetailContext(selectedScope);
                else if (zoom < 0.8) setDetailContext(null);
              }
            }
          }}
          onSelect={(nodeId) => {
            if (storyActive && openAtEntityExample(nodeId)) return;
            state.session.select(nodeId);
          }}
          onClearSelection={() => state.session.clearSelection()}
        />
      )}
    </div>
  );
};
