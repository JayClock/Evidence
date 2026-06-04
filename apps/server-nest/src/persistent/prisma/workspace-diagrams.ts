import { randomUUID } from 'node:crypto';
import {
  defaultViewport,
  Diagram,
  DiagramDescription,
  DiagramStatus,
  DomainError,
  DraftEdge,
  DraftNode,
  HasMany,
  WorkspaceDiagrams,
} from '../../domain';
import { assembleDiagram } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, now, nullableInputJson, rejectInvalidPage } from './utils';

export class PrismaWorkspaceDiagrams
  implements WorkspaceDiagrams, HasMany<Diagram>
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<Diagram[]> {
    const rows = await this.store.diagram.findMany({
      where: this.visibleWhere(),
      orderBy: { updatedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map((row) => assembleDiagram(this.store, row));
  }

  async findByIdentity(id: string): Promise<Diagram | null> {
    const row = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id },
    });
    return row ? assembleDiagram(this.store, row) : null;
  }

  async size(): Promise<number> {
    return this.store.diagram.count({ where: this.visibleWhere() });
  }

  async add(desc: DiagramDescription): Promise<Diagram> {
    const timestamp = now();
    const row = await this.store.diagram.create({
      data: {
        id: randomUUID(),
        workspaceId: this.workspaceId,
        title: normalizeTitle(desc.title),
        type: desc.type,
        viewport: inputJson(desc.viewport ?? defaultViewport()),
        status: desc.status,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return assembleDiagram(this.store, row);
  }

  async update(diagramId: string, desc: DiagramDescription): Promise<Diagram> {
    const current = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id: diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }
    const timestamp = now();
    const row = await this.store.diagram.update({
      where: { id: diagramId },
      data: {
        title: normalizeTitle(desc.title),
        type: desc.type,
        viewport: inputJson(desc.viewport),
        status: desc.status,
        updatedAt: timestamp,
      },
    });
    return assembleDiagram(this.store, row);
  }

  async delete(diagramId: string): Promise<void> {
    const current = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id: diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }
    const timestamp = now();
    await this.store.diagram.update({
      where: { id: diagramId },
      data: { deletedAt: timestamp, updatedAt: timestamp },
    });
  }

  async list(page: number, pageSize: number): Promise<[Diagram[], number]> {
    rejectInvalidPage(page, pageSize);
    const [rows, total] = await Promise.all([
      this.store.diagram.findMany({
        where: this.visibleWhere(),
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.diagram.count({ where: this.visibleWhere() }),
    ]);
    return [rows.map((row) => assembleDiagram(this.store, row)), total];
  }

  async saveDiagram(
    diagramId: string,
    draftNodes: DraftNode[],
    draftEdges: DraftEdge[],
  ): Promise<void> {
    if (diagramId.trim().length === 0) {
      throw DomainError.validation('diagram id must be provided');
    }
    const current = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id: diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }

    const nodeIds = new Set(draftNodes.map((node) => node.id));
    for (const edge of draftEdges) {
      if (!nodeIds.has(edge.description.source.id())) {
        throw DomainError.validation(
          `draft edge source node not found: ${edge.description.source.id()}`,
        );
      }
      if (!nodeIds.has(edge.description.target.id())) {
        throw DomainError.validation(
          `draft edge target node not found: ${edge.description.target.id()}`,
        );
      }
    }

    const replace = async (db: PrismaStore): Promise<void> => {
      const timestamp = now();
      await db.diagramEdge.deleteMany({ where: { diagramId } });
      await db.diagramNode.deleteMany({ where: { diagramId } });
      if (draftNodes.length > 0) {
        await db.diagramNode.createMany({
          data: draftNodes.map((node) => ({
            id: node.id,
            diagramId,
            kind: node.description.kind,
            logicalEntityId: node.description.logicalEntity?.id() ?? null,
            parentId: node.description.parent?.id() ?? null,
            position: inputJson(node.description.position),
            width: node.description.width,
            height: node.description.height,
            data: inputJson(node.description.data),
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        });
      }
      if (draftEdges.length > 0) {
        await db.diagramEdge.createMany({
          data: draftEdges.map((edge) => ({
            id: edge.id ?? randomUUID(),
            diagramId,
            sourceId: edge.description.source.id(),
            targetId: edge.description.target.id(),
            logicalRelationshipId:
              edge.description.logicalRelationship?.id() ?? null,
            sourceHandle: edge.description.sourceHandle,
            targetHandle: edge.description.targetHandle,
            kind: edge.description.kind,
            style: inputJson(edge.description.style),
            data: inputJson(edge.description.data),
            animated: edge.description.animated,
            hidden: edge.description.hidden,
            markerStart: nullableInputJson(edge.description.markerStart),
            markerEnd: nullableInputJson(edge.description.markerEnd),
            pathOptions: inputJson(edge.description.pathOptions),
            interactionWidth: edge.description.interactionWidth,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        });
      }
      await db.diagram.update({
        where: { id: diagramId },
        data: { status: 'draft' satisfies DiagramStatus, updatedAt: timestamp },
      });
    };

    if ('$transaction' in this.store) {
      await this.store.$transaction((tx) => replace(tx));
      return;
    }
    await replace(this.store);
  }

  async publishDiagram(diagramId: string): Promise<void> {
    const current = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id: diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }
    await this.store.diagram.update({
      where: { id: diagramId },
      data: { status: 'published', updatedAt: now() },
    });
  }

  private visibleWhere() {
    return { workspaceId: this.workspaceId, deletedAt: null };
  }
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0) {
    throw DomainError.validation('diagram title must not be empty');
  }
  return normalized;
}
