import { Entity, HasMany, Ref } from '../core';
import { EdgeDescription } from './edge';
import { NodeDescription } from './node';
import { Viewport } from './types';

export interface DiagramSnapshot {
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  viewport: Viewport;
}

export interface SnapshotNode {
  id: string;
  description: NodeDescription;
}

export interface SnapshotEdge {
  id: string;
  description: EdgeDescription;
}

export interface DiagramVersionDescription {
  diagram: Ref<string>;
  name: string;
  snapshot: DiagramSnapshot;
  createdAt: string;
}

export class DiagramVersion
  implements Entity<string, DiagramVersionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: DiagramVersionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): DiagramVersionDescription {
    return this.desc;
  }
}

export interface DiagramVersions extends HasMany<DiagramVersion> {
  add(desc: DiagramVersionDescription): Promise<DiagramVersion>;
}
