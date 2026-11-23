import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ImperativePanelHandle } from 'react-resizable-panels';

import { computeContextScope } from '@evidence-poc/evidence-canvas-interaction';
import type { SensorIssue } from '@evidence-poc/evidence-agent/browser';
import type { FlowStepTrace } from '@evidence-poc/evidence-model-core';
import {
  ENTITY_CATEGORY_LABELS,
  isContextEntity,
  isEvidenceEntity,
  isFulfillmentRequest,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import type { EvidenceProjectSummary } from '@evidence-poc/desktop-contracts/projects';
import { BottomStatusBar } from '../components/BottomStatusBar';
import { ProblemsPanel } from '../components/console/ProblemsPanel';
import { ModelHealthRadar } from '../components/console/ModelHealthRadar';
import {
  CommandPalette,
  type CommandTarget,
} from '../components/command/CommandPalette';
import { DomainLedgerTable } from '../components/ledger/DomainLedgerTable';
import { downloadLedgerCsv } from '../components/ledger/domainLedgerCsv';
import { useEntityLedger } from '../components/ledger/useEntityLedger';
import { CanvasFloatingHud } from '../components/canvas/CanvasFloatingHud';
import {
  ArchetypeWizard,
  type ArchetypePreview,
} from '../components/canvas/ArchetypeWizard';
import { ActivityRail } from '../components/layout/ActivityRail';
import { EntityDrawer } from '../components/layout/EntityDrawer';
import { InspectorShell } from '../components/layout/InspectorShell';
import { ViewModeBar } from '../components/layout/ViewModeBar';
import {
  EvidenceAgentThread,
  InlinePatchCard,
  type AppliedPatch,
  usePiConversation,
  usePatchReview,
} from '@evidence-poc/desktop-feature-agent';
import { ScenarioStudioModal } from '../components/scenario/ScenarioStudioModal';
import {
  StoryPlayerBar,
  StoryDrawer,
  useStoryPlayback,
} from '@evidence-poc/desktop-feature-story';
import {
  DeliveryHub,
  useDeliveryHub,
} from '@evidence-poc/desktop-feature-delivery';
import { TopHeader } from '../components/TopHeader';
import {
  CanvasViewport,
  ContextMapView,
  LiveApiProvider,
  createDiagnosticIndex,
  type CanvasViewMode,
  type CanvasViewportMemory,
  type CanvasEvidenceInquiry,
  type EvidenceInquiryKind,
  type ZoomDirection,
} from '@evidence-poc/desktop-feature-canvas';
import { RightInspector } from '@evidence-poc/desktop-feature-inspector';
import {
  Button,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Toaster,
  toast,
} from '@evidence-poc/desktop-ui-kit';
import type {
  CommandCapabilities,
  CommandHandlers,
} from '../state/commandRegistry';
import { useCommandRegistry } from '../state/useCommandRegistry';
import { useLiveModelBridge } from '../state/useLiveModelBridge';
import { useEditorSession } from '../state/useEditorSession';
import { useEditorShortcuts } from '../state/useEditorShortcuts';
import { useMcpBridge } from '../state/useMcpBridge';
import { useSensorsState } from '../state/useSensorsState';
import { useWorkspaceLayoutState } from '../state/useWorkspaceLayoutState';
import { useAiConfiguration } from '../state/AiConfiguration';
import { useWorkspaceViewMode } from '../state/useWorkspaceViewMode';

type LoadState =
  | { name: 'loading' }
  | {
      name: 'ready';
      project: EvidenceProjectSummary;
      document: DomainModelDocument;
    }
  | { name: 'error'; message: string };

export const EditorScreen = ({ rootPath }: { rootPath: string }) => {
  const [state, setState] = useState<LoadState>({ name: 'loading' });

  useEffect(() => {
    if (rootPath === '') {
      setState({
        name: 'error',
        message: '缺少项目路径：请从仪表盘重新打开项目。',
      });
      return;
    }

    let active = true;

    setState({ name: 'loading' });
    void window.evidenceAPI.projects.open(rootPath).then((result) => {
      if (!active) {
        return;
      }

      setState(
        result.success
          ? {
              name: 'ready',
              project: result.project,
              document: result.document,
            }
          : { name: 'error', message: result.error },
      );
    });

    return () => {
      active = false;
    };
  }, [rootPath]);

  if (state.name === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-evidence-surface text-[12px] text-evidence-muted">
        正在读取 .evidence/fm 源树…
      </div>
    );
  }

  if (state.name === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-evidence-surface px-10">
        <p className="max-w-xl text-center text-[12px] whitespace-pre-wrap text-[#b42318]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <EditorWorkspace
      key={rootPath}
      project={state.project}
      initialDocument={state.document}
    />
  );
};

interface EditorWorkspaceProps {
  project: EvidenceProjectSummary;
  initialDocument: DomainModelDocument;
}

const EditorWorkspace = ({
  project,
  initialDocument,
}: EditorWorkspaceProps) => {
  const ai = useAiConfiguration();
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [density, setDensity] = useState<CanvasViewMode>('standard');
  const [selectedScope, setSelectedScope] = useState<string | null>(null);
  const [detailContext, setDetailContext] = useState<string | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const viewMode =
    selectedScope !== null && selectedScope === detailContext
      ? 'expanded'
      : density;
  const canvasMemory = useRef<CanvasViewportMemory['current']>(null);
  const workspaceView = useWorkspaceViewMode();
  const ledgerActive = workspaceView.surface === 'table';
  const [storyOpen, setStoryOpen] = useState(false);
  const storyActive = storyOpen && !ledgerActive;
  const closeStory = useCallback(() => setStoryOpen(false), []);
  const toggleLedger = useCallback(() => {
    closeStory();
    workspaceView.toggleLedger();
  }, [closeStory, workspaceView.toggleLedger]);
  const rightRail = useRef<ImperativePanelHandle>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const returnToCanvas = useCallback(() => {
    const canvas = canvasStageRef.current;
    if (canvas === null) return;
    const selected = canvas.querySelector<HTMLElement>(
      '[data-node-id][aria-pressed="true"]',
    );
    (selected ?? canvas).focus({ preventScroll: true });
  }, []);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const expandRightRail = useCallback(() => {
    const panel = rightRail.current;
    if (!panel?.isCollapsed()) return false;
    panel.expand();
    return true;
  }, []);
  const toggleRightRail = useCallback(() => {
    if (!expandRightRail()) rightRail.current?.collapse();
  }, [expandRightRail]);
  const layout = useWorkspaceLayoutState(toggleLedger, {
    active: ledgerActive,
    returnToGraph: workspaceView.returnToGraph,
  });
  const {
    state,
    save,
    reloadFromDisk,
    reloadFromDiskIfClean,
    dismissExternalChange,
  } = useEditorSession(project, initialDocument, viewMode);
  const hasPlaybackInput = useMemo(
    () =>
      state.document.entities.some(
        (entity) =>
          isFulfillmentRequest(entity) ||
          entity.examples?.some((example) => Boolean(example.test?.flow)),
      ),
    [state.document],
  );
  // A pending clean reload may bring in the first flow from disk.
  const canPlayStory =
    hasPlaybackInput || (!state.dirty && state.externalChangeAt !== null);
  const openStory = useCallback(() => {
    if (!ledgerActive && canPlayStory) setStoryOpen(true);
  }, [ledgerActive, canPlayStory]);
  const story = useStoryPlayback({
    api: window.evidenceAPI.story,
    rootPath: project.rootPath,
    document: state.document,
    enabled: storyActive,
    aiConfigured: ai?.aiConfigured,
    refreshSavedSources: state.externalChangeAt !== null,
    onInvalidated: reloadFromDiskIfClean,
  });
  const sensors = useSensorsState(project.rootPath);
  const delivery = useDeliveryHub(
    window.evidenceAPI.projects,
    project.rootPath,
    state.session,
    initialDocument,
    { includeArtifacts: layout.isDeliveryOpen },
  );
  const scope = useMemo(
    () => computeContextScope(state.layout, selectedScope),
    [state.layout, selectedScope],
  );
  const changeScope = useCallback(
    (contextId: string | null) => {
      const next = computeContextScope(state.layout, contextId);
      if (
        next &&
        state.selection.nodeId !== null &&
        !next.nodeIds.has(state.selection.nodeId)
      )
        state.session.clearSelection();
      setSelectedScope(next?.contextId ?? null);
    },
    [state.layout, state.selection.nodeId, state.session],
  );
  // Deletion/undo and selection from inspectors, sensors or MCP must never
  // leave the editor inspecting an invisible, non-interactive object.
  useEffect(() => {
    if (state.layoutError !== null) return;
    if (
      selectedScope !== null &&
      (scope === null ||
        (state.selection.nodeId !== null &&
          !scope.nodeIds.has(state.selection.nodeId)))
    )
      setSelectedScope(null);
  }, [selectedScope, scope, state.selection.nodeId, state.layoutError]);
  // The palette replaces a row of header buttons with one chord; every action
  // it runs is the same handler the header used to call.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inquiry, setInquiry] = useState<CanvasEvidenceInquiry['target']>(null);
  const [stormingOpen, setStormingOpen] = useState(false);
  const [stormingFocus, setStormingFocus] = useState(0);
  const [stormingBusy, setStormingBusy] = useState(false);
  const [stormingError, setStormingError] = useState<string | null>(null);
  const [stormingFrame, setStormingFrame] = useState<readonly string[] | null>(
    null,
  );
  const stormingReturnFocus = useRef<HTMLElement | null>(null);
  const stormingAdded = useRef<Set<string> | null>(null);
  const patchReview = usePatchReview(state.session, state.document);
  const { record: recordPatch } = patchReview;
  const recordAgentPatch = useCallback(
    (patch: AppliedPatch) => {
      recordPatch(patch);
      const added = stormingAdded.current;
      if (added === null) return;
      const before = new Set(patch.before.entities.map(({ id }) => id));
      for (const entity of patch.after.entities) {
        if (!before.has(entity.id) && isEvidenceEntity(entity))
          added.add(entity.id);
      }
    },
    [recordPatch],
  );
  const liveModel = useLiveModelBridge(
    project.rootPath,
    state.session,
    initialDocument,
    recordAgentPatch,
  );
  const syncStatus =
    delivery.syncStatus?.revision === liveModel.revision
      ? delivery.syncStatus.result
      : null;
  const agent = usePiConversation(
    window.evidenceAPI.agent,
    project.rootPath,
    liveModel.prompt,
  );
  // Findings must describe the exact live revision, including undo/redo.
  const diagnosticsStale =
    liveModel.error !== null ||
    sensors.report?.documentRevision !== liveModel.revision ||
    sensors.loading ||
    sensors.error !== null;
  const diagnostics = useMemo(
    () =>
      createDiagnosticIndex(
        diagnosticsStale ? null : sensors.report,
        state.document,
      ),
    [diagnosticsStale, sensors.report, state.document],
  );
  const entityLedger = useEntityLedger(
    state.document,
    diagnosticsStale ? null : diagnostics,
    ledgerActive,
  );
  useEffect(() => {
    if (state.savedAt !== null) void sensors.refresh();
  }, [state.savedAt, sensors.refresh]);

  // Monotonic document revision so an external agent can tell whether the model
  // it read is still the model on screen.
  const revisionRef = useRef(0);
  useEffect(() => {
    revisionRef.current += 1;
  }, [state.document]);

  useMcpBridge({
    project,
    session: state.session,
    graph: state.graph,
    document: state.document,
    validation: state.validation,
    report: sensors.report,
    revision: revisionRef.current,
  });
  const [focusRequest, setFocusRequest] = useState<{
    nodeId: string;
    token: number;
  } | null>(null);
  const [zoomCommand, setZoomCommand] = useState<{
    direction: ZoomDirection;
    token: number;
  } | null>(null);
  const tokenRef = useRef(0);

  // The table and the graph share one selection, so leaving the ledger lands on
  // the object that was being read instead of the fit-to-content corner.
  const wasLedgerActive = useRef(ledgerActive);
  useEffect(() => {
    const previous = wasLedgerActive.current;
    wasLedgerActive.current = ledgerActive;

    if (!previous || ledgerActive) return;

    const nodeId = state.selection.nodeId;
    if (nodeId === null) return;

    tokenRef.current += 1;
    setFocusRequest({ nodeId, token: tokenRef.current });
  }, [ledgerActive, state.selection.nodeId]);

  const focusNode = useCallback(
    (nodeId: string) => {
      setOverviewOpen(false);
      if (scope !== null && !scope.nodeIds.has(nodeId)) setSelectedScope(null);
      state.session.select(nodeId);
      tokenRef.current += 1;
      setFocusRequest({ nodeId, token: tokenRef.current });
    },
    [state.session, scope],
  );

  const resolveIssueTarget = useCallback(
    (issue: SensorIssue) => {
      const [id, attribute] = issue.targetNodeId?.split('#') ?? [];
      const node = id === undefined ? undefined : state.layout.nodeById.get(id);
      if (node !== undefined)
        return {
          kind: 'node' as const,
          id: node.nodeId,
          attributeName: node.entity.attributes?.some(
            ({ name }) => name === attribute,
          )
            ? attribute!
            : null,
        };
      const group = state.layout.contextGroups.find(
        (item) => item.contextId === (issue.contextRef ?? id),
      );
      const edge = state.layout.edges.find(
        (item) => item.relationshipId === id,
      );
      const ref = edge?.relationshipId ?? group?.contextId;
      return ref === undefined ? null : { kind: 'geometry' as const, id: ref };
    },
    [state.layout],
  );

  // Findings select modeled fields, but Context/edge targets only move the camera.
  const focusIssue = useCallback(
    (issue: SensorIssue) => {
      const target = resolveIssueTarget(issue);
      if (target === null) return;
      if (target.kind === 'node') {
        if (scope !== null && !scope.nodeIds.has(target.id))
          setSelectedScope(null);
        state.session.selectAttribute(target.id, target.attributeName);
        if (target.attributeName !== null && !ledgerActive) expandRightRail();
      } else {
        setSelectedScope(null);
        if (ledgerActive) state.session.clearSelection();
      }
      tokenRef.current += 1;
      setFocusRequest({ nodeId: target.id, token: tokenRef.current });
      if (ledgerActive) workspaceView.returnToGraph();
    },
    [
      expandRightRail,
      ledgerActive,
      resolveIssueTarget,
      scope,
      state.session,
      workspaceView.returnToGraph,
    ],
  );

  const startStorming = useCallback(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      !active.closest('[data-canvas-storming]')
    ) {
      stormingReturnFocus.current = active;
    }
    setInquiry(null);
    setOverviewOpen(false);
    closeStory();
    workspaceView.returnToGraph();
    setStormingOpen(true);
    setStormingFocus((token) => token + 1);
  }, [closeStory, workspaceView.returnToGraph]);

  const closeStorming = useCallback(() => {
    setStormingOpen(false);
    const previous = stormingReturnFocus.current;
    stormingReturnFocus.current = null;
    if (
      previous?.isConnected &&
      previous !== document.body &&
      !previous.closest('[inert], [hidden]')
    ) {
      previous.focus({ preventScroll: true });
    } else {
      returnToCanvas();
    }
  }, [returnToCanvas]);

  const submitStorming = async (text: string): Promise<boolean> => {
    if (
      agent.running ||
      stormingAdded.current !== null ||
      patchReview.review !== null ||
      ai?.aiConfigured === false
    )
      return false;
    const added = new Set<string>();
    stormingAdded.current = added;
    setStormingOpen(true);
    setStormingBusy(true);
    setStormingError(null);
    setSelectedScope(null);
    closeStory();
    workspaceView.returnToGraph();
    const result = await agent.submit(
      '请从以下业务场景提取有依据的业务记录，按邀请投标、投标、签约、履约归类，使用 batch_add_evidence_stubs 批量铺设凭证。只写业务事实，不记录资料出处和摘录；未知留空，不强行补齐阶段。\n\n业务场景：\n' +
        text,
      { nodeId: null },
    );
    stormingAdded.current = null;
    setStormingBusy(false);
    const frame = state.session
      .getDocument()
      .entities.filter(({ id }) => added.has(id))
      .map(({ id }) => id);
    if (frame.length === 0) {
      setStormingError(
        result.success
          ? '未生成新凭证，请补充可识别的业务记录后再试。'
          : result.error,
      );
      return false;
    }
    setStormingFrame(frame);
    if (
      document.activeElement === document.body ||
      document.activeElement?.closest('[data-canvas-storming]')
    ) {
      closeStorming();
    } else {
      setStormingOpen(false);
    }
    return true;
  };

  const inquiryTarget =
    !storyActive &&
    !ledgerActive &&
    inquiry !== null &&
    state.selection.nodeId === inquiry.nodeId &&
    isEvidenceEntity(state.graph.getEntity(inquiry.nodeId)) &&
    (scope === null || scope.nodeIds.has(inquiry.nodeId))
      ? inquiry
      : null;
  const reviewInInquiry =
    inquiryTarget !== null &&
    patchReview.review?.focusNodeId === inquiryTarget.nodeId;
  const canKeepPatch = patchReview.review !== null && !agent.running;
  const canRevertPatch =
    canKeepPatch && patchReview.review?.revertable === true;
  useEffect(() => {
    if (inquiry !== null && inquiryTarget === null) setInquiry(null);
  }, [inquiry, inquiryTarget]);

  const closeInquiry = useCallback((nodeId: string) => {
    setInquiry((current) => (current?.nodeId === nodeId ? null : current));
  }, []);

  const openInquiry = (
    nodeId: string,
    kind: EvidenceInquiryKind,
    issueId?: string,
  ) => {
    if (agent.running || patchReview.review !== null) return;
    if (!isEvidenceEntity(state.graph.getEntity(nodeId))) return;
    state.session.select(nodeId);
    setStormingOpen(false);
    setInquiry({ nodeId, kind });
    agent.reset();
    if (ai?.aiConfigured === false) return;
    const question =
      issueId !== undefined
        ? `请用 scan_model_health 复核体检发现项 ${issueId}。若它仍存在，针对这项发现问我一个澄清问题；若已消失则停止。本轮不修改模型。`
        : kind === 'trace'
          ? '请先读这张凭证，按它所在的业务阶段，问我一个最关键的澄清问题：这张凭证回应了什么、谁向谁主张什么、交付什么或什么算完成？不要重复问已知信息，本轮只提问，不修改模型。'
          : '请先读这张凭证，提出一个与现有约定最相关的异常问题。若有多个请求，先问我推演哪一项；若尚未识别请求，先问哪项交付没有发生、何时算未按约发生。合同前只探问渠道响应，不假定违约或补偿。本轮只提问，不修改模型。';
    void agent.submit(question, {
      nodeId,
      inquiry: kind,
      ...(issueId === undefined ? {} : { readOnly: true }),
    });
  };

  const clearStormingFrame = useCallback(() => setStormingFrame(null), []);

  const requestZoom = useCallback((direction: ZoomDirection) => {
    tokenRef.current += 1;
    setZoomCommand({ direction, token: tokenRef.current });
  }, []);

  const commandTargets = useMemo<readonly CommandTarget[]>(
    () =>
      state.layout.nodes.map((node) => ({
        id: node.nodeId,
        label: node.entity.label,
        category: ENTITY_CATEGORY_LABELS[node.entity.category],
        path:
          node.contextId === null
            ? []
            : state.graph
                .contextPath(node.contextId)
                .map((context) => context.label),
      })),
    [state.layout.nodes, state.graph],
  );

  const commandCapabilities = useMemo<CommandCapabilities>(
    () => ({
      canUndo: !agent.running && state.canUndo,
      canRedo: !agent.running && state.canRedo,
      surface: workspaceView.surface,
      storyActive,
      canPlayStory,
      hasSelection: state.selection.nodeId !== null,
    }),
    [
      agent.running,
      state.canUndo,
      state.canRedo,
      state.selection.nodeId,
      workspaceView.surface,
      storyActive,
      canPlayStory,
    ],
  );

  const commandHandlers = useMemo<CommandHandlers>(
    () => ({
      save: () => void save(),
      undo: () => {
        state.session.undo();
      },
      redo: () => {
        state.session.redo();
      },
      returnToGraph: workspaceView.returnToGraph,
      openStory,
      closeStory,
      zoomToSelection: () => requestZoom('selection'),
      openDelivery: layout.openDelivery,
      rerunSensors: () => void sensors.refresh(),
      startStorming,
      openProblems: layout.openProblemsPanel,
      toggleProblems: layout.toggleProblemsPanel,
    }),
    [
      openStory,
      closeStory,
      startStorming,
      layout.openDelivery,
      layout.openProblemsPanel,
      layout.toggleProblemsPanel,
      requestZoom,
      save,
      sensors.refresh,
      state.session,
      workspaceView.returnToGraph,
    ],
  );

  const registeredCommands = useCommandRegistry(
    commandCapabilities,
    commandHandlers,
  );
  const commands = useMemo(
    () =>
      ai
        ? [
            ...registeredCommands,
            {
              id: 'ai-settings',
              title: '配置大模型 / AI Settings',
              category: 'agent' as const,
              shortcut: '⌘+,',
              keywords: ['Pi', '模型', 'provider'],
              perform: ai.openSettings,
            },
          ]
        : registeredCommands,
    [registeredCommands, ai],
  );

  const { accept: acceptPatch, revert: revertPatch } = patchReview;

  const shortcuts = useMemo(
    () => ({
      undo: () => {
        state.session.undo();
      },
      redo: () => {
        state.session.redo();
      },
      save: () => void save(),
      openCommandPalette: () => setPaletteOpen(true),
      startStorming,
      ...(stormingOpen ? { closeStorming } : {}),
      rerunSensors: () => void sensors.refresh(),
      openDelivery: layout.openDelivery,
      clearSelection: () => state.session.clearSelection(),
      zoomIn: () => requestZoom('in'),
      zoomOut: () => requestZoom('out'),
      resetZoom: () => requestZoom('reset'),
      fitCanvas: () => requestZoom('fit'),
      zoomToSelection: () => requestZoom('selection'),
      toggleRightRail,
      toggleProblems: layout.toggleProblemsPanel,
      ...(storyActive ? { closeStory } : {}),
      ...(!reviewInInquiry && canKeepPatch ? { acceptPatch } : {}),
      ...(!reviewInInquiry && canRevertPatch ? { revertPatch } : {}),
    }),
    [
      acceptPatch,
      canKeepPatch,
      canRevertPatch,
      closeStorming,
      startStorming,
      stormingOpen,
      reviewInInquiry,
      requestZoom,
      revertPatch,
      layout.openDelivery,
      layout.toggleProblemsPanel,
      save,
      sensors.refresh,
      state.session,
      storyActive,
      toggleRightRail,
      closeStory,
    ],
  );

  useEditorShortcuts(shortcuts);

  useEffect(() => {
    const entity =
      state.selection.nodeId === null
        ? undefined
        : state.graph.getEntity(state.selection.nodeId);

    void window.evidenceAPI.agent.publishCanvasContext({
      rootPath: project.rootPath,
      context: {
        projectRoot: project.rootPath,
        modelId: state.document.manifest.id,
        selection: state.selection,
        ...(entity === undefined
          ? {}
          : {
              selected: {
                nodeId: entity.id,
                label: entity.label,
                kind: entity.category,
                ...('contextRef' in entity && entity.contextRef !== undefined
                  ? { contextRef: entity.contextRef }
                  : {}),
              },
            }),
      },
    });
  }, [
    project.rootPath,
    state.selection,
    state.graph,
    state.document.manifest.id,
  ]);

  const revealOnGraph = useCallback(
    (nodeId: string) => {
      focusNode(nodeId);
      workspaceView.returnToGraph();
    },
    [focusNode, workspaceView.returnToGraph],
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

  const mapVisible = overviewOpen && !storyActive;
  const openContextMap = () => {
    setZoomCommand(null);
    setOverviewOpen(true);
  };
  const closeContextMap = () => {
    // A fit below the map threshold should not immediately reopen the overview.
    if (canvasMemory.current && canvasMemory.current.zoom < 0.35)
      canvasMemory.current = { ...canvasMemory.current, zoom: 0.65 };
    setOverviewOpen(false);
    canvasStageRef.current?.focus();
  };
  const openMapContext = useCallback(
    (contextId: string, evidenceId?: string) => {
      setOverviewOpen(false);
      if (evidenceId) {
        state.session.select(evidenceId);
        tokenRef.current += 1;
        setFocusRequest({ nodeId: evidenceId, token: tokenRef.current });
      } else {
        state.session.clearSelection();
        setFocusRequest(null);
      }
      setSelectedScope(contextId);
      const context = state.graph.getEntity(contextId);
      setDetailContext(
        isContextEntity(context) && context.kind === 'domain'
          ? contextId
          : null,
      );
      canvasStageRef.current?.focus();
    },
    [state.graph, state.session],
  );
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
  const saveStoryExplanation = (step: FlowStepTrace, description: string) => {
    const { session, document } = state;
    if (
      session.isDocumentLocked() ||
      agent.running ||
      patchReview.review !== null
    )
      throw new Error('当前有建模事务正在处理，请稍后重试。');
    if (
      !story.ready ||
      story.step !== step ||
      session.getDocument() !== document
    )
      throw new Error('当前业务示例已变化，请重新核对后再采纳。');
    const entityIndex = document.entities.findIndex(
      ({ id }) => id === step.entityId,
    );
    const examples = document.entities[entityIndex]?.examples;
    const exampleIndex =
      examples?.findIndex(({ label }) => label === step.exampleLabel) ?? -1;
    const example = examples?.[exampleIndex];
    if (!example || example.test?.flow !== story.projection?.flowId)
      throw new Error('未找到当前步骤的业务示例，请刷新放映。');
    const value = description.trim();
    if (!value) throw new Error('请输入业务解释。');
    if (example.description === value) return;
    const path = `/entities/${entityIndex}`;
    const examplePath = `${path}/examples/${exampleIndex}`;
    session.applyPatchBatch(
      [
        { op: 'test', path: `${path}/id`, value: step.entityId },
        { op: 'test', path: examplePath, value: example },
        { op: 'add', path: `${examplePath}/description`, value },
      ],
      '修改示例业务解释',
    );
    toast.success('已更新业务解释，请保存模型。');
  };
  const graphStage = (
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
              onOpenScenarios={() => setScenarioOpen(true)}
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
          evidenceInquiry={
            storyActive
              ? undefined
              : {
                  target: inquiryTarget,
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
                        key={`${inquiryTarget.nodeId}:${inquiryTarget.kind}`}
                        nodeId={inquiryTarget.nodeId}
                        inquiry={inquiryTarget.kind}
                        canExploreVariation={
                          state.graph.getEntity(inquiryTarget.nodeId)?.kind ===
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
          onSelect={(nodeId) => state.session.select(nodeId)}
          onClearSelection={() => state.session.clearSelection()}
        />
      )}
    </div>
  );

  return (
    <LiveApiProvider analysis={delivery.analysis} stale={delivery.stale}>
      <div
        ref={workspaceRef}
        tabIndex={-1}
        className="flex h-full flex-col bg-evidence-surface focus:outline-none"
      >
        <TopHeader
          projectName={state.project.name}
          dirty={state.dirty}
          graph={state.graph}
          selection={state.selection}
          onSave={() => void save()}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          healthControl={
            !storyActive && !ledgerActive ? (
              <ModelHealthRadar
                graph={state.graph}
                canLocate={(nodeId) => state.layout.nodeById.has(nodeId)}
                inquiryBusy={agent.running || patchReview.review !== null}
                onAction={(kind, issue) => {
                  const target =
                    kind === 'locate'
                      ? issue.targetNodeId
                      : issue.inquiry?.nodeId;
                  if (!target || !state.layout.nodeById.has(target))
                    return false;
                  if (
                    kind === 'guide' &&
                    (agent.running ||
                      patchReview.review !== null ||
                      !issue.inquiry)
                  )
                    return false;
                  canvasStageRef.current?.focus();
                  revealOnGraph(target);
                  if (kind === 'guide' && issue.inquiry)
                    openInquiry(target, issue.inquiry.kind, issue.id);
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

        {!ledgerActive ? (
          <ViewModeBar
            {...(storyActive
              ? {
                  storyActive: true,
                  onCloseStory: closeStory,
                  storyControls: (
                    <>
                      <StoryPlayerBar
                        playback={story}
                        aiConfigured={ai?.aiConfigured}
                        onConfigureAi={ai?.openSettings}
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="default">
                            剧情详情
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          aria-label="剧情详情"
                          onInteractOutside={(event) => {
                            if (
                              event.target instanceof Element &&
                              event.target.closest('[data-story-toolbar]')
                            ) {
                              // Let readers step through scenes with details open.
                              event.preventDefault();
                            }
                          }}
                          collisionPadding={12}
                          className="flex h-[min(720px,var(--radix-popover-content-available-height))] w-[min(360px,var(--radix-popover-content-available-width))] flex-col rounded-xl p-0"
                        >
                          <div className="flex shrink-0 items-center justify-between border-b border-workbench-border px-4 py-2">
                            <h2 className="text-sm font-semibold">剧情详情</h2>
                            <PopoverClose asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="关闭剧情详情"
                              >
                                ×
                              </Button>
                            </PopoverClose>
                          </div>
                          <StoryDrawer
                            aiConfigured={ai?.aiConfigured}
                            onConfigureAi={ai?.openSettings}
                            onRevealOnCanvas={(nodeId) => {
                              closeStory();
                              revealOnGraph(nodeId);
                            }}
                            playback={story}
                            onSaveExplanation={saveStoryExplanation}
                            dirty={state.dirty}
                            externalConflict={
                              state.dirty && state.externalChangeAt !== null
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    </>
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
              directory: !ledgerActive && layout.isDirectoryOpen,
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

          {!ledgerActive && layout.isDirectoryOpen ? (
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
                  {!ledgerActive ? graphStage : null}
                  {!ledgerActive ? problemsPanel : null}
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel
                id="right-rail"
                order={2}
                defaultSize={30}
                minSize={18}
                maxSize={40}
                collapsible
                collapsedSize={0}
                onCollapse={() => setRightRailCollapsed(true)}
                onExpand={() => setRightRailCollapsed(false)}
                ref={rightRail}
              >
                {!ledgerActive ? (
                  <InspectorShell
                    collapsed={rightRailCollapsed}
                    onReturnToCanvas={returnToCanvas}
                    returnOnEscape={
                      !storyActive &&
                      patchReview.review === null &&
                      !stormingOpen
                    }
                  >
                    <RightInspector
                      graph={state.graph}
                      selection={state.selection}
                      showHeading={false}
                      active={!rightRailCollapsed}
                      gateReport={diagnosticsStale ? null : sensors.report}
                    />
                  </InspectorShell>
                ) : null}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {patchReview.review === null || reviewInInquiry ? null : (
            <div
              data-canvas-control=""
              data-evidence-capture-hide=""
              className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4"
            >
              <div className="pointer-events-auto max-h-64 w-full max-w-lg overflow-y-auto">
                <InlinePatchCard
                  review={patchReview.review}
                  busy={agent.running}
                  onAccept={acceptPatch}
                  onRevert={revertPatch}
                  onFocusEntity={revealOnGraph}
                />
              </div>
            </div>
          )}
        </div>

        {layout.isDeliveryOpen ? (
          <DeliveryHub
            hub={delivery}
            sync={syncStatus}
            projectName={state.project.name}
            dirty={state.dirty}
            externalChange={state.externalChangeAt !== null}
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

        {!ledgerActive ||
        state.externalChangeAt !== null ||
        state.saveError !== null ? (
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
            onOpenDelivery={layout.openDelivery}
            dirty={state.dirty}
            savedAt={state.savedAt}
            saveError={state.saveError}
            externalChangeAt={state.externalChangeAt}
            onReload={() => void reloadFromDisk()}
            onDismissExternalChange={dismissExternalChange}
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
              setStoryOpen(true);
              setScenarioOpen(false);
            }}
          />
        ) : null}
        <Toaster />
      </div>
    </LiveApiProvider>
  );
};
