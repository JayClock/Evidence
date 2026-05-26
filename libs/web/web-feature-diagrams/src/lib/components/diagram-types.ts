import type { Edge, Node } from '@xyflow/react';

export type DiagramNodeData = {
  id?: string;
  type: string;
  subType?: string | null;
  name: string;
  label: string;
  definition: Record<string, unknown>;
  content?: string;
  localData?: Record<string, unknown> | null;
} & Record<string, unknown>;

export type DiagramCanvasNode = Node<DiagramNodeData>;

export type DiagramCanvasEdgeData = {
  relationType: string | null;
  styleProps: unknown;
} & Record<string, unknown>;

export type DiagramCanvasEdge = Edge<DiagramCanvasEdgeData>;
