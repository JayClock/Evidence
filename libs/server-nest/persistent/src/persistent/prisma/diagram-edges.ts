import { randomUUID } from 'node:crypto';
import {
  DiagramEdge,
  DiagramEdges,
  DomainError,
  DraftEdge,
  EdgeDescription,
} from '@evidence/server-nest-domain';
import { EntityList } from '../database';
import { assembleDiagramEdge } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, isUniqueConflict, now, nullableInputJson } from './utils';

export class PrismaDiagramEdges
  extends EntityList<DiagramEdge>
  implements DiagramEdges
{
  constructor(
    private readonly store: PrismaStore,
    private readonly diagramId: string,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<DiagramEdge[]> {
    const rows = await this.store.diagramEdge.findMany({
      where: { diagramId: this.diagramId },
      orderBy: { updatedAt: 'asc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleDiagramEdge);
  }

  protected override async findEntity(id: string): Promise<DiagramEdge | null> {
    const row = await this.store.diagramEdge.findFirst({
      where: { id, diagramId: this.diagramId },
    });
    return row ? assembleDiagramEdge(row) : null;
  }

  override async size(): Promise<number> {
    return this.store.diagramEdge.count({
      where: { diagramId: this.diagramId },
    });
  }

  async add(desc: EdgeDescription): Promise<DiagramEdge> {
    return this.addWithId(null, desc);
  }

  async addWithId(
    edgeId: string | null,
    desc: EdgeDescription,
  ): Promise<DiagramEdge> {
    const id = edgeId ?? randomUUID();
    const timestamp = now();
    try {
      const row = await this.store.diagramEdge.create({
        data: this.data(id, desc, timestamp, timestamp),
      });
      return assembleDiagramEdge(row);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(`diagram edge ${id} already exists`);
      }
      throw error;
    }
  }

  async addAll(descriptions: EdgeDescription[]): Promise<DiagramEdge[]> {
    const edges: DiagramEdge[] = [];
    for (const description of descriptions) {
      edges.push(await this.add(description));
    }
    return edges;
  }

  async update(edgeId: string, desc: EdgeDescription): Promise<DiagramEdge> {
    const current = await this.store.diagramEdge.findFirst({
      where: { id: edgeId, diagramId: this.diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram edge ${edgeId} not found`);
    }
    const row = await this.store.diagramEdge.update({
      where: { id: edgeId },
      data: this.data(edgeId, desc, current.createdAt, now()),
    });
    return assembleDiagramEdge(row);
  }

  async delete(edgeId: string): Promise<void> {
    const current = await this.store.diagramEdge.findFirst({
      where: { id: edgeId, diagramId: this.diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram edge ${edgeId} not found`);
    }
    await this.store.diagramEdge.delete({ where: { id: edgeId } });
  }

  async replaceAll(edges: DraftEdge[]): Promise<void> {
    await this.store.diagramEdge.deleteMany({
      where: { diagramId: this.diagramId },
    });
    const timestamp = now();
    if (edges.length === 0) {
      return;
    }
    await this.store.diagramEdge.createMany({
      data: edges.map((edge) =>
        this.data(
          edge.id ?? randomUUID(),
          edge.description,
          timestamp,
          timestamp,
        ),
      ),
    });
  }

  private data(
    id: string,
    desc: EdgeDescription,
    createdAt: Date,
    updatedAt: Date,
  ) {
    return {
      id,
      diagramId: this.diagramId,
      sourceId: desc.source.id(),
      targetId: desc.target.id(),
      logicalRelationshipId: desc.logicalRelationship?.id() ?? null,
      sourceHandle: desc.sourceHandle,
      targetHandle: desc.targetHandle,
      kind: desc.kind,
      style: inputJson(desc.style),
      data: inputJson(desc.data),
      animated: desc.animated,
      hidden: desc.hidden,
      markerStart: nullableInputJson(desc.markerStart),
      markerEnd: nullableInputJson(desc.markerEnd),
      pathOptions: inputJson(desc.pathOptions),
      interactionWidth: desc.interactionWidth,
      createdAt,
      updatedAt,
    };
  }
}
