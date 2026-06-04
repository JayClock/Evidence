import { randomUUID } from 'node:crypto';
import {
  DomainError,
  HasMany,
  LogicalRelationship,
  LogicalRelationshipDescription,
  WorkspaceLogicalRelationships,
} from '../../domain';
import { assembleLogicalRelationship } from './mappers';
import type { PrismaStore } from './types';
import { now, rejectInvalidPage } from './utils';

export class PrismaWorkspaceLogicalRelationships
  implements WorkspaceLogicalRelationships, HasMany<LogicalRelationship>
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<LogicalRelationship[]> {
    const rows = await this.store.logicalRelationship.findMany({
      where: this.visibleWhere(),
      orderBy: { id: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleLogicalRelationship);
  }

  async findByIdentity(id: string): Promise<LogicalRelationship | null> {
    const row = await this.store.logicalRelationship.findFirst({
      where: { ...this.visibleWhere(), id },
    });
    return row ? assembleLogicalRelationship(row) : null;
  }

  async size(): Promise<number> {
    return this.store.logicalRelationship.count({ where: this.visibleWhere() });
  }

  async add(
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    await this.validateDescription(desc);
    const row = await this.store.logicalRelationship.create({
      data: {
        id: randomUUID(),
        workspaceId: this.workspaceId,
        sourceId: desc.source.id(),
        targetId: desc.target.id(),
        label: desc.label,
      },
    });
    return assembleLogicalRelationship(row);
  }

  async update(
    relationshipId: string,
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    await this.validateDescription(desc);
    const current = await this.store.logicalRelationship.findFirst({
      where: { ...this.visibleWhere(), id: relationshipId },
    });
    if (!current) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    const row = await this.store.logicalRelationship.update({
      where: { id: relationshipId },
      data: {
        sourceId: desc.source.id(),
        targetId: desc.target.id(),
        label: desc.label,
      },
    });
    return assembleLogicalRelationship(row);
  }

  async delete(relationshipId: string): Promise<void> {
    const current = await this.store.logicalRelationship.findFirst({
      where: { ...this.visibleWhere(), id: relationshipId },
    });
    if (!current) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    await this.store.logicalRelationship.update({
      where: { id: relationshipId },
      data: { deletedAt: now() },
    });
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<[LogicalRelationship[], number]> {
    rejectInvalidPage(page, pageSize);
    const [rows, total] = await Promise.all([
      this.store.logicalRelationship.findMany({
        where: this.visibleWhere(),
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.logicalRelationship.count({ where: this.visibleWhere() }),
    ]);
    return [rows.map(assembleLogicalRelationship), total];
  }

  private async validateDescription(
    desc: LogicalRelationshipDescription,
  ): Promise<void> {
    for (const [label, endpointId] of [
      ['source', desc.source.id()],
      ['target', desc.target.id()],
    ] as const) {
      const entity = await this.store.logicalEntity.findFirst({
        where: {
          id: endpointId,
          workspaceId: this.workspaceId,
          deletedAt: null,
        },
      });
      if (!entity) {
        throw DomainError.validation(
          `logical relationship ${label} endpoint ${endpointId} not found in workspace ${this.workspaceId}`,
        );
      }
    }
  }

  private visibleWhere() {
    return { workspaceId: this.workspaceId, deletedAt: null };
  }
}
