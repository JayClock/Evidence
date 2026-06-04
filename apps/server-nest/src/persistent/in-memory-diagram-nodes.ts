import { randomUUID } from 'node:crypto';
import {
  DiagramNode,
  DiagramNodes,
  DraftNode,
  HasMany,
  NodeDescription,
  Ref,
  DomainError,
} from '../domain';
import { DiagramNodeRecord, InMemoryStore, now } from './records';

export class InMemoryDiagramNodes
  implements DiagramNodes, HasMany<DiagramNode>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly diagramId: string,
  ) {}

  async findAll(from: number, to: number): Promise<DiagramNode[]> {
    return this.records()
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(from, to)
      .map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<DiagramNode | null> {
    const record = this.store.diagramNodes.get(id);
    if (!record || record.diagramId !== this.diagramId) {
      return null;
    }
    return this.assemble(record);
  }

  async size(): Promise<number> {
    return this.records().length;
  }

  async add(desc: NodeDescription): Promise<DiagramNode> {
    return this.addWithId(null, desc);
  }

  async addWithId(
    nodeId: string | null,
    desc: NodeDescription,
  ): Promise<DiagramNode> {
    const id = nodeId ?? randomUUID();
    if (this.store.diagramNodes.has(id)) {
      throw DomainError.conflict(`diagram node ${id} already exists`);
    }
    const timestamp = now();
    const description = this.descriptionForDiagram(desc, timestamp, timestamp);
    const record: DiagramNodeRecord = {
      id,
      diagramId: this.diagramId,
      description,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.diagramNodes.set(id, record);
    return this.assemble(record);
  }

  async addAll(descriptions: NodeDescription[]): Promise<DiagramNode[]> {
    const nodes: DiagramNode[] = [];
    for (const description of descriptions) {
      nodes.push(await this.add(description));
    }
    return nodes;
  }

  async update(nodeId: string, desc: NodeDescription): Promise<DiagramNode> {
    const current = this.store.diagramNodes.get(nodeId);
    if (!current || current.diagramId !== this.diagramId) {
      throw DomainError.notFound(`diagram node ${nodeId} not found`);
    }
    const timestamp = now();
    const record: DiagramNodeRecord = {
      id: nodeId,
      diagramId: this.diagramId,
      description: this.descriptionForDiagram(
        desc,
        current.createdAt,
        timestamp,
      ),
      createdAt: current.createdAt,
      updatedAt: timestamp,
    };
    this.store.diagramNodes.set(nodeId, record);
    return this.assemble(record);
  }

  async delete(nodeId: string): Promise<void> {
    const current = this.store.diagramNodes.get(nodeId);
    if (!current || current.diagramId !== this.diagramId) {
      throw DomainError.notFound(`diagram node ${nodeId} not found`);
    }
    this.store.diagramNodes.delete(nodeId);
  }

  async replaceAll(nodes: DraftNode[]): Promise<void> {
    for (const edge of [...this.store.diagramEdges.values()]) {
      if (edge.diagramId === this.diagramId) {
        this.store.diagramEdges.delete(edge.id);
      }
    }
    for (const node of this.records()) {
      this.store.diagramNodes.delete(node.id);
    }
    const timestamp = now();
    for (const node of nodes) {
      this.store.diagramNodes.set(node.id, {
        id: node.id,
        diagramId: this.diagramId,
        description: this.descriptionForDiagram(
          node.description,
          timestamp,
          timestamp,
        ),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  private records(): DiagramNodeRecord[] {
    return [...this.store.diagramNodes.values()].filter(
      (record) => record.diagramId === this.diagramId,
    );
  }

  private descriptionForDiagram(
    desc: NodeDescription,
    createdAt: string,
    updatedAt: string,
  ): NodeDescription {
    return {
      ...desc,
      diagram: new Ref(this.diagramId),
      createdAt,
      updatedAt,
    };
  }

  private assemble(record: DiagramNodeRecord): DiagramNode {
    return new DiagramNode(record.id, {
      ...record.description,
      diagram: new Ref(record.diagramId),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
