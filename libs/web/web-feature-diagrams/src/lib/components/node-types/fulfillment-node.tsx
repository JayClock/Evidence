import { Node as AiNode, NodeContent } from '@evidence/ui/ai-elements/node';
import { type NodeProps, useEdges, useNodes } from '@xyflow/react';
import { useMemo } from 'react';

import type { DiagramCanvasNode } from '../diagram-types';
import { resolveEvidencePartyRoleName } from '../resolve-evidence-party-role-names';

type FulfillmentNodeType = DiagramCanvasNode & { type: 'fulfillment-node' };

function getNodeColor(type: string): string {
  switch (type) {
    case 'Evidence':
    case 'EVIDENCE':
      return 'bg-pink-100 border-pink-300';
    case 'Role':
    case 'ROLE':
      return 'bg-yellow-100 border-yellow-300';
    case 'Participant':
    case 'PARTICIPANT':
      return 'bg-green-100 border-green-300';
    case 'Context':
    case 'CONTEXT':
      return 'bg-blue-100 border-blue-300';
    default:
      return 'bg-card border-border';
  }
}

function getNodeIcon(type: string): string {
  switch (type) {
    case 'Evidence':
    case 'EVIDENCE':
      return '📄';
    case 'Role':
    case 'ROLE':
      return '🎭';
    case 'Participant':
    case 'PARTICIPANT':
      return '👤';
    case 'Context':
    case 'CONTEXT':
      return '📦';
    default:
      return '📌';
  }
}

export function FulfillmentNode({
  data,
  id,
  selected,
}: NodeProps<FulfillmentNodeType>) {
  const entityType = data.type;
  const entityLabel = data.label;
  const entitySubType = data.subType;
  const bgColorClass = entityType
    ? getNodeColor(entityType)
    : 'bg-card border-border';
  const icon = entityType ? getNodeIcon(entityType) : '📌';
  const nodes = useNodes<DiagramCanvasNode>();
  const edges = useEdges();
  const partyRoleName = useMemo(
    () =>
      resolveEvidencePartyRoleName({
        edges,
        evidenceNodeId: id,
        nodes,
      }),
    [edges, id, nodes],
  );
  const partyRoleBadgeColorClass = getNodeColor('ROLE');
  const showPartyRoleName =
    entityType === 'EVIDENCE' &&
    entitySubType !== 'contract' &&
    (partyRoleName?.length ?? 0) > 0;

  return (
    <AiNode
      handles={{ source: true, target: true }}
      className={`h-full w-full overflow-visible rounded-lg border-2 shadow-md ${bgColorClass} ${
        selected ? 'ring-primary/60 ring-4' : ''
      }`}
    >
      {showPartyRoleName ? (
        <div
          className={`absolute top-0 right-0 z-10 max-w-[75%] translate-x-1/2 -translate-y-1/2 truncate rounded border px-1.5 py-0.5 text-right text-[10px] text-yellow-900 ${partyRoleBadgeColorClass}`}
        >
          {partyRoleName}
        </div>
      ) : null}
      <NodeContent className="flex h-full min-w-0 flex-col gap-1 overflow-hidden px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-lg">{icon}</span>
          <div className="min-w-0 truncate text-sm font-semibold">
            {entityLabel}
          </div>
        </div>
        {entitySubType ? (
          <div className="truncate text-xs text-gray-500">{entitySubType}</div>
        ) : null}
      </NodeContent>
    </AiNode>
  );
}
