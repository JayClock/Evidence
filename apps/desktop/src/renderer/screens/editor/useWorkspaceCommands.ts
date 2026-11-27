import { useMemo, useState } from 'react';
import { ENTITY_CATEGORY_LABELS } from '@evidence-poc/evidence-schema';
import type { CommandTarget } from '../../components/command/CommandPalette';
import type {
  CommandCapabilities,
  CommandHandlers,
} from '../../state/commandRegistry';
import { useCommandRegistry } from '../../state/useCommandRegistry';
import { useEditorShortcuts } from '../../state/useEditorShortcuts';
import type { EditorSessionController } from '../../state/useEditorSession';
import type { EditorSurfaces } from './useEditorSurfaces';
import type { EditorModeling } from './useEditorModeling';
import type { CanvasNavigation } from './useCanvasNavigation';
import type { EditorPlayback } from './useEditorPlayback';
import type { SensorsController } from '../../state/useSensorsState';

export const useWorkspaceCommands = (
  session: EditorSessionController,
  surfaces: EditorSurfaces,
  modeling: EditorModeling,
  playback: EditorPlayback,
  requestZoom: CanvasNavigation['requestZoom'],
  sensors: SensorsController,
) => {
  const { state, flush } = session;
  const { layout, workspaceView, storyActive, closeStory, toggleRightRail } =
    surfaces;
  const {
    ai,
    agent,
    startStorming,
    closeStorming,
    stormingOpen,
    reviewInInquiry,
    patchReview,
    canKeepPatch,
    canRevertPatch,
  } = modeling;
  const { openStory, canPlayStory } = playback;
  const [paletteOpen, setPaletteOpen] = useState(false);
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
      flush: () => void flush(),
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
      flush,
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
      flush: () => void flush(),
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
      flush,
      sensors.refresh,
      state.session,
      storyActive,
      toggleRightRail,
      closeStory,
    ],
  );

  useEditorShortcuts(shortcuts);

  return { commands, commandTargets, paletteOpen, setPaletteOpen };
};
