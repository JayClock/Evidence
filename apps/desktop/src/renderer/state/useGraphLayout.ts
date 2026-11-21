import { useMemo } from 'react';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import {
  computeSwimlaneLayout,
  EMPTY_GRAPH_LAYOUT,
  type CanvasViewMode,
  type DomainGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';

const EMPTY_LAYOUT: DomainGraphLayout = {
  ...EMPTY_GRAPH_LAYOUT,
  nodes: [],
  contextGroups: [],
  nodeById: new Map(),
  contextGroupById: new Map(),
  edgeById: new Map(),
};

/** Selection and playback updates must not recompute journey geometry. */
export const useGraphLayout = (graph: DomainGraph, viewMode: CanvasViewMode) =>
  useMemo(() => {
    try {
      return {
        layout: computeSwimlaneLayout(graph, viewMode),
        layoutError: null,
      };
    } catch (error) {
      return {
        layout: EMPTY_LAYOUT,
        layoutError: error instanceof Error ? error.message : String(error),
      };
    }
  }, [graph, viewMode]);
