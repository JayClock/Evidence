import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import {
  useResource,
  type DiagramEdgeCollectionResource,
  type DiagramNodeCollectionResource,
  type DiagramResource,
  type Entity,
  type State,
} from '@evidence/api-client';

import { DiagramDetailView } from './diagram-detail-view';

vi.mock('@evidence/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@evidence/api-client')>();

  return {
    ...actual,
    useResource: vi.fn(),
  };
});

vi.mock('@xyflow/react', () => ({
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: {
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
    Top: 'top',
  },
  ReactFlow: ({
    children,
    edges,
    nodes,
  }: {
    children?: ReactNode;
    edges: Array<{ id: string; label?: string }>;
    nodes: Array<{ data: { label: string } }>;
  }) => (
    <div data-testid="react-flow">
      {nodes.map((node) => (
        <div key={node.data.label}>{node.data.label}</div>
      ))}
      {edges.map((edge) => (
        <div key={edge.id}>{edge.label}</div>
      ))}
      {children}
    </div>
  ),
  useEdges: () => [],
  useEdgesState: (initialEdges: unknown[]) => {
    const [edges, setEdges] = useState(initialEdges);
    return [edges, setEdges, vi.fn()] as const;
  },
  useNodes: () => [],
  useNodesState: (initialNodes: unknown[]) => {
    const [nodes, setNodes] = useState(initialNodes);
    return [nodes, setNodes, vi.fn()] as const;
  },
}));

const mockedUseResource = vi.mocked(useResource);

class ResizeObserverStub {
  observe() {
    // jsdom does not implement ResizeObserver.
  }

  unobserve() {
    // jsdom does not implement ResizeObserver.
  }

  disconnect() {
    // jsdom does not implement ResizeObserver.
  }
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function collectionState<T extends Entity>(collection: unknown[]): State<T> {
  return { collection, data: {} } as unknown as State<T>;
}

function resourceResponse<T extends Entity>(resourceState: State<T>) {
  return {
    data: resourceState.data,
    error: null,
    loading: false,
    resource: {},
    resourceState,
  } as unknown as ReturnType<typeof useResource>;
}

describe('DiagramDetailView', () => {
  beforeEach(() => {
    const nodeResponse = resourceResponse(
      collectionState<DiagramNodeCollectionResource>([
        {
          data: {
            id: 'node-1',
            kind: 'fulfillment',
            logicalEntity: { id: 'entity-1' },
            parent: null,
            position: { x: 10, y: 20 },
            width: 180,
            height: 90,
            data: {
              label: 'Contract',
              subType: 'contract',
              type: 'EVIDENCE',
            },
          },
        },
        {
          data: {
            id: 'node-2',
            kind: 'fulfillment',
            logicalEntity: null,
            parent: null,
            position: { x: 330, y: 20 },
            width: 180,
            height: 90,
            data: { name: 'Confirmation', type: 'EVIDENCE' },
          },
        },
      ]),
    );
    const edgeResponse = resourceResponse(
      collectionState<DiagramEdgeCollectionResource>([
        {
          data: {
            id: 'edge-1',
            source: { id: 'node-1' },
            target: { id: 'node-2' },
            kind: 'animated',
            style: null,
            data: { label: 'fulfills', relationType: 'fulfills' },
            animated: false,
            hidden: false,
            markerStart: null,
            markerEnd: null,
            pathOptions: {},
            interactionWidth: null,
          },
        },
      ]),
    );

    mockedUseResource.mockImplementation((resource: unknown) => {
      const rel = (resource as { rel: string }).rel;

      return rel === 'nodes' ? nodeResponse : edgeResponse;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an independent diagram canvas', async () => {
    const diagramState = {
      data: {
        id: 'diagram-1',
        title: 'Fulfillment Flow',
        createdAt: '2026-01-02T03:04:05Z',
        updatedAt: '2026-01-03T04:05:06Z',
      },
      follow: (rel: string) => ({ rel }),
    } as unknown as State<DiagramResource>;

    render(<DiagramDetailView resourceState={diagramState} />);

    expect(await screen.findByText('Fulfillment Flow')).toBeTruthy();
    expect(await screen.findByLabelText('Diagram canvas')).toBeTruthy();
    expect(
      await screen.findByRole('region', { name: 'AI modeling assistant' }),
    ).toBeTruthy();
    expect(
      await screen.findByPlaceholderText(
        'Describe the fulfillment model to propose…',
      ),
    ).toBeTruthy();
    expect(await screen.findByText('Contract')).toBeTruthy();
    expect(await screen.findByText('Confirmation')).toBeTruthy();
    expect(await screen.findByText('fulfills')).toBeTruthy();
  });
});
