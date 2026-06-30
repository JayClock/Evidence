import { Node as AiNode, NodeContent } from '@evidence/ui/ai-elements/node';
import type { NodeProps } from '@xyflow/react';

import type { DiagramCanvasNode } from '../diagram-types';

type GroupContainerNodeType = DiagramCanvasNode & { type: 'group-container' };

function groupStyle(subType: unknown): {
  className: string;
  labelClassName: string;
} {
  if (subType === 'fulfillment_lane') {
    return {
      className: 'border-violet-300 bg-violet-50/45',
      labelClassName: 'text-violet-700',
    };
  }

  if (subType === 'shared_participant_pool') {
    return {
      className: 'border-emerald-300 bg-emerald-50/45',
      labelClassName: 'text-emerald-700',
    };
  }

  return {
    className: 'border-blue-400 bg-blue-50/30',
    labelClassName: 'text-blue-600',
  };
}

export function GroupContainerNode({
  data,
  selected,
}: NodeProps<GroupContainerNodeType>) {
  const style = groupStyle(data.subType);

  return (
    <AiNode
      handles={{ source: true, target: true }}
      className={`box-border h-full w-full rounded-lg border-2 border-dashed ${style.className} ${
        selected ? 'ring-primary/50 ring-4' : ''
      }`}
    >
      <NodeContent className="p-3">
        <div className={`text-xs font-medium ${style.labelClassName}`}>
          {data.label}
        </div>
      </NodeContent>
    </AiNode>
  );
}
