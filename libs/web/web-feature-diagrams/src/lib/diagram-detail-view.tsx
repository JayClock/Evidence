import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  addEdge,
  type Connection,
  type EdgeChange,
  type EdgeMarkerType,
  MarkerType,
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
  Card,
  CardContent,
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
import { projectFulfillmentReferences } from './components/project-fulfillment-references';
import type {
  DiagramCanvasEdge,
  DiagramCanvasEdgeData,
  DiagramCanvasNode,
  DiagramNodeData,
} from './components/diagram-types';
import { DiagramAiChat } from './ai/diagram-ai-chat';
import { nodeTypes } from './components/node-types';

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 80;
const FULFILLMENT_NODE_TYPE = 'fulfillment-node';
const GROUP_NODE_TYPE = 'group-container';
const STICKY_NOTE_NODE_TYPE = 'sticky-note';
const ANIMATED_EDGE_TYPE = 'animated';
const DEFAULT_MARKER_END: EdgeMarkerType = { type: MarkerType.ArrowClosed };

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
  const [graph, setGraph] = useState<DiagramGraph | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState<Error | null>(null);

  useEffect(() => {
    if (!nodes.resourceState || !edges.resourceState) {
      setGraph(null);
      setLayoutLoading(false);
      setLayoutError(null);
      return;
    }

    let cancelled = false;
    setLayoutLoading(true);
    setLayoutError(null);

    void createDiagramGraph(
      [...nodes.resourceState.collection],
      [...edges.resourceState.collection],
    )
      .then((nextGraph) => {
        if (!cancelled) {
          setGraph(nextGraph);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setGraph(null);
          setLayoutError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLayoutLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [edges.resourceState, nodes.resourceState]);

  const layoutPending = Boolean(
    nodes.resourceState && edges.resourceState && !graph && !layoutError,
  );
  const loading =
    nodes.loading || edges.loading || layoutLoading || layoutPending;
  const error = nodes.error ?? edges.error ?? layoutError;
  const refreshProjectedGraph = useCallback(async () => {
    await Promise.all([nodes.resource.refresh(), edges.resource.refresh()]);
  }, [edges.resource, nodes.resource]);

  return (
    <section className="flex min-h-0 h-full flex-1 flex-col gap-4">
      <h2 className="sr-only">{resourceState.data.title}</h2>
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-h-0 min-w-0 flex-col">
          {loading ? <DiagramLoading /> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Diagram unavailable</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}
          {!loading && !error && graph ? <DiagramCanvas graph={graph} /> : null}
        </div>
        <DiagramAiChat
          onModelUpdated={refreshProjectedGraph}
          resourceState={resourceState}
        />
      </div>
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
            id: toTemporaryEdgeId(connection, currentEdges),
            type: ANIMATED_EDGE_TYPE,
            data: {
              relationType: null,
            } satisfies DiagramCanvasEdgeData,
          },
          currentEdges,
        ),
      );
    },
    [setEdges],
  );
  const visibleEdges = useMemo(
    () => expandSelectedEdges(nodes, edges),
    [edges, nodes],
  );

  if (graph.nodes.length === 0) {
    return (
      <Card className="min-h-[360px]">
        <CardContent className="flex flex-1 items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No nodes yet</EmptyTitle>
              <EmptyDescription>
                This diagram does not have saved nodes to render.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-0 flex-1">
      <CardContent className="flex min-h-0 flex-1 p-0">
        <div
          aria-label="Diagram canvas"
          className="min-h-0 flex-1 overflow-hidden rounded-b-xl bg-muted/20"
        >
          <Canvas<DiagramCanvasNode, DiagramCanvasEdge>
            nodes={nodes}
            edges={visibleEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            nodesDraggable={false}
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

function expandSelectedEdges(
  nodes: DiagramCanvasNode[],
  edges: DiagramCanvasEdge[],
): DiagramCanvasEdge[] {
  const selectedNodeIds = new Set(
    nodes.filter((node) => node.selected).map((node) => node.id),
  );

  if (selectedNodeIds.size === 0) {
    return edges;
  }

  return edges.map((edge) => {
    if (edge.data?.visibility !== 'onSelect') {
      return edge;
    }

    return {
      ...edge,
      hidden: !(
        selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)
      ),
    };
  });
}

async function createDiagramGraph(
  nodeStates: State<DiagramNodeResource>[],
  edgeStates: State<DiagramEdgeResource>[],
): Promise<DiagramGraph> {
  const nodes = nodeStates.map(toCanvasNode);
  const edgeNodes = new Set(nodes.map((node) => node.id));
  const edges = edgeStates.flatMap((edgeState): DiagramCanvasEdge[] => {
    if (!edgeNodes.has(edgeState.data.source.id)) {
      return [];
    }

    if (!edgeNodes.has(edgeState.data.target.id)) {
      return [];
    }

    return [toCanvasEdge(edgeState)];
  });
  const projectedGraph = projectFulfillmentReferences(nodes, edges);
  const visibleEdges = calculateEdgeVisibility(
    projectedGraph.nodes,
    projectedGraph.edges,
  );
  const handledEdges = calculateEvidenceEdgeHandles(
    projectedGraph.nodes,
    visibleEdges,
  );

  return {
    nodes: await calculateLayout(projectedGraph.nodes, handledEdges),
    edges: handledEdges,
  };
}

function toCanvasNode(
  nodeState: State<DiagramNodeResource>,
): DiagramCanvasNode {
  const resourceData = nodeState.data;
  const payload = record(resourceData.data);
  const entityType = firstString(payload, ['type']) ?? resourceData.kind;
  const nodeData: DiagramNodeData = {
    ...payload,
    definition: record(payload.definition),
    id: resourceData.id,
    label: firstString(payload, ['label', 'name', 'title']) ?? resourceData.id,
    name: firstString(payload, ['name', 'label', 'title']) ?? resourceData.id,
    subType: firstString(payload, ['subType', 'sub_type']),
    type: entityType,
  };
  const size = toNodeSize(resourceData.width, resourceData.height);

  return {
    id: resourceData.id,
    type: toNodeComponentType(resourceData.kind, entityType),
    parentId: resourceData.parent?.id ?? undefined,
    position: {
      x: finiteNumber(resourceData.position?.x) ?? 0,
      y: finiteNumber(resourceData.position?.y) ?? 0,
    },
    width: size.width,
    height: size.height,
    data: nodeData,
  };
}

function toCanvasEdge(
  edgeState: State<DiagramEdgeResource>,
): DiagramCanvasEdge {
  const resourceData = edgeState.data;
  const customData = record(resourceData.data);
  const label = firstString(customData, ['label', 'name', 'title']);
  const relationType = firstString(customData, [
    'relationType',
    'relation_type',
  ]);

  return {
    id: resourceData.id,
    source: resourceData.source.id,
    target: resourceData.target.id,
    type: toEdgeComponentType(resourceData.kind),
    sourceHandle: resourceData.sourceHandle ?? undefined,
    targetHandle: resourceData.targetHandle ?? undefined,
    ...(label ? { label } : {}),
    style: cssProperties(resourceData.style),
    animated: resourceData.animated,
    hidden: resourceData.hidden,
    markerStart: edgeMarker(resourceData.markerStart),
    markerEnd: edgeMarker(resourceData.markerEnd) ?? DEFAULT_MARKER_END,
    pathOptions: recordOrUndefined(resourceData.pathOptions),
    interactionWidth:
      positiveNumber(resourceData.interactionWidth) ?? undefined,
    data: {
      ...customData,
      relationType,
    },
  };
}

function toEdgeComponentType(rawEdgeType: string | null): string {
  const edgeType = rawEdgeType?.trim();

  if (
    edgeType === 'default' ||
    edgeType === 'smoothstep' ||
    edgeType === 'step' ||
    edgeType === 'straight'
  ) {
    return edgeType;
  }

  return 'smoothstep';
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
  width: number | null,
  height: number | null,
): { height: number; width: number } {
  return {
    height: positiveNumber(height) ?? DEFAULT_NODE_HEIGHT,
    width: positiveNumber(width) ?? DEFAULT_NODE_WIDTH,
  };
}

function toTemporaryEdgeId(
  connection: Connection,
  currentEdges: DiagramCanvasEdge[],
): string {
  const baseId = `temporary:${connection.source ?? 'source'}::${
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

function recordOrUndefined(
  value: unknown,
): Record<string, unknown> | undefined {
  const result = record(value);
  return Object.keys(result).length > 0 ? result : undefined;
}

function cssProperties(value: unknown): CSSProperties | undefined {
  return recordOrUndefined(value) as CSSProperties | undefined;
}

function edgeMarker(value: unknown): EdgeMarkerType | undefined {
  return value == null ? undefined : (value as EdgeMarkerType);
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
