import { useMemo } from 'react';
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

const DEFAULT_NODE_WIDTH = 190;
const DEFAULT_NODE_HEIGHT = 96;
const CANVAS_PADDING = 80;
const GRID_GAP_X = 120;
const GRID_GAP_Y = 96;
const MIN_CANVAS_WIDTH = 920;
const MIN_CANVAS_HEIGHT = 520;

type GraphNode = {
  height: number;
  id: string;
  label: string;
  logicalEntityId: string | null;
  parentId: string | null;
  subtitle: string;
  type: string;
  width: number;
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  label: string | null;
  relationType: string | null;
  source: GraphNode;
  target: GraphNode;
};

type DiagramGraph = {
  edges: GraphEdge[];
  height: number;
  nodes: GraphNode[];
  width: number;
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
      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        <div
          aria-label="Diagram canvas"
          className="relative overflow-hidden bg-muted/20"
          role="img"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
            backgroundSize: '24px 24px',
            height: graph.height,
            width: graph.width,
          }}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            height={graph.height}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            width={graph.width}
          >
            <defs>
              <marker
                id="diagram-arrow"
                markerHeight="10"
                markerWidth="10"
                orient="auto"
                refX="9"
                refY="3"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="var(--muted-foreground)" />
              </marker>
            </defs>
            {graph.edges.map((edge) => (
              <DiagramEdgePath edge={edge} key={edge.id} />
            ))}
          </svg>

          {graph.nodes.map((node) => (
            <DiagramNodeCard key={node.id} node={node} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DiagramEdgePath({ edge }: { edge: GraphEdge }) {
  const source = nodeCenter(edge.source);
  const target = nodeCenter(edge.target);
  const distance = Math.max(Math.abs(target.x - source.x) * 0.45, 80);
  const path = `M ${round(source.x)} ${round(source.y)} C ${round(
    source.x + distance,
  )} ${round(source.y)}, ${round(target.x - distance)} ${round(
    target.y,
  )}, ${round(target.x)} ${round(target.y)}`;
  const label = edge.label ?? edge.relationType;
  const labelX = round((source.x + target.x) / 2);
  const labelY = round((source.y + target.y) / 2 - 10);

  return (
    <g>
      <path
        d={path}
        fill="none"
        markerEnd="url(#diagram-arrow)"
        stroke="var(--muted-foreground)"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      {label ? (
        <text
          className="fill-muted-foreground text-[11px]"
          textAnchor="middle"
          x={labelX}
          y={labelY}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

function DiagramNodeCard({ node }: { node: GraphNode }) {
  return (
    <div
      className="absolute flex flex-col rounded-xl border bg-card/95 p-3 text-card-foreground shadow-sm ring-1 ring-background/80"
      style={{
        height: node.height,
        transform: `translate(${node.x}px, ${node.y}px)`,
        width: node.width,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{node.label}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {node.subtitle}
          </div>
        </div>
        <Badge variant="secondary">{node.type}</Badge>
      </div>
      <div className="mt-auto flex flex-wrap gap-1 pt-3 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{node.id}</span>
        {node.parentId ? (
          <span className="rounded bg-muted px-1.5 py-0.5">
            parent: {node.parentId}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function createDiagramGraph(
  nodeStates: State<DiagramNodeResource>[],
  edgeStates: State<DiagramEdgeResource>[],
): DiagramGraph {
  const rawNodes = nodeStates.map(toGraphNode);
  const shouldUseGrid = shouldApplyGridLayout(rawNodes);
  const positionedNodes = shouldUseGrid ? applyGridLayout(rawNodes) : rawNodes;
  const bounds = calculateBounds(positionedNodes);
  const nodes = positionedNodes.map((node) => ({
    ...node,
    x: round(node.x - bounds.minX + CANVAS_PADDING),
    y: round(node.y - bounds.minY + CANVAS_PADDING),
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = edgeStates.flatMap((edgeState) => {
    if (edgeState.data.hidden) {
      return [];
    }

    const source = nodeById.get(edgeState.data.sourceNode.id);
    const target = nodeById.get(edgeState.data.targetNode.id);
    if (!source || !target) {
      return [];
    }

    return [
      {
        id: edgeState.data.id,
        label: edgeState.data.label,
        relationType: edgeState.data.relationType,
        source,
        target,
      },
    ];
  });

  return {
    edges,
    height: Math.max(
      MIN_CANVAS_HEIGHT,
      round(bounds.maxY - bounds.minY + CANVAS_PADDING * 2),
    ),
    nodes,
    width: Math.max(
      MIN_CANVAS_WIDTH,
      round(bounds.maxX - bounds.minX + CANVAS_PADDING * 2),
    ),
  };
}

function toGraphNode(nodeState: State<DiagramNodeResource>): GraphNode {
  const data = nodeState.data;
  const localData = record(data.localData);
  const label = firstString(localData, ['label', 'name', 'title']) ?? data.id;
  const type = firstString(localData, ['type']) ?? data.type;
  const subType = firstString(localData, ['subType', 'sub_type']);

  return {
    height: positiveNumber(data.height) ?? DEFAULT_NODE_HEIGHT,
    id: data.id,
    label,
    logicalEntityId: data.logicalEntity?.id ?? null,
    parentId: data.parent?.id ?? null,
    subtitle: [subType, data.logicalEntity?.id].filter(Boolean).join(' · '),
    type,
    width: positiveNumber(data.width) ?? DEFAULT_NODE_WIDTH,
    x: finiteNumber(data.positionX) ?? 0,
    y: finiteNumber(data.positionY) ?? 0,
  };
}

function shouldApplyGridLayout(nodes: GraphNode[]) {
  if (nodes.length <= 1) {
    return false;
  }

  return nodes.every((node) => node.x === nodes[0].x && node.y === nodes[0].y);
}

function applyGridLayout(nodes: GraphNode[]) {
  const columns = Math.ceil(Math.sqrt(nodes.length));

  return nodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      ...node,
      x: column * (DEFAULT_NODE_WIDTH + GRID_GAP_X),
      y: row * (DEFAULT_NODE_HEIGHT + GRID_GAP_Y),
    };
  });
}

function calculateBounds(nodes: GraphNode[]) {
  if (nodes.length === 0) {
    return {
      maxX: MIN_CANVAS_WIDTH - CANVAS_PADDING * 2,
      maxY: MIN_CANVAS_HEIGHT - CANVAS_PADDING * 2,
      minX: 0,
      minY: 0,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return { maxX, maxY, minX, minY };
}

function nodeCenter(node: GraphNode) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
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

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
