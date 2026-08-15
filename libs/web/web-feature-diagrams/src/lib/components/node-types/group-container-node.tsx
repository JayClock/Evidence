import { Node as AiNode, NodeContent } from '@evidence/ui/ai-elements/node';
import type { NodeProps } from '@xyflow/react';
import { FrameIcon } from 'lucide-react';

import type { DiagramCanvasNode } from '../diagram-types';

type GroupContainerNodeType = DiagramCanvasNode & { type: 'group-container' };

export function GroupContainerNode({
  data,
  selected,
}: NodeProps<GroupContainerNodeType>) {
  return (
    <AiNode
      handles={{ source: true, target: true }}
      className={`box-border h-full w-full rounded-lg border border-dashed bg-secondary/35 ${
        selected ? 'ring-2 ring-ring/40' : ''
      }`}
    >
      <NodeContent className="flex items-center gap-2 p-3 text-muted-foreground">
        <FrameIcon aria-hidden className="size-4 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            {data.label}
          </div>
          {data.subType ? (
            <div className="truncate font-mono text-[0.6875rem]">
              {String(data.subType)}
            </div>
          ) : null}
        </div>
      </NodeContent>
    </AiNode>
  );
}
