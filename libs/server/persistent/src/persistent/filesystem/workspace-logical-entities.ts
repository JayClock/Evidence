import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DomainError,
  LogicalEntity,
  type LogicalEntityDescription,
  normalizeSubType,
  parseLogicalEntityType,
  Ref,
  type WorkspaceLogicalEntities,
} from '@evidence/server-domain';
import { stringify } from 'yaml';
import { EntityList } from '../database';
import {
  fileTimestamp,
  listYamlFiles,
  optionalString,
  readYamlRecord,
  requiredString,
  type YamlRecord,
} from './model-files';

interface EntityRecord {
  entity: LogicalEntity;
  parent: string | null;
  path: string;
}

export class FileWorkspaceLogicalEntities
  extends EntityList<LogicalEntity>
  implements WorkspaceLogicalEntities
{
  private readonly entitiesDirectory: string;

  constructor(
    private readonly workspaceId: string,
    evidenceRoot: string,
  ) {
    super();
    this.entitiesDirectory = join(evidenceRoot, 'entities');
  }

  override async size(): Promise<number> {
    return (await this.load()).length;
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<LogicalEntity[]> {
    return (await this.load()).slice(from, to).map((record) => record.entity);
  }

  protected override async findEntity(
    id: string,
  ): Promise<LogicalEntity | null> {
    return (await this.findRecord(id))?.entity ?? null;
  }

  async add(desc: LogicalEntityDescription): Promise<LogicalEntity> {
    const name = normalizeName(desc.name);
    const id = await this.availableId(name);
    const path = join(this.entitiesDirectory, `${id}.yaml`);
    return this.writeEntity(path, id, { ...desc, name }, null);
  }

  async update(
    entityId: string,
    desc: LogicalEntityDescription,
  ): Promise<LogicalEntity> {
    const record = await this.findRecord(entityId);
    if (!record) {
      throw DomainError.notFound(`logical entity ${entityId} not found`);
    }
    return this.writeEntity(
      record.path,
      entityId,
      { ...desc, name: normalizeName(desc.name) },
      record.parent,
    );
  }

  async delete(entityId: string): Promise<void> {
    const record = await this.findRecord(entityId);
    if (!record) {
      throw DomainError.notFound(`logical entity ${entityId} not found`);
    }
    try {
      await rm(record.path);
    } catch (error) {
      throw DomainError.internal(
        `delete logical entity file ${record.path}: ${errorMessage(error)}`,
      );
    }
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<[LogicalEntity[], number]> {
    rejectInvalidPage(page, pageSize);
    const records = await this.load();
    const offset = (page - 1) * pageSize;
    return [
      records.slice(offset, offset + pageSize).map((record) => record.entity),
      records.length,
    ];
  }

  private async load(): Promise<EntityRecord[]> {
    const paths = await listYamlFiles(this.entitiesDirectory);
    const records = await Promise.all(
      paths.map((path) => this.readEntity(path)),
    );
    records.sort((left, right) => {
      const leftDescription = left.entity.description();
      const rightDescription = right.entity.description();
      return (
        leftDescription.name.localeCompare(rightDescription.name) ||
        left.entity.identity().localeCompare(right.entity.identity())
      );
    });
    return records;
  }

  private async findRecord(id: string): Promise<EntityRecord | null> {
    return (
      (await this.load()).find((record) => record.entity.identity() === id) ??
      null
    );
  }

  private async readEntity(path: string): Promise<EntityRecord> {
    const document = await readYamlRecord(path, 'logical entity');
    const id = requiredString(document, 'id', path, 'logical entity');
    const name = requiredString(document, 'name', path, 'logical entity');
    const type = parseLogicalEntityType(
      requiredString(document, 'type', path, 'logical entity'),
    );
    const subType = normalizeSubType(
      type,
      optionalString(document.subType ?? document.sub_type),
    );
    const parent = optionalString(document.parent);
    const timestamp = await fileTimestamp(path);

    return {
      path,
      parent,
      entity: new LogicalEntity(id, {
        workspace: new Ref(this.workspaceId),
        type,
        subType,
        name,
        label: optionalString(document.label),
        description: optionalContent(document.content ?? document.description),
        attributes: entityAttributes(document),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    };
  }

  private async writeEntity(
    path: string,
    id: string,
    desc: LogicalEntityDescription,
    parent: string | null,
  ): Promise<LogicalEntity> {
    const subType = normalizeSubType(desc.type, desc.subType);
    const document: YamlRecord = {
      id,
      name: desc.name,
      ...(desc.label ? { label: desc.label } : {}),
      type: desc.type,
      ...(subType ? { subType } : {}),
      ...(parent ? { parent } : {}),
      ...(desc.description ? { description: desc.description } : {}),
      ...(desc.attributes.length > 0 ? { attributes: desc.attributes } : {}),
    };
    try {
      await mkdir(this.entitiesDirectory, { recursive: true });
      await writeFile(path, stringify(document, { lineWidth: 0 }), 'utf8');
    } catch (error) {
      throw DomainError.internal(
        `write logical entity file ${path}: ${errorMessage(error)}`,
      );
    }
    return (await this.readEntity(path)).entity;
  }

  private async availableId(name: string): Promise<string> {
    const base = normalizeIdentifier(name) ?? randomUUID();
    if (!(await this.findRecord(base))) {
      return base;
    }

    for (;;) {
      const candidate = `${base}_${randomUUID().split('-')[0]}`;
      if (!(await this.findRecord(candidate))) {
        return candidate;
      }
    }
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw DomainError.validation('logical entity name must not be empty');
  }
  return normalized;
}

function normalizeIdentifier(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || null;
}

function optionalContent(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function entityAttributes(
  document: YamlRecord,
): LogicalEntityDescription['attributes'] {
  if (!Array.isArray(document.attributes)) {
    return [];
  }
  return document.attributes.filter(isEntityAttribute);
}

function isEntityAttribute(
  value: unknown,
): value is LogicalEntityDescription['attributes'][number] {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'name' in value &&
      typeof value.name === 'string',
  );
}

function rejectInvalidPage(page: number, pageSize: number): void {
  if (page <= 0 || pageSize <= 0) {
    throw DomainError.validation('page and pageSize must be greater than 0');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
