import { randomUUID } from 'node:crypto';
import {
  DomainError,
  HasMany,
  LogicalEntity,
  LogicalEntityDescription,
  normalizeSubType,
  WorkspaceLogicalEntities,
} from '../../domain';
import { assembleLogicalEntity } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, now, rejectInvalidPage } from './utils';

export class PrismaWorkspaceLogicalEntities
  implements WorkspaceLogicalEntities, HasMany<LogicalEntity>
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<LogicalEntity[]> {
    const rows = await this.store.logicalEntity.findMany({
      where: this.visibleWhere(),
      orderBy: { updatedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleLogicalEntity);
  }

  async findByIdentity(id: string): Promise<LogicalEntity | null> {
    const row = await this.store.logicalEntity.findFirst({
      where: { ...this.visibleWhere(), id },
    });
    return row ? assembleLogicalEntity(row) : null;
  }

  async size(): Promise<number> {
    return this.store.logicalEntity.count({ where: this.visibleWhere() });
  }

  async add(desc: LogicalEntityDescription): Promise<LogicalEntity> {
    const timestamp = now();
    const row = await this.store.logicalEntity.create({
      data: {
        id: randomUUID(),
        workspaceId: this.workspaceId,
        ...this.data(desc),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return assembleLogicalEntity(row);
  }

  async update(
    entityId: string,
    desc: LogicalEntityDescription,
  ): Promise<LogicalEntity> {
    const current = await this.store.logicalEntity.findFirst({
      where: { ...this.visibleWhere(), id: entityId },
    });
    if (!current) {
      throw DomainError.notFound(`logical entity ${entityId} not found`);
    }
    const row = await this.store.logicalEntity.update({
      where: { id: entityId },
      data: { ...this.data(desc), updatedAt: now() },
    });
    return assembleLogicalEntity(row);
  }

  async delete(entityId: string): Promise<void> {
    const current = await this.store.logicalEntity.findFirst({
      where: { ...this.visibleWhere(), id: entityId },
    });
    if (!current) {
      throw DomainError.notFound(`logical entity ${entityId} not found`);
    }
    const timestamp = now();
    await this.store.logicalEntity.update({
      where: { id: entityId },
      data: { deletedAt: timestamp, updatedAt: timestamp },
    });
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<[LogicalEntity[], number]> {
    rejectInvalidPage(page, pageSize);
    const [rows, total] = await Promise.all([
      this.store.logicalEntity.findMany({
        where: this.visibleWhere(),
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.logicalEntity.count({ where: this.visibleWhere() }),
    ]);
    return [rows.map(assembleLogicalEntity), total];
  }

  private data(desc: LogicalEntityDescription) {
    const name = desc.name.trim();
    if (name.length === 0) {
      throw DomainError.validation('logical entity name must not be empty');
    }
    return {
      type: desc.type,
      subType: normalizeSubType(desc.type, desc.subType),
      name,
      label: desc.label,
      description: desc.description,
      attributes: inputJson(desc.attributes),
    };
  }

  private visibleWhere() {
    return { workspaceId: this.workspaceId, deletedAt: null };
  }
}
