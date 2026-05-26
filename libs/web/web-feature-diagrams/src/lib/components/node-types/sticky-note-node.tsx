import { Node as AiNode, NodeContent } from '@evidence/ui/ai-elements/node';
import type { NodeProps } from '@xyflow/react';

import type { DiagramCanvasNode } from '../diagram-types';

type StickyNoteNodeType = DiagramCanvasNode & { type: 'sticky-note' };

export function StickyNoteNode({
  data,
  selected,
}: NodeProps<StickyNoteNodeType>) {
  const localContent = data.localData?.content;
  const label = data.localData?.label;
  const type = data.localData?.type;
  const entityContent =
    typeof label === 'string' && typeof type === 'string'
      ? `${label} (${type})`
      : undefined;
  const content =
    typeof localContent === 'string'
      ? localContent
      : (entityContent ?? data.content ?? '');

  return (
    <AiNode
      handles={{ source: true, target: true }}
      className={`min-w-[150px] rounded-r border-l-4 border-yellow-400 bg-yellow-100 shadow-md ${
        selected ? 'ring-primary/50 ring-4' : ''
      }`}
    >
      <NodeContent className="p-3">
        <div className="whitespace-pre-wrap text-sm text-gray-800">
          {content}
        </div>
      </NodeContent>
    </AiNode>
  );
}
