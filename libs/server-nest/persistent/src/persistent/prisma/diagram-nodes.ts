import { randomUUID } from 'node:crypto';
import {
  DiagramNode,
  DiagramNodes,
  DomainError,
  NodeDescription,
} from '@evidence/server-nest-domain';
import { EntityList } from '../database';
import { assembleDiagramNode } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, isUniqueConflict, now } from './utils';

export class PrismaDiagramNodes
  extends EntityList<DiagramNode>
  implements DiagramNodes
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
  ): Promise<DiagramNode[]> {
    const rows = await this.store.diagramNode.findMany({
      where: { diagramId: this.diagramId },
      orderBy: { updatedAt: 'asc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleDiagramNode);
  }

  protected override async findEntity(id: string): Promise<DiagramNode | null> {
    const row = await this.store.diagramNode.findFirst({
      where: { id, diagramId: this.diagramId },
    });
    return row ? assembleDiagramNode(row) : null;
  }

  override async size(): Promise<number> {
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
}
