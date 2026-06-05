import { Entity, HasMany, Ref } from '../core';
import { JsonObject } from './types';

export interface EdgeDescription {
  diagram: Ref<string>;
  source: Ref<string>;
  target: Ref<string>;
  logicalRelationship: Ref<string> | null;
  sourceHandle: string | null;
  targetHandle: string | null;
  kind: string | null;
  style: JsonObject;
  data: JsonObject;
  animated: boolean;
  hidden: boolean;
  markerStart: JsonObject | null;
  markerEnd: JsonObject | null;
  pathOptions: JsonObject;
  interactionWidth: number | null;
  createdAt: string;
  updatedAt: string;
}

export class DiagramEdge implements Entity<string, EdgeDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: EdgeDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): EdgeDescription {
    return this.desc;
  }
}

export interface DiagramEdges extends HasMany<DiagramEdge> {
  add(desc: EdgeDescription): Promise<DiagramEdge>;
  addWithId(edgeId: string | null, desc: EdgeDescription): Promise<DiagramEdge>;
  addAll(descriptions: EdgeDescription[]): Promise<DiagramEdge[]>;
  update(edgeId: string, desc: EdgeDescription): Promise<DiagramEdge>;
  delete(edgeId: string): Promise<void>;
  replaceAll(edges: import('./types').DraftEdge[]): Promise<void>;
}
