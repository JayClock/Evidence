import { Entity, HasMany, Ref } from '../core';
import { DomainError } from '../error';
import { DiagramEdge, DiagramEdges } from './edge';
import { DiagramNode, DiagramNodes } from './node';
import { DiagramStatus, DiagramType, Viewport } from './types';
import {
  DiagramVersion,
  DiagramVersionDescription,
  DiagramVersions,
} from './version';

export interface DiagramDescription {
  workspace: Ref<string>;
  title: string;
  type: DiagramType;
  viewport: Viewport;
  status: DiagramStatus;
  createdAt: string;
  updatedAt: string;
}

export class Diagram implements Entity<string, DiagramDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: DiagramDescription,
    private readonly diagramNodes: DiagramNodes,
    private readonly diagramEdges: DiagramEdges,
    private readonly diagramVersions: DiagramVersions,
  ) {}

  identity(): string {
    return this.id;
  }

  workspaceId(): string {
    return this.desc.workspace.id();
  }

  description(): DiagramDescription {
    return this.desc;
  }

  nodes(): HasMany<DiagramNode> {
    return this.diagramNodes;
  }

  nodesWide(): DiagramNodes {
    return this.diagramNodes;
  }

  edges(): HasMany<DiagramEdge> {
    return this.diagramEdges;
  }

  edgesWide(): DiagramEdges {
    return this.diagramEdges;
  }

  versions(): HasMany<DiagramVersion> {
    return this.diagramVersions;
  }

  async createVersion(): Promise<DiagramVersion> {
    const nodes = await this.diagramNodes.findAll(0, Number.MAX_SAFE_INTEGER);
    const edges = await this.diagramEdges.findAll(0, Number.MAX_SAFE_INTEGER);
    const size = await this.diagramVersions.size();
    const desc: DiagramVersionDescription = {
      diagram: new Ref(this.id),
      name: `v${size + 1}`,
      snapshot: {
        nodes: nodes.map((node) => ({
          id: node.identity(),
          description: node.description(),
        })),
        edges: edges.map((edge) => ({
          id: edge.identity(),
          description: edge.description(),
        })),
        viewport: this.desc.viewport,
      },
      createdAt: '',
    };
    const version = await this.diagramVersions.add(desc);
    if (!version) {
      throw DomainError.internal('created diagram version could not be loaded');
    }
    return version;
  }

  createdAt(): string {
    return this.desc.createdAt;
  }

  updatedAt(): string {
    return this.desc.updatedAt;
  }
}
