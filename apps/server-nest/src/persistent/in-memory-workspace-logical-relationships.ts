import { randomUUID } from 'node:crypto';
import {
  HasMany,
  LogicalRelationship,
  LogicalRelationshipDescription,
  Ref,
  DomainError,
  WorkspaceLogicalRelationships,
} from '../domain';
import { InMemoryStore, LogicalRelationshipRecord, now } from './records';

export class InMemoryWorkspaceLogicalRelationships
  implements WorkspaceLogicalRelationships, HasMany<LogicalRelationship>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<LogicalRelationship[]> {
    return this.records()
      .sort((left, right) => right.id.localeCompare(left.id))
      .slice(from, to)
      .map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<LogicalRelationship | null> {
    const record = this.store.logicalRelationships.get(id);
    if (
      !record ||
      record.workspaceId !== this.workspaceId ||
      record.deletedAt !== null
    ) {
      return null;
    }
    return this.assemble(record);
  }

  async size(): Promise<number> {
    return this.records().length;
  }

  async add(
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    this.validateDescription(desc);
    const id = randomUUID();
    const record: LogicalRelationshipRecord = {
      id,
      workspaceId: this.workspaceId,
      description: { ...desc, workspace: new Ref(this.workspaceId) },
      deletedAt: null,
    };
    this.store.logicalRelationships.set(id, record);
    return this.assemble(record);
  }

  async update(
    relationshipId: string,
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    this.validateDescription(desc);
    const current = this.store.logicalRelationships.get(relationshipId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    const record: LogicalRelationshipRecord = {
      ...current,
      description: { ...desc, workspace: new Ref(this.workspaceId) },
    };
    this.store.logicalRelationships.set(relationshipId, record);
    return this.assemble(record);
  }

  async delete(relationshipId: string): Promise<void> {
    const current = this.store.logicalRelationships.get(relationshipId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    this.store.logicalRelationships.set(relationshipId, {
      ...current,
      deletedAt: now(),
    });
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<[LogicalRelationship[], number]> {
    if (page === 0 || pageSize === 0) {
      throw DomainError.validation('page and pageSize must be greater than 0');
    }
    const rows = this.records().sort((left, right) =>
      right.id.localeCompare(left.id),
    );
    const total = rows.length;
    const offset = (page - 1) * pageSize;
    return [
      rows
        .slice(offset, offset + pageSize)
        .map((record) => this.assemble(record)),
      total,
    ];
  }

  private records(): LogicalRelationshipRecord[] {
    return [...this.store.logicalRelationships.values()].filter(
      (record) =>
        record.workspaceId === this.workspaceId && record.deletedAt === null,
    );
  }

  private validateDescription(desc: LogicalRelationshipDescription): void {
    for (const [label, endpointId] of [
      ['source', desc.source.id()],
      ['target', desc.target.id()],
    ] as const) {
      const entity = this.store.logicalEntities.get(endpointId);
      if (
        !entity ||
        entity.workspaceId !== this.workspaceId ||
        entity.deletedAt !== null
      ) {
        throw DomainError.validation(
          `logical relationship ${label} endpoint ${endpointId} not found in workspace ${this.workspaceId}`,
        );
      }
    }
  }

  private assemble(record: LogicalRelationshipRecord): LogicalRelationship {
    return new LogicalRelationship(record.id, {
      ...record.description,
      workspace: new Ref(record.workspaceId),
    });
  }
}
