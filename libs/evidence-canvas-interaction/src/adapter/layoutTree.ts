import type { Point, Rect } from '../geometry.js';

/** Geometry of a journey before flattening. Children and routes are owner-local. */
export interface LayoutTreeNode extends Partial<Rect> {
  id: string;
  children?: LayoutTreeNode[];
  edges?: LayoutTreeEdge[];
}

export interface LayoutTreeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  points?: Point[];
}
