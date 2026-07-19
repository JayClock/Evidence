import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DomainError,
  LogicalRelationship,
  type LogicalRelationshipDescription,
  Ref,
  type WorkspaceLogicalRelationships,
} from '@evidence/server-nest-domain';
import { stringify } from 'yaml';
import { EntityList } from '../database';
import {
  listYamlFiles,
  optionalString,
  readYamlRecord,
  requiredString,
  type YamlRecord,
} from './model-files';
import { FileWorkspaceLogicalEntities } from './workspace-logical-entities';

interface RelationshipRecord {
  document: YamlRecord;
  path: string;
  relationship: LogicalRelationship;
}

export class FileWorkspaceLogicalRelationships
  extends EntityList<LogicalRelationship>
  implements WorkspaceLogicalRelationships
{
  private readonly associationsDirectory: string;
  private readonly entities: FileWorkspaceLogicalEntities;

  constructor(
    private readonly workspaceId: string,
    evidenceRoot: string,
  ) {
    super();
    this.associationsDirectory = join(evidenceRoot, 'associations');
    this.entities = new FileWorkspaceLogicalEntities(workspaceId, evidenceRoot);
  }

  override async size(): Promise<number> {
    return (await this.load()).length;
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<LogicalRelationship[]> {
    return (await this.load())
      .slice(from, to)
      .map((record) => record.relationship);
  }

  protected override async findEntity(
    id: string,
  ): Promise<LogicalRelationship | null> {
    return (await this.findRecord(id))?.relationship ?? null;
  }

  async add(
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    await this.validateDescription(desc);
    const id = await this.availableId(desc);
    const document = relationshipDocument(id, desc);
    return this.writeRelationship(
      join(this.associationsDirectory, `${id}.yaml`),
      document,
    );
  }

  async update(
    relationshipId: string,
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    const record = await this.findRecord(relationshipId);
    if (!record) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    await this.validateDescription(desc);
    return this.writeRelationship(record.path, {
      ...record.document,
      id: relationshipId,
      name:
        optionalString(record.document.name) ??
        relationshipName(relationshipId),
      ...(desc.label ? { label: desc.label } : { label: undefined }),
      source: desc.source.id(),
      target: desc.target.id(),
    });
  }

  async delete(relationshipId: string): Promise<void> {
    const record = await this.findRecord(relationshipId);
    if (!record) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    try {
      await rm(record.path);
    } catch (error) {
      throw DomainError.internal(
        `delete logical relationship file ${record.path}: ${errorMessage(error)}`,
      );
    }
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<[LogicalRelationship[], number]> {
    rejectInvalidPage(page, pageSize);
    const records = await this.load();
    const offset = (page - 1) * pageSize;
    return [
      records
        .slice(offset, offset + pageSize)
        .map((record) => record.relationship),
      records.length,
    ];
  }

  private async load(): Promise<RelationshipRecord[]> {
    const paths = await listYamlFiles(this.associationsDirectory);
    const records = await Promise.all(
      paths.map((path) => this.readRelationship(path)),
    );
    records.sort((left, right) =>
      left.relationship.identity().localeCompare(right.relationship.identity()),
    );
    return records;
  }

  private async findRecord(id: string): Promise<RelationshipRecord | null> {
    return (
      (await this.load()).find(
        (record) => record.relationship.identity() === id,
      ) ?? null
    );
  }

  private async readRelationship(path: string): Promise<RelationshipRecord> {
    const document = await readYamlRecord(path, 'logical relationship');
    const id = requiredString(document, 'id', path, 'logical relationship');
    requiredString(document, 'name', path, 'logical relationship');
    const source = requiredString(
      document,
      'source',
      path,
      'logical relationship',
    );
    const target = requiredString(
      document,
      'target',
      path,
      'logical relationship',
    );

    return {
      document,
      path,
      relationship: new LogicalRelationship(id, {
        workspace: new Ref(this.workspaceId),
        source: new Ref(source),
        target: new Ref(target),
        label: optionalString(document.label),
      }),
    };
  }

  private async writeRelationship(
    path: string,
    document: YamlRecord,
  ): Promise<LogicalRelationship> {
    const compactDocument = Object.fromEntries(
      Object.entries(document).filter(([, value]) => value !== undefined),
    );
    try {
      await mkdir(this.associationsDirectory, { recursive: true });
      await writeFile(
        path,
        stringify(compactDocument, { lineWidth: 0 }),
        'utf8',
      );
    } catch (error) {
      throw DomainError.internal(
        `write logical relationship file ${path}: ${errorMessage(error)}`,
      );
    }
    return (await this.readRelationship(path)).relationship;
  }

  private async validateDescription(
    desc: LogicalRelationshipDescription,
  ): Promise<void> {
    for (const [label, endpointId] of [
      ['source', desc.source.id()],
      ['target', desc.target.id()],
    ] as const) {
      if (!(await this.entities.findByIdentity(endpointId))) {
        throw DomainError.validation(
          `logical relationship ${label} endpoint ${endpointId} not found in workspace ${this.workspaceId}`,
        );
      }
    }
  }

  private async availableId(
    desc: LogicalRelationshipDescription,
  ): Promise<string> {
    const base =
      normalizeIdentifier(
        desc.label ?? `${desc.source.id()}_${desc.target.id()}`,
      ) ?? randomUUID();
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

function relationshipDocument(
  id: string,
  desc: LogicalRelationshipDescription,
): YamlRecord {
  return {
    id,
    kind: 'association',
    name: relationshipName(id),
    ...(desc.label ? { label: desc.label } : {}),
    source: desc.source.id(),
    target: desc.target.id(),
    relationshipType: 'relates_to',
    direction: 'directed',
  };
}

function relationshipName(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function normalizeIdentifier(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || null;
}

function rejectInvalidPage(page: number, pageSize: number): void {
  if (page <= 0 || pageSize <= 0) {
    throw DomainError.validation('page and pageSize must be greater than 0');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
