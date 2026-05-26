import { useCallback, useEffect, useMemo } from 'react';
import {
  addEdge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import {
  useResource,
  type DiagramEdgeCollectionResource,
  type DiagramEdgeResource,
  type DiagramNodeCollectionResource,
  type DiagramNodeResource,
  type DiagramResource,
  type State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from '@evidence/ui';
import { Canvas } from '@evidence/ui/ai-elements/canvas';
import { Controls } from '@evidence/ui/ai-elements/controls';
import { Edge } from '@evidence/ui/ai-elements/edge';

import { calculateEdgeVisibility } from './components/calculate-edge-visibility';
import { calculateEvidenceEdgeHandles } from './components/calculate-evidence-edge-handles';
import { calculateLayout } from './components/calculate-layout';
import type {
  DiagramCanvasEdge,
  DiagramCanvasEdgeData,
  DiagramCanvasNode,
  DiagramNodeData,
} from './components/diagram-types';
import { nodeTypes } from './components/node-types';

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 80;
const CONTEXT_NODE_WIDTH = 420;
const CONTEXT_NODE_HEIGHT = 280;
const FULFILLMENT_NODE_TYPE = 'fulfillment-node';
const GROUP_NODE_TYPE = 'group-container';
const STICKY_NOTE_NODE_TYPE = 'sticky-note';
const ANIMATED_EDGE_TYPE = 'animated';

const edgeTypes = {
  [ANIMATED_EDGE_TYPE]: Edge.Animated,
};

type DiagramGraph = {
  edges: DiagramCanvasEdge[];
  nodes: DiagramCanvasNode[];
};

export function DiagramDetailView({
  resourceState,
}: {
  resourceState: State<DiagramResource>;
}) {
  const nodesResource = useMemo(
    () => resourceState.follow('nodes'),
    [resourceState],
  );
  const edgesResource = useMemo(
    () => resourceState.follow('edges'),
    [resourceState],
  );
  const nodes = useResource<DiagramNodeCollectionResource>(nodesResource);
  const edges = useResource<DiagramEdgeCollectionResource>(edgesResource);
  const loading = nodes.loading || edges.loading;
  const error = nodes.error ?? edges.error;

  const graph = useMemo(() => {
    if (!nodes.resourceState || !edges.resourceState) {
      return null;
    }

    return createDiagramGraph(
      [...nodes.resourceState.collection],
      [...edges.resourceState.collection],
    );
  }, [edges.resourceState, nodes.resourceState]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription>Diagram</CardDescription>
          <CardTitle>{resourceState.data.title}</CardTitle>
          <CardDescription>
            {resourceState.data.id} · Updated{' '}
            {formatDateTime(resourceState.data.updatedAt)}
          </CardDescription>
          <CardAction>
            <div className="flex flex-wrap justify-end gap-2">
              <Badge variant="secondary">{resourceState.data.type}</Badge>
              <Badge>{resourceState.data.status}</Badge>
            </div>
          </CardAction>
        </CardHeader>
      </Card>

      {loading ? <DiagramLoading /> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Diagram unavailable</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      {!loading && !error && graph ? <DiagramCanvas graph={graph} /> : null}
    </section>
  );
}

function DiagramLoading() {
  return (
    <Card className="min-h-[520px]">
      <CardContent className="flex h-full flex-1 flex-col gap-4 pt-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-[420px] w-full" />
      </CardContent>
    </Card>
  );
}

function DiagramCanvas({ graph }: { graph: DiagramGraph }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramCanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramCanvasEdge>([]);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setEdges, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<DiagramCanvasNode>[]) => {
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<DiagramCanvasEdge>[]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }

      setEdges((currentEdges) =>
        addEdge<DiagramCanvasEdge>(
          {
            ...connection,
            id: toDraftEdgeId(connection, currentEdges),
            type: ANIMATED_EDGE_TYPE,
            data: {
              relationType: null,
              styleProps: null,
            } satisfies DiagramCanvasEdgeData,
          },
          currentEdges,
        ),
      );
    },
    [setEdges],
  );

  if (graph.nodes.length === 0) {
    return (
      <Card className="min-h-[360px]">
        <CardContent className="flex flex-1 items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No nodes yet</EmptyTitle>
              <EmptyDescription>
                This diagram does not have a saved draft to render.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-0 flex-1">
      <CardContent className="min-h-0 flex-1 p-0">
        <div
          aria-label="Diagram canvas"
          className="h-[640px] min-h-[520px] overflow-hidden rounded-b-xl bg-muted/20"
        >
          <Canvas<DiagramCanvasNode, DiagramCanvasEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            panOnDrag
            selectionOnDrag={false}
          >
            <Controls />
          </Canvas>
        </div>
      </CardContent>
    </Card>
  );
}

function createDiagramGraph(
  nodeStates: State<DiagramNodeResource>[],
  edgeStates: State<DiagramEdgeResource>[],
): DiagramGraph {
  const nodes = nodeStates.map(toCanvasNode);
  const edgeNodes = new Set(nodes.map((node) => node.id));
  const edges = edgeStates.flatMap((edgeState): DiagramCanvasEdge[] => {
    if (!edgeNodes.has(edgeState.data.sourceNode.id)) {
      return [];
    }

    if (!edgeNodes.has(edgeState.data.targetNode.id)) {
      return [];
    }

    return [toCanvasEdge(edgeState)];
  });
  const visibleEdges = calculateEdgeVisibility(nodes, edges);
  const handledEdges = calculateEvidenceEdgeHandles(nodes, visibleEdges);

  return {
    nodes: [...calculateLayout(nodes, handledEdges)],
    edges: handledEdges,
  };
}

function toCanvasNode(
  nodeState: State<DiagramNodeResource>,
): DiagramCanvasNode {
  const data = nodeState.data;
  const localData = record(data.localData);
  const entityType = firstString(localData, ['type']) ?? data.type;
  const nodeData: DiagramNodeData = {
    ...localData,
    definition: record(localData.definition),
    id: data.logicalEntity?.id ?? data.id,
    label: firstString(localData, ['label', 'name', 'title']) ?? data.id,
    name: firstString(localData, ['name', 'label', 'title']) ?? data.id,
    subType: firstString(localData, ['subType', 'sub_type']),
    type: entityType,
  };
  const size = toNodeSize(entityType, data.width, data.height);

  return {
    id: data.id,
    type: toNodeComponentType(data.type, entityType),
    parentId: data.parent?.id ?? undefined,
    position: {
      x: finiteNumber(data.positionX) ?? 0,
      y: finiteNumber(data.positionY) ?? 0,
    },
    width: size.width,
    height: size.height,
    data: nodeData,
  };
}

function toCanvasEdge(
  edgeState: State<DiagramEdgeResource>,
): DiagramCanvasEdge {
  return {
    id: edgeState.data.id,
    source: edgeState.data.sourceNode.id,
    target: edgeState.data.targetNode.id,
    type: ANIMATED_EDGE_TYPE,
    sourceHandle: edgeState.data.sourceHandle ?? undefined,
    targetHandle: edgeState.data.targetHandle ?? undefined,
    ...(edgeState.data.label ? { label: edgeState.data.label } : {}),
    hidden: edgeState.data.hidden,
    data: {
      relationType: edgeState.data.relationType,
      styleProps: edgeState.data.styleProps,
    },
  };
}

function toNodeComponentType(rawNodeType: string, entityType: string): string {
  if (rawNodeType === GROUP_NODE_TYPE || entityType === 'CONTEXT') {
    return GROUP_NODE_TYPE;
  }

  if (rawNodeType === STICKY_NOTE_NODE_TYPE || rawNodeType === 'note') {
    return STICKY_NOTE_NODE_TYPE;
  }

  if (rawNodeType === FULFILLMENT_NODE_TYPE || rawNodeType === 'fulfillment') {
    return FULFILLMENT_NODE_TYPE;
  }

  return FULFILLMENT_NODE_TYPE;
}

function toNodeSize(
  entityType: string,
  width: number | null,
  height: number | null,
): { height: number; width: number } {
  if (entityType === 'CONTEXT') {
    return {
      height: positiveNumber(height) ?? CONTEXT_NODE_HEIGHT,
      width: positiveNumber(width) ?? CONTEXT_NODE_WIDTH,
    };
  }

  return {
    height: positiveNumber(height) ?? DEFAULT_NODE_HEIGHT,
    width: positiveNumber(width) ?? DEFAULT_NODE_WIDTH,
  };
}

function toDraftEdgeId(
  connection: Connection,
  currentEdges: DiagramCanvasEdge[],
): string {
  const baseId = `draft:${connection.source ?? 'source'}::${
    connection.target ?? 'target'
  }`;
  const existingIds = new Set(currentEdges.map((edge) => edge.id));
  let id = baseId;
  let suffix = 1;

  while (existingIds.has(id)) {
    id = `${baseId}:${suffix}`;
    suffix += 1;
  }

  return id;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(
  value: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function finiteNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function positiveNumber(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
