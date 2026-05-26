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
    mockedUseResource.mockImplementation((resource: unknown) => {
      const rel = (resource as { rel: string }).rel;

      if (rel === 'nodes') {
        return resourceResponse(
          collectionState<DiagramNodeCollectionResource>([
            {
              data: {
                id: 'node-1',
                type: 'fulfillment',
                logicalEntity: { id: 'entity-1' },
                parent: null,
                positionX: 10,
                positionY: 20,
                width: 180,
                height: 90,
                localData: {
                  label: 'Contract',
                  subType: 'contract',
                  type: 'EVIDENCE',
                },
              },
            },
            {
              data: {
                id: 'node-2',
                type: 'fulfillment',
                logicalEntity: null,
                parent: null,
                positionX: 330,
                positionY: 20,
                width: 180,
                height: 90,
                localData: { name: 'Confirmation', type: 'EVIDENCE' },
              },
            },
          ]),
        );
      }

      return resourceResponse(
        collectionState<DiagramEdgeCollectionResource>([
          {
            data: {
              id: 'edge-1',
              sourceNode: { id: 'node-1' },
              targetNode: { id: 'node-2' },
              relationType: 'fulfills',
              label: 'fulfills',
              hidden: false,
            },
          },
        ]),
      );
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an independent diagram canvas', () => {
    const diagramState = {
      data: {
        id: 'diagram-1',
        title: 'Fulfillment Flow',
        type: 'fulfillment',
        status: 'draft',
        createdAt: '2026-01-02T03:04:05Z',
        updatedAt: '2026-01-03T04:05:06Z',
      },
      follow: (rel: string) => ({ rel }),
    } as unknown as State<DiagramResource>;

    render(<DiagramDetailView resourceState={diagramState} />);

    expect(screen.getByText('Fulfillment Flow')).toBeTruthy();
    expect(screen.getByLabelText('Diagram canvas')).toBeTruthy();
    expect(screen.getByText('Contract')).toBeTruthy();
    expect(screen.getByText('Confirmation')).toBeTruthy();
    expect(screen.getByText('fulfills')).toBeTruthy();
  });
});
