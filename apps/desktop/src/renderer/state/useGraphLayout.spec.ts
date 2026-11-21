import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeSwimlaneLayout,
  EMPTY_GRAPH_LAYOUT,
  type CanvasViewMode,
} from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

import { useGraphLayout } from './useGraphLayout';

vi.mock('@evidence-poc/evidence-canvas-interaction', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@evidence-poc/evidence-canvas-interaction')
    >();
  return {
    ...actual,
    computeSwimlaneLayout: vi.fn(actual.computeSwimlaneLayout),
  };
});

const compute = vi.mocked(computeSwimlaneLayout);
const graphOf = () => createDomainGraph(createDesktopFixture());

beforeEach(() => {
  compute.mockClear();
});

describe('useGraphLayout', () => {
  it('only recomputes journey geometry when graph or density changes', () => {
    const graph = graphOf();
    const initialProps: { graph: typeof graph; viewMode: CanvasViewMode } = {
      graph,
      viewMode: 'standard',
    };
    const { result, rerender } = renderHook(
      ({ graph, viewMode }) => useGraphLayout(graph, viewMode),
      { initialProps },
    );
    const layout = result.current.layout;
    expect(layout.swimlaneRegions?.length).toBeGreaterThan(0);
    rerender({ ...initialProps });
    expect(result.current.layout).toBe(layout);
    expect(compute).toHaveBeenCalledOnce();
    rerender({ graph, viewMode: 'expanded' });
    expect(compute).toHaveBeenLastCalledWith(graph, 'expanded');
    const next = graphOf();
    rerender({ graph: next, viewMode: 'expanded' });
    expect(compute).toHaveBeenLastCalledWith(next, 'expanded');
  });

  it('clears geometry on failure and recovers on the next graph', () => {
    const { result, rerender } = renderHook(
      ({ graph }) => useGraphLayout(graph, 'standard'),
      { initialProps: { graph: graphOf() } },
    );
    compute.mockImplementationOnce(() => {
      throw new Error('bad layout');
    });
    rerender({ graph: graphOf() });
    expect(result.current.layout).toMatchObject(EMPTY_GRAPH_LAYOUT);
    expect(result.current.layout.nodeById.size).toBe(0);
    expect(result.current.layoutError).toBe('bad layout');
    rerender({ graph: graphOf() });
    expect(result.current.layoutError).toBeNull();
    expect(result.current.layout.nodes.length).toBeGreaterThan(0);
  });
});
