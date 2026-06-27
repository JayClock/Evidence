import { Entity, HasMany, Ref } from '../core';
import { DomainError } from '../error';
import { DiagramEdge, DiagramEdges, EdgeDescription } from './edge';
import { DiagramNode, DiagramNodes, NodeDescription } from './node';
import {
  DiagramStatus,
  DiagramType,
  DraftEdge,
  DraftNode,
  Viewport,
} from './types';
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

  description(): DiagramDescription {
    return this.desc;
  }

  nodes(): HasMany<DiagramNode> {
    return this.diagramNodes;
  }

  addNode(desc: NodeDescription): Promise<DiagramNode> {
    return this.diagramNodes.add(desc);
  }

  addNodeWithId(
    nodeId: string | null,
    desc: NodeDescription,
  ): Promise<DiagramNode> {
    return this.diagramNodes.addWithId(nodeId, desc);
  }

  addNodes(descriptions: NodeDescription[]): Promise<DiagramNode[]> {
    return this.diagramNodes.addAll(descriptions);
  }

  updateNode(nodeId: string, desc: NodeDescription): Promise<DiagramNode> {
    return this.diagramNodes.update(nodeId, desc);
  }

  deleteNode(nodeId: string): Promise<void> {
    return this.diagramNodes.delete(nodeId);
  }

  replaceNodes(nodes: DraftNode[]): Promise<void> {
    return this.diagramNodes.replaceAll(nodes);
  }

  edges(): HasMany<DiagramEdge> {
    return this.diagramEdges;
  }

  addEdge(desc: EdgeDescription): Promise<DiagramEdge> {
    return this.diagramEdges.add(desc);
  }

  addEdgeWithId(
    edgeId: string | null,
    desc: EdgeDescription,
  ): Promise<DiagramEdge> {
    return this.diagramEdges.addWithId(edgeId, desc);
  }

  addEdges(descriptions: EdgeDescription[]): Promise<DiagramEdge[]> {
    return this.diagramEdges.addAll(descriptions);
  }

  updateEdge(edgeId: string, desc: EdgeDescription): Promise<DiagramEdge> {
    return this.diagramEdges.update(edgeId, desc);
  }

  deleteEdge(edgeId: string): Promise<void> {
    return this.diagramEdges.delete(edgeId);
  }

  replaceEdges(edges: DraftEdge[]): Promise<void> {
    return this.diagramEdges.replaceAll(edges);
  }

  versions(): HasMany<DiagramVersion> {
    return this.diagramVersions;
  }

  async createVersion(): Promise<DiagramVersion> {
    const nodes = await this.diagramNodes
      .findAll()
      .subCollection(0, Number.MAX_SAFE_INTEGER)
      .toArray();
    const edges = await this.diagramEdges
      .findAll()
      .subCollection(0, Number.MAX_SAFE_INTEGER)
      .toArray();
    const size = await this.diagramVersions.findAll().size();
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
}
