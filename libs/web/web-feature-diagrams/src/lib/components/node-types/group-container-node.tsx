import { Node as AiNode, NodeContent } from '@evidence/ui/ai-elements/node';
import type { NodeProps } from '@xyflow/react';

import type { DiagramCanvasNode } from '../diagram-types';

type GroupContainerNodeType = DiagramCanvasNode & { type: 'group-container' };

export function GroupContainerNode({
  data,
  selected,
}: NodeProps<GroupContainerNodeType>) {
  return (
    <AiNode
      handles={{ source: true, target: true }}
      className={`box-border rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/30 ${
        selected ? 'ring-primary/50 ring-4' : ''
      }`}
    >
      <NodeContent className="p-3">
        <div className="text-xs text-blue-600">{data.label}</div>
      </NodeContent>
    </AiNode>
  );
}
