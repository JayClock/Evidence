import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import type { StoryView } from '@evidence-poc/desktop-feature-story';
import {
  type CanvasViewMode,
  type CanvasViewportMemory,
} from '@evidence-poc/desktop-feature-canvas';
import { useWorkspaceLayoutState } from '../../state/useWorkspaceLayoutState';
import { useWorkspaceViewMode } from '../../state/useWorkspaceViewMode';

export const useEditorSurfaces = () => {
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
  const [storyEntry, setStoryEntry] = useState<StoryView | null>(null);
  const storyActive = storyEntry !== null && !ledgerActive;
  const closeStory = useCallback(() => setStoryEntry(null), []);
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
  useLayoutEffect(() => {
    if (storyActive) expandRightRail();
  }, [storyActive, expandRightRail]);
  const returnToDirectory = useCallback(() => {
    closeStory();
    workspaceView.returnToGraph();
  }, [closeStory, workspaceView.returnToGraph]);
  const layout = useWorkspaceLayoutState(
    toggleLedger,
    ledgerActive || storyActive ? returnToDirectory : undefined,
  );
  const directoryVisible =
    !ledgerActive && !storyActive && layout.isDirectoryOpen;
  return {
    viewMode,
    setDensity,
    selectedScope,
    setSelectedScope,
    setDetailContext,
    overviewOpen,
    setOverviewOpen,
    canvasMemory,
    workspaceView,
    ledgerActive,
    storyEntry,
    setStoryEntry,
    storyActive,
    closeStory,
    rightRail,
    canvasStageRef,
    workspaceRef,
    returnToCanvas,
    rightRailCollapsed,
    setRightRailCollapsed,
    expandRightRail,
    toggleRightRail,
    layout,
    directoryVisible,
  };
};

export type EditorSurfaces = ReturnType<typeof useEditorSurfaces>;
