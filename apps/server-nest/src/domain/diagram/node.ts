import { Entity, HasMany, Ref } from '../core';
import { JsonObject, Position } from './types';

export interface NodeDescription {
  diagram: Ref<string>;
  kind: string;
  logicalEntity: Ref<string> | null;
  parent: Ref<string> | null;
  position: Position;
  width: number | null;
  height: number | null;
  data: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export class DiagramNode implements Entity<string, NodeDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: NodeDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  diagramId(): string {
    return this.desc.diagram.id();
  }

  description(): NodeDescription {
    return this.desc;
  }

  createdAt(): string {
    return this.desc.createdAt;
  }

  updatedAt(): string {
    return this.desc.updatedAt;
  }
}

export interface DiagramNodes extends HasMany<DiagramNode> {
  add(desc: NodeDescription): Promise<DiagramNode>;
  addWithId(nodeId: string | null, desc: NodeDescription): Promise<DiagramNode>;
  addAll(descriptions: NodeDescription[]): Promise<DiagramNode[]>;
  update(nodeId: string, desc: NodeDescription): Promise<DiagramNode>;
  delete(nodeId: string): Promise<void>;
  replaceAll(nodes: import('./types').DraftNode[]): Promise<void>;
}
