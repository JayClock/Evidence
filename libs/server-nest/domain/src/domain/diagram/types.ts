import { EdgeDescription } from './edge';
import { NodeDescription } from './node';

export type JsonObject = Record<string, unknown>;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Position {
  x: number;
  y: number;
}

export const defaultViewport = (): Viewport => ({ x: 0, y: 0, zoom: 1 });
export const defaultPosition = (): Position => ({ x: 0, y: 0 });

export interface DraftNode {
  id: string;
  description: NodeDescription;
}

export interface DraftEdge {
  id: string | null;
  description: EdgeDescription;
}
