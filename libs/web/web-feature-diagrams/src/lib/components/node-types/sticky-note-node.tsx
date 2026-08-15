import { Node as AiNode, NodeContent } from '@evidence/ui/ai-elements/node';
import type { NodeProps } from '@xyflow/react';
import { StickyNoteIcon } from 'lucide-react';

import type { DiagramCanvasNode } from '../diagram-types';

type StickyNoteNodeType = DiagramCanvasNode & { type: 'sticky-note' };

export function StickyNoteNode({
  data,
  selected,
}: NodeProps<StickyNoteNodeType>) {
  const entityContent =
    typeof data.label === 'string' && typeof data.type === 'string'
      ? `${data.label} (${data.type})`
      : undefined;
  const content =
    typeof data.content === 'string' ? data.content : (entityContent ?? '');

  return (
    <AiNode
      handles={{ source: true, target: true }}
      className={`h-full w-full min-w-[150px] rounded-lg border border-l-4 border-l-status-locked bg-card ${
        selected ? 'ring-2 ring-ring/40' : ''
      }`}
    >
      <NodeContent className="flex gap-2 p-3">
        <StickyNoteIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="whitespace-pre-wrap text-sm leading-5 text-foreground">
          {content}
        </div>
      </NodeContent>
    </AiNode>
  );
}
