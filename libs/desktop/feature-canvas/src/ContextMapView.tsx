import '@xyflow/react/dist/style.css';
import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Button } from '@evidence-poc/desktop-ui-kit';
import { CONTEXT_KIND_LABELS } from '@evidence-poc/evidence-schema';
import {
  CONTEXT_MAP_LINK_LABELS,
  deriveContextMapGraph,
  type ContextMapGraph,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';

type Cluster = ContextMapGraph['clusters'][number];
type ClusterNode = Node<
  { cluster: Cluster; open: (id: string) => void },
  'contextSummary'
>;

const ContextSummary = ({
  data: { cluster, open },
}: NodeProps<ClusterNode>) => (
  <article className="w-64 rounded-lg border border-workbench-border-strong bg-evidence-panel p-3 text-xs text-workbench-body shadow-sm">
    <Handle
      id="incoming-left"
      type="target"
      position={Position.Left}
      isConnectable={false}
    />
    <Handle
      id="incoming-right"
      type="target"
      position={Position.Right}
      isConnectable={false}
    />
    <h3 className="truncate font-semibold" title={cluster.label}>
      {cluster.label}
    </h3>
    <p
      className="truncate text-workbench-label"
      title={cluster.partyLabels.join(' · ')}
    >
      {CONTEXT_KIND_LABELS[cluster.kind]}
      {cluster.partyLabels.length > 0
        ? ` · ${cluster.partyLabels.join(' · ')}`
        : ''}
    </p>
    <p>
      {cluster.kind === 'domain'
        ? `${cluster.counts.subjects} 个标的物 · ${cluster.counts.rules} 条规则`
        : `${cluster.counts.pairs} 项已配对履约 · ${cluster.counts.remedies} 个救济终点`}
    </p>
    {cluster.sockets.length > 0 && (
      <p
        className="truncate"
        title={cluster.sockets
          .map(
            ({ label, providerRefs }) =>
              `${label}：${providerRefs.length || '待绑定'}`,
          )
          .join('；')}
      >
        {cluster.sockets.length} 个能力插槽 ·{' '}
        {
          cluster.sockets.filter(
            ({ providerRefs }) => providerRefs.length === 0,
          ).length
        }{' '}
        个待绑定
      </p>
    )}
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="nodrag mt-2"
      aria-label={`下钻：${cluster.label}`}
      onClick={() => open(cluster.id)}
    >
      下钻
    </Button>
    <Handle
      id="outgoing-left"
      type="source"
      position={Position.Left}
      isConnectable={false}
    />
    <Handle
      id="outgoing-right"
      type="source"
      position={Position.Right}
      isConnectable={false}
    />
  </article>
);
const NODE_TYPES = { contextSummary: ContextSummary };

export const ContextMapView = ({
  graph,
  onOpenContext,
}: {
  graph: DomainGraph;
  onOpenContext: (id: string, evidenceId?: string) => void;
}) => {
  const map = useMemo(() => deriveContextMapGraph(graph), [graph]);
  const [positions, setPositions] = useState<
    ReadonlyMap<string, ClusterNode['position']>
  >(new Map());
  const topology = useMemo(() => {
    const entry = new Set(graph.document.manifest.entryContextRefs);
    const rows = [0, 0, 0, 0];
    const nodes = map.clusters.map<ClusterNode>((cluster) => {
      const column =
        cluster.kind === 'domain'
          ? 3
          : cluster.kind === 'pre_contract'
            ? 2
            : entry.has(cluster.id)
              ? 0
              : 1;
      const row = rows[column] ?? 0;
      rows[column] = row + 1;
      return {
        id: cluster.id,
        type: 'contextSummary',
        position: positions.get(cluster.id) ?? {
          x: column * 400,
          y: row * 190,
        },
        data: { cluster, open: onOpenContext },
      };
    });
    const index = new Map(nodes.map((node) => [node.id, node]));
    const edges = map.edges.flatMap<Edge>((edge) => {
      const source = index.get(edge.sourceRef);
      const target = index.get(edge.targetRef);
      if (!source || !target) return [];
      const sourceSide =
        target.position.x < source.position.x ? 'left' : 'right';
      const targetSide =
        target.position.x > source.position.x ? 'left' : 'right';
      const sockets = source.data.cluster.sockets.filter(({ id }) =>
        edge.socketRefs.includes(id),
      );
      const label =
        sockets.length > 0
          ? sockets.map(({ label }) => label).join('、')
          : CONTEXT_MAP_LINK_LABELS[edge.kind];
      return [
        {
          id: edge.id,
          source: edge.sourceRef,
          target: edge.targetRef,
          sourceHandle: `outgoing-${sourceSide}`,
          targetHandle: `incoming-${targetSide}`,
          label,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          ariaLabel: `${source.data.cluster.label}依赖${target.data.cluster.label}：${label}`,
          style:
            edge.kind === 'evidence' ? { strokeDasharray: '5 3' } : undefined,
        },
      ];
    });
    return { nodes, edges };
  }, [graph, map, onOpenContext, positions]);

  if (map.clusters.length === 0)
    return (
      <p className="p-4 text-sm text-workbench-label">
        当前模型没有可汇总的上下文。
      </p>
    );

  return (
    <section
      aria-label="上下文地图"
      className="relative min-h-0 flex-1 bg-workbench-background"
    >
      <ReactFlow
        nodes={topology.nodes}
        edges={topology.edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.1}
        onlyRenderVisibleElements
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        onNodeDoubleClick={(_, node) => onOpenContext(node.id)}
        onNodesChange={(changes) => {
          const moved = changes.flatMap((change) =>
            change.type === 'position' && change.position
              ? [[change.id, change.position] as const]
              : [],
          );
          if (moved.length > 0)
            setPositions((previous) => new Map([...previous, ...moved]));
        }}
      >
        <Background />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <details className="absolute top-2 right-2 max-h-[80%] max-w-sm overflow-auto rounded border border-workbench-border bg-evidence-panel p-2 text-xs text-workbench-body">
        <summary className="cursor-pointer">
          依赖与插槽 · {map.edges.length}
        </summary>
        <ul className="mt-1 flex flex-col gap-1">
          {topology.edges.map(({ id, ariaLabel }) => (
            <li key={id}>{ariaLabel}</li>
          ))}
          {map.clusters.flatMap((cluster) =>
            cluster.sockets.map(({ id, label, providerRefs }) => (
              <li key={id}>
                {cluster.label}：{label}
                {providerRefs.length === 0 && '（待绑定）'}
                {providerRefs.length > 0 && (
                  <ul
                    className="mt-1 flex flex-wrap gap-1"
                    aria-label={`${label}的提供方凭证`}
                  >
                    {providerRefs.flatMap((ref) => {
                      const provider = graph.getEntity(ref);
                      if (
                        provider?.category !== 'evidence' ||
                        !provider.contextRef
                      )
                        return [];
                      const providerContext = provider.contextRef;
                      return [
                        <li key={ref}>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => onOpenContext(providerContext, ref)}
                          >
                            {provider.label}
                          </Button>
                        </li>,
                      ];
                    })}
                  </ul>
                )}
              </li>
            )),
          )}
        </ul>
        <ul aria-label="按上下文下钻" className="mt-2 flex flex-wrap gap-1">
          {map.clusters.map(({ id, label }) => (
            <li key={id}>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onOpenContext(id)}
              >
                {label}
              </Button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
};
