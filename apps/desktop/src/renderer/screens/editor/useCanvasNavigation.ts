import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeContextScope } from '@evidence-poc/evidence-canvas-interaction';
import type { SensorIssue } from '@evidence-poc/evidence-agent-sensors/browser';
import { isContextEntity } from '@evidence-poc/evidence-schema';
import type { ZoomDirection } from '@evidence-poc/desktop-feature-canvas';
import type { EditorSessionState } from '../../state/useEditorSession';
import type { EditorSurfaces } from './useEditorSurfaces';

export const useCanvasNavigation = (
  state: EditorSessionState,
  surfaces: EditorSurfaces,
) => {
  const {
    canvasMemory,
    canvasStageRef,
    expandRightRail,
    ledgerActive,
    selectedScope,
    setSelectedScope,
    setDetailContext,
    setOverviewOpen,
    workspaceView,
    closeStory,
  } = surfaces;
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

  const requestZoom = useCallback((direction: ZoomDirection) => {
    tokenRef.current += 1;
    setZoomCommand({ direction, token: tokenRef.current });
  }, []);

  const revealOnGraph = useCallback(
    (nodeId: string) => {
      focusNode(nodeId);
      workspaceView.returnToGraph();
    },
    [focusNode, workspaceView.returnToGraph],
  );
  const revealFromStory = (nodeId: string) => {
    closeStory();
    revealOnGraph(nodeId);
  };

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
  return {
    changeScope,
    scope,
    focusNode,
    focusIssue,
    resolveIssueTarget,
    focusRequest,
    zoomCommand,
    setZoomCommand,
    requestZoom,
    openContextMap,
    closeContextMap,
    openMapContext,
    revealOnGraph,
    revealFromStory,
  };
};

export type CanvasNavigation = ReturnType<typeof useCanvasNavigation>;
