import { Entity, HasMany, Ref } from '../core';
import { DiagramEdge, DiagramEdges } from './edge';
import { DiagramNode, DiagramNodes } from './node';
import { Viewport } from './types';

export interface DiagramDescription {
  workspace: Ref<string>;
  title: string;
  viewport: Viewport;
  createdAt: string;
  updatedAt: string;
}

export class Diagram implements Entity<string, DiagramDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: DiagramDescription,
    private readonly diagramNodes: DiagramNodes,
    private readonly diagramEdges: DiagramEdges,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): DiagramDescription {
    return this.desc;
  }

  nodes(): HasMany<DiagramNode> {
    return this.diagramNodes;
  }

  edges(): HasMany<DiagramEdge> {
    return this.diagramEdges;
  }
}
