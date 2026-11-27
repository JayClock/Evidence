import { useState } from 'react';
import { type DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { EvidenceProjectSummary } from '@evidence-poc/desktop-contracts/projects';
import { BottomStatusBar } from '../components/BottomStatusBar';
import { ProblemsPanel } from '@evidence-poc/desktop-feature-diagnostics';
import { CommandPalette } from '../components/command/CommandPalette';
import {
  DomainLedgerTable,
  useEntityLedger,
} from '@evidence-poc/desktop-feature-ledger';
import { ActivityRail } from '../components/layout/ActivityRail';
import { EntityDrawer } from '../components/layout/EntityDrawer';
import { ViewModeBar } from '../components/layout/ViewModeBar';
import { InlinePatchCard } from '@evidence-poc/desktop-feature-agent';
import { ScenarioStudioModal } from '@evidence-poc/desktop-feature-scenario';
import { StoryPlayerBar } from '@evidence-poc/desktop-feature-story';
import {
  DeliveryHub,
  useDeliveryHub,
} from '@evidence-poc/desktop-feature-delivery';
import { LiveApiProvider } from '@evidence-poc/desktop-feature-canvas';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Toaster,
} from '@evidence-poc/desktop-ui-kit';
import { useWorkspaceMcpBridge } from '../state/useMcpBridge';
import { useEditorSession } from '../state/useEditorSession';
import { EditorCanvasStage } from './editor/EditorCanvasStage';
import { EditorDetailsRail } from './editor/EditorDetailsRail';
import { EditorHeader } from './editor/EditorHeader';
import { ProjectLoader } from './editor/ProjectLoader';
import { useCanvasNavigation } from './editor/useCanvasNavigation';
import { useEditorSurfaces } from './editor/useEditorSurfaces';
import { useEditorModeling } from './editor/useEditorModeling';
import { useEditorPlayback } from './editor/useEditorPlayback';
import { useEditorDiagnostics } from './editor/useEditorDiagnostics';
import { useWorkspaceCommands } from './editor/useWorkspaceCommands';

export const EditorScreen = ({ rootPath }: { rootPath: string }) => (
  <ProjectLoader key={rootPath} rootPath={rootPath}>
    {(project, initialDocument, persistenceId) => (
      <EditorWorkspace
        project={project}
        initialDocument={initialDocument}
        persistenceId={persistenceId}
      />
    )}
  </ProjectLoader>
);

interface EditorWorkspaceProps {
  project: EvidenceProjectSummary;
  initialDocument: DomainModelDocument;
  persistenceId?: string;
}

const EditorWorkspace = ({
  project,
  initialDocument,
  persistenceId,
}: EditorWorkspaceProps) => {
  const surfaces = useEditorSurfaces();
  const {
    ledgerActive,
    storyActive,
    closeStory,
    setStoryEntry,
    workspaceView,
    rightRail,
    setRightRailCollapsed,
    workspaceRef,
    layout,
    directoryVisible,
  } = surfaces;
  const session = useEditorSession(
    project,
    initialDocument,
    surfaces.viewMode,
    persistenceId,
  );
  const { state, flush, reloadFromDisk } = session;
  const navigation = useCanvasNavigation(state, surfaces);
  const {
    revealOnGraph,
    revealFromStory,
    focusNode,
    focusIssue,
    resolveIssueTarget,
  } = navigation;
  const modeling = useEditorModeling(
    state,
    initialDocument,
    surfaces,
    navigation.scope,
  );
  const { ai, agent, liveModel, patchReview, startStorming, reviewInInquiry } =
    modeling;
  const { accept: acceptPatch, revert: revertPatch } = patchReview;
  const playback = useEditorPlayback(state, surfaces, modeling);
  const { story, canPlayStory, openStory } = playback;
  const { sensors, diagnosticsStale, diagnostics, syncStatus, artifacts } =
    useEditorDiagnostics(state, liveModel.revision);
  useWorkspaceMcpBridge({
    project,
    session: state.session,
    graph: state.graph,
    document: state.document,
    validation: state.validation,
    report: sensors.report,
  });
  const { commands, commandTargets, paletteOpen, setPaletteOpen } =
    useWorkspaceCommands(
      session,
      surfaces,
      modeling,
      playback,
      navigation.requestZoom,
      sensors,
    );
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const { persistence } = state;
  const pendingPersistence = persistence.kind !== 'persisted';
  const externalConflict = persistence.kind === 'conflict';
  const delivery = useDeliveryHub(
    window.evidenceAPI.projects,
    project.rootPath,
    state.session,
    initialDocument,
    { includeArtifacts: layout.isDeliveryOpen },
  );
  const entityLedger = useEntityLedger(
    state.document,
    diagnosticsStale ? null : diagnostics,
    ledgerActive,
  );

  const problemsPanel = layout.isProblemsPanelOpen ? (
    <ProblemsPanel
      report={sensors.report}
      reportStale={diagnosticsStale}
      reportLoading={sensors.loading}
      reportError={sensors.error}
      activeIssueId={layout.activeIssueId}
      docked={ledgerActive}
      canFocusIssue={(issue) => resolveIssueTarget(issue) !== null}
      onFocusIssue={(issue) => {
        layout.openProblemsWithIssue(issue.issueId);
        focusIssue(issue);
      }}
      onRerun={() => void sensors.refresh()}
      onClose={layout.closeProblemsPanel}
    />
  ) : null;

  const reviewInStory = storyActive && patchReview.review?.source === 'story';
  const patchCard =
    patchReview.review && !reviewInInquiry ? (
      <InlinePatchCard
        review={patchReview.review}
        focusOnMount={reviewInStory}
        busy={agent.running}
        onAccept={acceptPatch}
        onRevert={revertPatch}
        onFocusEntity={revealFromStory}
      />
    ) : null;

  return (
    <LiveApiProvider analysis={delivery.analysis} stale={delivery.stale}>
      <div
        ref={workspaceRef}
        tabIndex={-1}
        className="flex h-full flex-col bg-evidence-surface focus:outline-none"
      >
        <EditorHeader
          state={state}
          surfaces={surfaces}
          modeling={modeling}
          navigation={navigation}
          story={story}
          entityLedger={entityLedger}
          openCommands={() => setPaletteOpen(true)}
        />

        {!ledgerActive ? (
          <ViewModeBar
            {...(storyActive
              ? {
                  storyActive: true,
                  onCloseStory: closeStory,
                  storyControls: (
                    <StoryPlayerBar
                      playback={story}
                      aiConfigured={ai?.aiConfigured}
                      onConfigureAi={ai?.openSettings}
                    />
                  ),
                }
              : {
                  storyActive: false,
                  canPlay: canPlayStory,
                  onOpenStory: openStory,
                })}
          />
        ) : null}

        {liveModel.error === null ? null : (
          <p role="alert">实时诊断同步失败：{liveModel.error}</p>
        )}

        <div className="relative flex min-h-0 flex-1">
          <ActivityRail
            pressed={{
              ledger: ledgerActive,
              diagnostics: layout.isProblemsPanelOpen,
              directory: directoryVisible,
            }}
            onSelect={layout.toggleRailTab}
            badges={{
              ...(sensors.report === null || diagnosticsStale
                ? {}
                : {
                    diagnostics: {
                      count:
                        sensors.report.blockCount + sensors.report.warnCount,
                      tone:
                        sensors.report.blockCount > 0
                          ? ('error' as const)
                          : sensors.report.warnCount > 0
                            ? ('warning' as const)
                            : ('default' as const),
                    },
                  }),
            }}
          />

          {directoryVisible ? (
            <EntityDrawer
              graph={state.graph}
              selectedNodeId={state.selection.nodeId}
              onReveal={revealOnGraph}
              onCreate={startStorming}
            />
          ) : null}

          <div
            data-region="workspace-stage"
            className="isolate flex min-h-0 min-w-0 flex-1"
          >
            {ledgerActive ? (
              <div className="relative h-full min-h-0 w-full min-w-0">
                <DomainLedgerTable
                  ledger={entityLedger}
                  selectedNodeId={state.selection.nodeId}
                  onRevealOnGraph={revealOnGraph}
                />
                {problemsPanel}
              </div>
            ) : null}
            {/* Keep the panel sizes and collapse state when the ledger takes over. */}
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="evidence-studio-horizontal-v2"
              style={ledgerActive ? { display: 'none' } : undefined}
            >
              <ResizablePanel id="center-stage" order={1} minSize={35}>
                <div className="relative h-full min-h-0">
                  {!ledgerActive ? (
                    <EditorCanvasStage
                      state={state}
                      surfaces={surfaces}
                      navigation={navigation}
                      modeling={modeling}
                      story={story}
                      diagnostics={diagnostics}
                      onOpenScenarios={() => setScenarioOpen(true)}
                    />
                  ) : null}
                  {!ledgerActive ? problemsPanel : null}
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel
                id="right-rail"
                order={2}
                defaultSize={30}
                minSize={18}
                maxSize={storyActive ? 45 : 40}
                collapsible
                collapsedSize={0}
                onCollapse={() => setRightRailCollapsed(true)}
                onExpand={() => setRightRailCollapsed(false)}
                ref={rightRail}
              >
                <EditorDetailsRail
                  state={state}
                  surfaces={surfaces}
                  modeling={modeling}
                  story={story}
                  revealFromStory={revealFromStory}
                  review={reviewInStory ? patchCard : null}
                  gateReport={diagnosticsStale ? null : sensors.report}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {!patchCard || reviewInStory ? null : (
            <div
              data-canvas-control=""
              data-evidence-capture-hide=""
              className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4"
            >
              <div className="pointer-events-auto max-h-64 w-full max-w-lg overflow-y-auto">
                {patchCard}
              </div>
            </div>
          )}
        </div>

        {layout.isDeliveryOpen ? (
          <DeliveryHub
            hub={delivery}
            sync={syncStatus}
            acceptance={artifacts?.acceptance ?? null}
            projectName={state.project.name}
            pendingPersistence={pendingPersistence}
            externalChange={externalConflict}
            onClose={layout.closeDelivery}
            onRestoreFocus={() =>
              workspaceRef.current?.focus({ preventScroll: true })
            }
            onFocusEntity={(entityRef) => {
              layout.closeDelivery();
              workspaceView.returnToGraph();
              focusNode(entityRef);
            }}
          />
        ) : null}

        {!ledgerActive || pendingPersistence || state.reloadError !== null ? (
          <BottomStatusBar
            layout={state.layout}
            validation={state.validation}
            report={sensors.report}
            reportStale={diagnosticsStale}
            sensorLoading={sensors.loading}
            sensorError={sensors.error}
            diagnosticsOpen={layout.isProblemsPanelOpen}
            onToggleDiagnostics={layout.toggleProblemsPanel}
            onRerunSensors={() => void sensors.refresh()}
            deliverySync={syncStatus}
            acceptanceSync={artifacts?.acceptance ?? null}
            onOpenDelivery={layout.openDelivery}
            persistence={persistence}
            reloadError={state.reloadError}
            onReload={() => void reloadFromDisk()}
            onRetryPersistence={() => void flush()}
          />
        ) : null}

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          commands={commands}
          targets={commandTargets}
          onFocusTarget={focusNode}
        />
        {scenarioOpen && !agent.running ? (
          <ScenarioStudioModal
            session={state.session}
            onClose={() => setScenarioOpen(false)}
            onPlay={(flow) => {
              story.selectFlow(flow);
              story.setSkipAi(true);
              workspaceView.returnToGraph();
              setStoryEntry('script');
              setScenarioOpen(false);
            }}
          />
        ) : null}
        <Toaster />
      </div>
    </LiveApiProvider>
  );
};
