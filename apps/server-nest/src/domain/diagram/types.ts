import { ServerError } from '../error';
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

export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'component'
  | 'state'
  | 'activity'
  | 'fulfillment';

export type DiagramStatus = 'draft' | 'published';

export function parseDiagramType(value: string): DiagramType {
  switch (value) {
    case 'flowchart':
    case 'sequence':
    case 'class':
    case 'component':
    case 'state':
    case 'activity':
    case 'fulfillment':
      return value;
    default:
      throw ServerError.validation(`unknown diagram type: ${value}`);
  }
}

export function parseDiagramStatus(value: string): DiagramStatus {
  switch (value) {
    case 'draft':
    case 'published':
      return value;
    default:
      throw ServerError.validation(`unknown diagram status: ${value}`);
  }
}

export interface DraftNode {
  id: string;
  description: NodeDescription;
}

export interface DraftEdge {
  id: string | null;
  description: EdgeDescription;
}
