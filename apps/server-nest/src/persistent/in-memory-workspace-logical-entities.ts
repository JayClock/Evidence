import { randomUUID } from 'node:crypto';
import {
  HasMany,
  LogicalEntity,
  LogicalEntityDescription,
  normalizeSubType,
  Ref,
  ServerError,
  WorkspaceLogicalEntities,
} from '../domain';
import { InMemoryStore, LogicalEntityRecord, now } from './records';

export class InMemoryWorkspaceLogicalEntities
  implements WorkspaceLogicalEntities, HasMany<LogicalEntity>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<LogicalEntity[]> {
    return this.records()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(from, to)
      .map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<LogicalEntity | null> {
    const record = this.store.logicalEntities.get(id);
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

  async add(desc: LogicalEntityDescription): Promise<LogicalEntity> {
    const timestamp = now();
    const id = randomUUID();
    const description = this.descriptionForWorkspace(
      desc,
      timestamp,
      timestamp,
    );
    const record: LogicalEntityRecord = {
      id,
      workspaceId: this.workspaceId,
      description,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    this.store.logicalEntities.set(id, record);
    return this.assemble(record);
  }

  async update(
    entityId: string,
    desc: LogicalEntityDescription,
  ): Promise<LogicalEntity> {
    const current = this.store.logicalEntities.get(entityId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw ServerError.notFound(`logical entity ${entityId} not found`);
    }
    const timestamp = now();
    const record: LogicalEntityRecord = {
      ...current,
      description: this.descriptionForWorkspace(
        desc,
        current.createdAt,
        timestamp,
      ),
      updatedAt: timestamp,
    };
    this.store.logicalEntities.set(entityId, record);
    return this.assemble(record);
  }

  async delete(entityId: string): Promise<void> {
    const current = this.store.logicalEntities.get(entityId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw ServerError.notFound(`logical entity ${entityId} not found`);
    }
    const timestamp = now();
    this.store.logicalEntities.set(entityId, {
      ...current,
      deletedAt: timestamp,
      updatedAt: timestamp,
      description: { ...current.description, updatedAt: timestamp },
    });
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<[LogicalEntity[], number]> {
    if (page === 0 || pageSize === 0) {
      throw ServerError.validation('page and pageSize must be greater than 0');
    }
    const rows = this.records().sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
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

  private records(): LogicalEntityRecord[] {
    return [...this.store.logicalEntities.values()].filter(
      (record) =>
        record.workspaceId === this.workspaceId && record.deletedAt === null,
    );
  }

  private descriptionForWorkspace(
    desc: LogicalEntityDescription,
    createdAt: string,
    updatedAt: string,
  ): LogicalEntityDescription {
    const name = desc.name.trim();
    if (name.length === 0) {
      throw ServerError.validation('logical entity name must not be empty');
    }
    return {
      ...desc,
      workspace: new Ref(this.workspaceId),
      subType: normalizeSubType(desc.type, desc.subType),
      name,
      createdAt,
      updatedAt,
    };
  }

  private assemble(record: LogicalEntityRecord): LogicalEntity {
    return new LogicalEntity(record.id, {
      ...record.description,
      workspace: new Ref(record.workspaceId),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
