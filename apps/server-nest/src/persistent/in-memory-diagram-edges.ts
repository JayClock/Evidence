import { randomUUID } from 'node:crypto';
import {
  DiagramEdge,
  DiagramEdges,
  DraftEdge,
  EdgeDescription,
  HasMany,
  Ref,
  ServerError,
} from '../domain';
import { DiagramEdgeRecord, InMemoryStore, now } from './records';

export class InMemoryDiagramEdges
  implements DiagramEdges, HasMany<DiagramEdge>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly diagramId: string,
  ) {}

  async findAll(from: number, to: number): Promise<DiagramEdge[]> {
    return this.records()
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(from, to)
      .map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<DiagramEdge | null> {
    const record = this.store.diagramEdges.get(id);
    if (!record || record.diagramId !== this.diagramId) {
      return null;
    }
    return this.assemble(record);
  }

  async size(): Promise<number> {
    return this.records().length;
  }

  async add(desc: EdgeDescription): Promise<DiagramEdge> {
    return this.addWithId(null, desc);
  }

  async addWithId(
    edgeId: string | null,
    desc: EdgeDescription,
  ): Promise<DiagramEdge> {
    const id = edgeId ?? randomUUID();
    if (this.store.diagramEdges.has(id)) {
      throw ServerError.conflict(`diagram edge ${id} already exists`);
    }
    const timestamp = now();
    const record: DiagramEdgeRecord = {
      id,
      diagramId: this.diagramId,
      description: this.descriptionForDiagram(desc, timestamp, timestamp),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.diagramEdges.set(id, record);
    return this.assemble(record);
  }

  async addAll(descriptions: EdgeDescription[]): Promise<DiagramEdge[]> {
    const edges: DiagramEdge[] = [];
    for (const description of descriptions) {
      edges.push(await this.add(description));
    }
    return edges;
  }

  async update(edgeId: string, desc: EdgeDescription): Promise<DiagramEdge> {
    const current = this.store.diagramEdges.get(edgeId);
    if (!current || current.diagramId !== this.diagramId) {
      throw ServerError.notFound(`diagram edge ${edgeId} not found`);
    }
    const timestamp = now();
    const record: DiagramEdgeRecord = {
      id: edgeId,
      diagramId: this.diagramId,
      description: this.descriptionForDiagram(
        desc,
        current.createdAt,
        timestamp,
      ),
      createdAt: current.createdAt,
      updatedAt: timestamp,
    };
    this.store.diagramEdges.set(edgeId, record);
    return this.assemble(record);
  }

  async delete(edgeId: string): Promise<void> {
    const current = this.store.diagramEdges.get(edgeId);
    if (!current || current.diagramId !== this.diagramId) {
      throw ServerError.notFound(`diagram edge ${edgeId} not found`);
    }
    this.store.diagramEdges.delete(edgeId);
  }

  async replaceAll(edges: DraftEdge[]): Promise<void> {
    for (const edge of this.records()) {
      this.store.diagramEdges.delete(edge.id);
    }
    const timestamp = now();
    for (const edge of edges) {
      const id = edge.id ?? randomUUID();
      this.store.diagramEdges.set(id, {
        id,
        diagramId: this.diagramId,
        description: this.descriptionForDiagram(
          edge.description,
          timestamp,
          timestamp,
        ),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  private records(): DiagramEdgeRecord[] {
    return [...this.store.diagramEdges.values()].filter(
      (record) => record.diagramId === this.diagramId,
    );
  }

  private descriptionForDiagram(
    desc: EdgeDescription,
    createdAt: string,
    updatedAt: string,
  ): EdgeDescription {
    return {
      ...desc,
      diagram: new Ref(this.diagramId),
      createdAt,
      updatedAt,
    };
  }

  private assemble(record: DiagramEdgeRecord): DiagramEdge {
    return new DiagramEdge(record.id, {
      ...record.description,
      diagram: new Ref(record.diagramId),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
