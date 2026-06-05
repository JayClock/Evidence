import { randomUUID } from 'node:crypto';
import {
  DiagramNode,
  DiagramNodes,
  DomainError,
  DraftNode,
  HasMany,
  NodeDescription,
} from '@evidence/server-nest-domain';
import { assembleDiagramNode } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, isUniqueConflict, now } from './utils';

export class PrismaDiagramNodes implements DiagramNodes, HasMany<DiagramNode> {
  constructor(
    private readonly store: PrismaStore,
    private readonly diagramId: string,
  ) {}

  async findAll(from: number, to: number): Promise<DiagramNode[]> {
    const rows = await this.store.diagramNode.findMany({
      where: { diagramId: this.diagramId },
      orderBy: { updatedAt: 'asc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleDiagramNode);
  }

  async findByIdentity(id: string): Promise<DiagramNode | null> {
    const row = await this.store.diagramNode.findFirst({
      where: { id, diagramId: this.diagramId },
    });
    return row ? assembleDiagramNode(row) : null;
  }

  async size(): Promise<number> {
    return this.store.diagramNode.count({
      where: { diagramId: this.diagramId },
    });
  }

  async add(desc: NodeDescription): Promise<DiagramNode> {
    return this.addWithId(null, desc);
  }

  async addWithId(
    nodeId: string | null,
    desc: NodeDescription,
  ): Promise<DiagramNode> {
    const id = nodeId ?? randomUUID();
    const timestamp = now();
    try {
      const row = await this.store.diagramNode.create({
        data: {
          id,
          diagramId: this.diagramId,
          kind: desc.kind,
          logicalEntityId: desc.logicalEntity?.id() ?? null,
          parentId: desc.parent?.id() ?? null,
          position: inputJson(desc.position),
          width: desc.width,
          height: desc.height,
          data: inputJson(desc.data),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      return assembleDiagramNode(row);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(`diagram node ${id} already exists`);
      }
      throw error;
    }
  }

  async addAll(descriptions: NodeDescription[]): Promise<DiagramNode[]> {
    const nodes: DiagramNode[] = [];
    for (const description of descriptions) {
      nodes.push(await this.add(description));
    }
    return nodes;
  }

  async update(nodeId: string, desc: NodeDescription): Promise<DiagramNode> {
    const current = await this.store.diagramNode.findFirst({
      where: { id: nodeId, diagramId: this.diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram node ${nodeId} not found`);
    }
    const row = await this.store.diagramNode.update({
      where: { id: nodeId },
      data: {
        kind: desc.kind,
        logicalEntityId: desc.logicalEntity?.id() ?? null,
        parentId: desc.parent?.id() ?? null,
        position: inputJson(desc.position),
        width: desc.width,
        height: desc.height,
        data: inputJson(desc.data),
        updatedAt: now(),
      },
    });
    return assembleDiagramNode(row);
  }

  async delete(nodeId: string): Promise<void> {
    const current = await this.store.diagramNode.findFirst({
      where: { id: nodeId, diagramId: this.diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram node ${nodeId} not found`);
    }
    await this.store.diagramNode.delete({ where: { id: nodeId } });
  }

  async replaceAll(nodes: DraftNode[]): Promise<void> {
    const timestamp = now();
    await this.store.diagramEdge.deleteMany({
      where: { diagramId: this.diagramId },
    });
    await this.store.diagramNode.deleteMany({
      where: { diagramId: this.diagramId },
    });
    if (nodes.length === 0) {
      return;
    }
    await this.store.diagramNode.createMany({
      data: nodes.map((node) => ({
        id: node.id,
        diagramId: this.diagramId,
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
}
